#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const ROOT = path.join(__dirname, "..");

function parseArgs(argv) {
    const options = {
        runs: 5000,
        samples: 300,
        seed: 20260809,
        output: null,
        quiet: false,
        generated: true,
        lexiconData: null,
        anime: true,
        mode: "stage62",
        maxLength: null
    };
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (argument === "--runs") options.runs = Number(argv[++index]);
        else if (argument === "--samples") options.samples = Number(argv[++index]);
        else if (argument === "--seed") options.seed = Number(argv[++index]);
        else if (argument === "--output") options.output = path.resolve(argv[++index]);
        else if (argument === "--quiet") options.quiet = true;
        else if (argument === "--without-generated") options.generated = false;
        else if (argument === "--lexicon-data") {
            options.lexiconData = path.resolve(argv[++index]);
        }
        else if (argument === "--without-anime") options.anime = false;
        else if (argument === "--mode") options.mode = argv[++index];
        else if (argument === "--max-length") options.maxLength = Number(argv[++index]);
        else throw new Error("Unknown argument: " + argument);
    }
    if (!["baseline", "naturalness", "length-balance", "unknown-tail", "segment-cohesion", "stage4a8", "stage6", "stage61", "stage6.1", "stage62", "stage6.2", "stage63", "stage6.3", "stage64", "stage6.4"].includes(options.mode)) {
        throw new Error("--mode must be baseline, naturalness, length-balance, unknown-tail, segment-cohesion, stage4a8, stage6, stage61, stage62, stage63, or stage64");
    }
    return options;
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return function () {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function loadRuntime(seed, includeGenerated, includeAnime, lexiconData) {
    const math = Object.create(Math);
    math.random = seededRandom(seed);
    const quietConsole = { log() {}, warn() {}, group() {}, groupEnd() {}, error: console.error.bind(console) };
    const context = { window: {}, console: quietConsole, Math: math };
    context.window.window = context.window;
    vm.createContext(context);
    const files = [];
    if (includeGenerated) {
        files.push(lexiconData || "js/ime/ime-lexicon-data.js");
    }
    if (includeAnime) files.push("js/ime/ime-anime-overrides.js");
    files.push(
        "js/ime/ime-pos-transitions.js",
        "js/ime/ime-inflections.js",
        "js/ime/ime-local-grammar.js",
        "js/ime/ime-custom-lexicon.js",
        "js/ime/ime-lexicon.js",
        "js/ime/ime-chat-overrides.js",
        "js/random-ime.js"
    );
    const started = performance.now();
    files.forEach(file => vm.runInContext(
        fs.readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), "utf8"),
        context,
        { filename: file }
    ));
    return { context, initializationMs: performance.now() - started };
}

function round(value, digits = 4) {
    return Number(Number(value || 0).toFixed(digits));
}

function percentile(sorted, ratio) {
    if (!sorted.length) return 0;
    return sorted[Math.min(
        sorted.length - 1,
        Math.floor((sorted.length - 1) * ratio)
    )];
}

function entropy(counts, total) {
    if (!total) return 0;
    return -Array.from(counts.values()).reduce((sum, count) => {
        const probability = count / total;
        return sum + probability * Math.log2(probability);
    }, 0);
}

function generationProfile(mode, maxLength) {
    const common = { debug: false };
    if (mode === "stage4a8") {
        return Object.assign(common, {
            naturalnessEnabled: true,
            lengthBalanceEnabled: true,
            unknownTailControlEnabled: true,
            segmentCohesionEnabled: true,
            languageLayerEnabled: false,
            freeFlickWeight: 0.34,
            baseFreeFlickWeight: 0.34,
            predictionInfluence: 0.58,
            maxLength: maxLength || 22
        });
    }
    if (mode === "stage6") {
        return Object.assign(common, {
            naturalnessEnabled: true,
            lengthBalanceEnabled: true,
            unknownTailControlEnabled: true,
            segmentCohesionEnabled: true,
            languageLayerEnabled: true,
            localGrammarEnabled: false,
            completionAwareEnabled: false,
            predictionCompletionBoost: 0.08,
            predictionSelectionFloor: 0.26,
            predictionSelectionCoverage: 0.74,
            predictionLongCompletionPenalty: 0.035,
            maxLength: maxLength || 24
        });
    }
    if (["stage61", "stage6.1"].includes(mode)) {
        return Object.assign(common, {
            naturalnessEnabled: true,
            lengthBalanceEnabled: true,
            unknownTailControlEnabled: true,
            segmentCohesionEnabled: true,
            languageLayerEnabled: true,
            localGrammarEnabled: true,
            completionAwareEnabled: false,
            maxLength: maxLength || 24
        });
    }
    if (["stage62", "stage6.2"].includes(mode)) {
        return Object.assign(common, {
            naturalnessEnabled: true,
            lengthBalanceEnabled: true,
            unknownTailControlEnabled: true,
            segmentCohesionEnabled: true,
            languageLayerEnabled: true,
            localGrammarEnabled: true,
            completionAwareEnabled: true,
            maxLength: maxLength || 24
        });
    }
    if (["stage63", "stage6.3", "stage64", "stage6.4"].includes(mode)) {
        return Object.assign(common, {
            naturalnessEnabled: true,
            lengthBalanceEnabled: true,
            unknownTailControlEnabled: true,
            segmentCohesionEnabled: true,
            languageLayerEnabled: true,
            localGrammarEnabled: true,
            completionAwareEnabled: true,
            structuredStabilityEnabled: true,
            maxLength: maxLength || 24
        });
    }
    if (mode === "baseline") {
        return Object.assign(common, {
            naturalnessEnabled: false,
            lengthBalanceEnabled: false,
            unknownTailControlEnabled: false,
            segmentCohesionEnabled: false,
            maxLength: maxLength || 18
        });
    }
    if (mode === "naturalness") {
        return Object.assign(common, {
            naturalnessEnabled: true,
            lengthBalanceEnabled: false,
            unknownTailControlEnabled: false,
            segmentCohesionEnabled: false,
            maxLength: maxLength || 18,
            startKanaBiasInfluence: 0.22,
            symbolEndingChance: 0.025
        });
    }
    return Object.assign(common, {
        naturalnessEnabled: true,
        lengthBalanceEnabled: true,
        unknownTailControlEnabled:
            ["unknown-tail", "segment-cohesion"].includes(mode),
        segmentCohesionEnabled:
            mode === "segment-cohesion",
        maxLength: maxLength || 22
    });
}

function findRepresentative(results, predicate) {
    return results.filter(predicate).sort((a, b) => a.actions - b.actions)[0] || null;
}

function hasEventAfter(result, firstPredicate, laterPredicate) {
    const first = result.log.findIndex(firstPredicate);
    return first >= 0 && result.log.slice(first + 1).some(laterPredicate);
}

function isUnknownRaw(segment, lexicon) {
    return segment.source === "raw-kana" &&
        lexicon.getExact(segment.reading).length === 0;
}

function isStructuredSegment(segment, lexicon) {
    return ["dictionary", "prediction"].includes(segment.source) ||
        Boolean(
            segment.reading &&
            lexicon.getExact(segment.reading).length
        );
}

function isFunctionalSegment(segment) {
    return ["particle", "ending", "fragment", "interjection"].includes(segment.pos) ||
        ["particle", "fragment", "ending", "interjection", "chat-terminal"].includes(segment.chatCategory);
}

function isSingleKanaRawSegment(segment) {
    return segment.source === "raw-kana" &&
        segment.reading.length === 1 &&
        !isFunctionalSegment(segment);
}

function observeResult(result, lexicon, index) {
    const pureUnknownMessage =
        result.segments.some(segment => isUnknownRaw(segment, lexicon)) &&
        !result.segments.some(segment => isStructuredSegment(segment, lexicon));
    const unknownTailAfterStructuredContent = result.segments.some((segment, segmentIndex) =>
        segmentIndex < result.segments.length - 1 &&
        isStructuredSegment(segment, lexicon) &&
        result.segments.slice(segmentIndex + 1).some(later =>
            isUnknownRaw(later, lexicon)
        )
    );
    const normalThenGarbageTail = result.segments.some((segment, segmentIndex) => {
        if (
            segmentIndex >= result.segments.length - 1 ||
            !["dictionary", "prediction"].includes(segment.source)
        ) return false;
        const tail = result.segments.slice(segmentIndex + 1);
        return tail.some(later =>
            isUnknownRaw(later, lexicon) && later.reading.length >= 3
        ) || tail.some((later, tailIndex) =>
            tailIndex < tail.length - 1 &&
            isUnknownRaw(later, lexicon) &&
            isUnknownRaw(tail[tailIndex + 1], lexicon)
        );
    });
    const structuredGarbageTail = result.segments.some((segment, segmentIndex) => {
        if (
            segmentIndex >= result.segments.length - 1 ||
            !isStructuredSegment(segment, lexicon)
        ) return false;
        const tail = result.segments.slice(segmentIndex + 1);
        return tail.some(later =>
            isUnknownRaw(later, lexicon) && later.reading.length >= 3
        ) || tail.some((later, tailIndex) =>
            tailIndex < tail.length - 1 &&
            isUnknownRaw(later, lexicon) &&
            isUnknownRaw(tail[tailIndex + 1], lexicon)
        );
    });
    return {
        index: index + 1,
        text: result.text,
        pureUnknownMessage,
        unknownTailAfterStructuredContent,
        normalThenGarbageTail,
        structuredGarbageTail,
        segmentCount: result.segments.length,
        singleKanaRawSegments: result.segments.filter(
            isSingleKanaRawSegment
        ).length,
        fragmentedSegmentProxy:
            result.segments.length >= 4 ||
            result.segments.filter(isSingleKanaRawSegment).length >= 2,
        cancelledComposition: (result.cancelledCompositions || 0) > 0,
        tailBackspace: (result.tailBackspaceDecisions || 0) > 0,
        sendExisting: (result.tailSendExistingDecisions || 0) > 0,
        invalidLikeSequences: result.invalidLikeSequences || 0,
        averageTypedPrefixLength:
            result.averageTypedPrefixLength || 0
    };
}

function classifyResult(result, lexicon) {
    const unknownSegments = result.segments.filter(segment =>
        isUnknownRaw(segment, lexicon)
    );
    const structuredSegments = result.segments.filter(segment =>
        isStructuredSegment(segment, lexicon)
    );
    const incompatibleTransitions = result.segments.filter(segment =>
        segment.expectedPos && segment.posCompatibility === 0
    );
    const pureUnknown = unknownSegments.length > 0 &&
        structuredSegments.length === 0;
    const garbageTail = result.segments.some((segment, index) =>
        index < result.segments.length - 1 &&
        isStructuredSegment(segment, lexicon) &&
        result.segments.slice(index + 1).some(later =>
            isUnknownRaw(later, lexicon) && later.reading.length >= 3
        )
    );
    const fragmented = result.segments.length >= 5 ||
        result.segments.filter(isSingleKanaRawSegment).length >= 2;

    if (
        pureUnknown || garbageTail ||
        unknownSegments.length >= 2 || fragmented ||
        (result.invalidLikeSequences || 0) >= 2
    ) {
        return "C";
    }
    if (
        unknownSegments.length === 0 &&
        incompatibleTransitions.length === 0 &&
        (result.invalidLikeSequences || 0) === 0 &&
        structuredSegments.length >= Math.max(1, result.segments.length - 1) &&
        result.segments.length <= 4
    ) {
        return "A";
    }
    return "B";
}

function summarize(results, lexicon, config) {
    const totals = {
        textLength: 0,
        actions: 0,
        segments: 0,
        confirmations: 0,
        candidateSessions: 0,
        candidateMoves: 0,
        freeFlicks: 0,
        predictionBiasedFlicks: 0,
        transitionBiasedFlicks: 0,
        startBiasedFlicks: 0,
        segmentAttractedFlicks: 0,
        symbolInputs: 0,
        symbolEndings: 0,
        dictionary: 0,
        prediction: 0,
        rawKana: 0,
        katakana: 0,
        unknownRawSegments: 0,
        backspaces: 0,
        exactHitConfirmBoosts: 0,
        strongPrefixBoosts: 0,
        chatOverrideHits: 0,
        postConfirmSendBoosts: 0,
        earlyEndings: 0,
        duration: 0,
        secondSegmentAttractions: 0,
        shortSegmentContinues: 0,
        cancelledCompositions: 0,
        tailBackspaceDecisions: 0,
        tailSendExistingDecisions: 0,
        confirmedUnknownTails: 0,
        singleKanaRawSegments: 0,
        singleKanaRawContinues: 0,
        singleKanaRawRiskConfirms: 0,
        predictionSelectionAccepts: 0,
        predictionSelectionRejects: 0,
        languageGuidedFlicks: 0,
        posTransitionUses: 0,
        posTransitionMatches: 0,
        posTransitionDeviations: 0,
        languagePathContinues: 0,
        inflectionUses: 0,
        particleContinuations: 0,
        endingContinuations: 0,
        invalidGrammarAccepts: 0,
        invalidGrammarRejects: 0,
        invalidLikeSequences: 0,
        typedPrefixTotal: 0,
        typedPrefixSamples: 0
    };
    const safety = {
        emptyOutputs: 0,
        overMaxLength: 0,
        overMaxSteps: 0,
        nonSentFinalState: 0,
        candidateExitFailures: 0,
        confirmSendCollision: 0,
        exceptions: 0
    };
    let oneCharacterMessages = 0;
    let earlyEndingMessages = 0;
    let normalThenUnknown = 0;
    let normalThenGarbageTail = 0;
    let structuredThenUnknown = 0;
    let structuredGarbageTail = 0;
    let terminalDirectSends = 0;
    let negativeChatSelections = 0;
    let pureUnknownMessages = 0;
    const frequencies = new Map();
    const predictionSelections = new Map();
    const posTransitions = new Map();
    const particleTransitions = new Map();
    const inflections = new Map();
    const completionStates = {
        HIGH: { send: 0, continue: 0 },
        MEDIUM: { send: 0, continue: 0 },
        LOW: { send: 0, continue: 0 }
    };
    const completionBoundaries = new Map();
    const inflectionCompletion = new Map();
    const qualityClasses = { A: 0, B: 0, C: 0 };
    const startCharacters = new Map();
    const lengths = [];
    const durations = [];
    const lengthBins = {
        one: 0,
        twoToFive: 0,
        sixToTen: 0,
        elevenToSixteen: 0,
        seventeenPlus: 0
    };
    const targetLengthBins = {
        twoToFive: 0,
        sixToEighteen: 0,
        nineteenToTwentyFour: 0,
        other: 0
    };
    const segmentBins = {
        one: 0,
        two: 0,
        three: 0,
        four: 0,
        fivePlus: 0
    };
    const segmentSources = {
        dictionary: 0,
        prediction: 0,
        raw: 0,
        katakana: 0,
        unknown: 0,
        particleOrFragment: 0
    };

    results.forEach(result => {
        if (!result.text) safety.emptyOutputs++;
        if (result.text.length > config.maxLength) safety.overMaxLength++;
        if (result.actions > config.maxSteps) safety.overMaxSteps++;
        if (result.finalState !== "SENT") safety.nonSentFinalState++;
        if (result.finalState !== "SENT" && result.candidateSessions) safety.candidateExitFailures++;
        const confirmSteps = new Set(result.log.filter(event => event.type === "confirm").map(event => event.step));
        if (result.log.some(event => event.type === "send" && confirmSteps.has(event.step))) {
            safety.confirmSendCollision++;
        }

        totals.textLength += result.text.length;
        totals.actions += result.actions;
        totals.segments += result.segments.length;
        totals.confirmations += result.confirmations;
        totals.candidateSessions += result.candidateSessions;
        totals.candidateMoves += result.candidateMoves;
        totals.freeFlicks += result.freeFlicks;
        totals.predictionBiasedFlicks += result.predictionBiasedFlicks;
        totals.transitionBiasedFlicks += result.transitionBiasedFlicks;
        totals.startBiasedFlicks += result.startBiasedFlicks || 0;
        totals.segmentAttractedFlicks += result.segmentAttractedFlicks || 0;
        totals.symbolInputs += result.symbolInputs;
        totals.symbolEndings += result.symbolEndings || 0;
        totals.dictionary += result.confirmationSources.dictionary;
        totals.prediction += result.confirmationSources.prediction;
        totals.rawKana += result.confirmationSources["raw-kana"];
        totals.katakana += result.confirmationSources.katakana;
        totals.exactHitConfirmBoosts += result.exactHitConfirmBoosts || 0;
        totals.strongPrefixBoosts += result.strongPrefixBoosts || 0;
        totals.chatOverrideHits += result.chatOverrideHits || 0;
        totals.postConfirmSendBoosts += result.postConfirmSendBoosts || 0;
        totals.earlyEndings += result.earlyEndings || 0;
        totals.duration += result.duration;
        totals.secondSegmentAttractions += result.secondSegmentAttractions || 0;
        totals.shortSegmentContinues += result.shortSegmentContinues || 0;
        totals.cancelledCompositions += result.cancelledCompositions || 0;
        totals.tailBackspaceDecisions += result.tailBackspaceDecisions || 0;
        totals.tailSendExistingDecisions += result.tailSendExistingDecisions || 0;
        totals.confirmedUnknownTails += result.confirmedUnknownTails || 0;
        totals.singleKanaRawContinues += result.singleKanaRawContinues || 0;
        totals.singleKanaRawRiskConfirms += result.singleKanaRawRiskConfirms || 0;
        totals.predictionSelectionAccepts += result.predictionSelectionAccepts || 0;
        totals.predictionSelectionRejects += result.predictionSelectionRejects || 0;
        totals.languageGuidedFlicks += result.languageGuidedFlicks || 0;
        totals.posTransitionUses += result.posTransitionUses || 0;
        totals.posTransitionMatches += result.posTransitionMatches || 0;
        totals.posTransitionDeviations += result.posTransitionDeviations || 0;
        totals.languagePathContinues += result.languagePathContinues || 0;
        totals.inflectionUses += result.inflectionUses || 0;
        totals.particleContinuations += result.particleContinuations || 0;
        totals.endingContinuations += result.endingContinuations || 0;
        totals.invalidGrammarAccepts += result.invalidGrammarAccepts || 0;
        totals.invalidGrammarRejects += result.invalidGrammarRejects || 0;
        totals.invalidLikeSequences += result.invalidLikeSequences || 0;
        Object.entries(result.posTransitionCounts || {}).forEach(([key, count]) => {
            posTransitions.set(key, (posTransitions.get(key) || 0) + count);
        });
        Object.entries(result.inflectionCounts || {}).forEach(([key, count]) => {
            inflections.set(key, (inflections.get(key) || 0) + count);
        });
        Object.entries(result.particleTransitionCounts || {}).forEach(([key, count]) => {
            particleTransitions.set(key, (particleTransitions.get(key) || 0) + count);
        });
        Object.entries(result.completionDecisions || {}).forEach(([state, counts]) => {
            if (!completionStates[state]) return;
            completionStates[state].send += counts.send || 0;
            completionStates[state].continue += counts.continue || 0;
        });
        Object.entries(result.completionBoundaryDecisions || {}).forEach(([key, counts]) => {
            const current = completionBoundaries.get(key) || { send: 0, continue: 0 };
            current.send += counts.send || 0;
            current.continue += counts.continue || 0;
            completionBoundaries.set(key, current);
        });
        Object.entries(result.inflectionCompletionDecisions || {}).forEach(([key, counts]) => {
            const current = inflectionCompletion.get(key) || { send: 0, continue: 0 };
            current.send += counts.send || 0;
            current.continue += counts.continue || 0;
            inflectionCompletion.set(key, current);
        });
        qualityClasses[classifyResult(result, lexicon)]++;
        result.log.forEach(event => {
            if (event.type === "backspace") totals.backspaces++;
        });
        result.segments.forEach(segment => {
            totals.typedPrefixTotal += segment.typedPrefixLength || 0;
            totals.typedPrefixSamples++;
            if (isUnknownRaw(segment, lexicon)) totals.unknownRawSegments++;
            if (isSingleKanaRawSegment(segment)) totals.singleKanaRawSegments++;
            if ((segment.chatWeight || 0) < 0) negativeChatSelections++;
            if (segment.source === "dictionary") segmentSources.dictionary++;
            if (segment.source === "prediction") {
                segmentSources.prediction++;
                predictionSelections.set(
                    segment.text,
                    (predictionSelections.get(segment.text) || 0) + 1
                );
            }
            if (segment.source === "raw-kana") segmentSources.raw++;
            if (segment.source === "katakana") segmentSources.katakana++;
            if (isUnknownRaw(segment, lexicon)) segmentSources.unknown++;
            if (isFunctionalSegment(segment)) segmentSources.particleOrFragment++;
        });
        if (result.text.length === 1) oneCharacterMessages++;
        if (result.segments.length === 1) segmentBins.one++;
        else if (result.segments.length === 2) segmentBins.two++;
        else if (result.segments.length === 3) segmentBins.three++;
        else if (result.segments.length === 4) segmentBins.four++;
        else segmentBins.fivePlus++;
        if (
            result.segments.some(segment => isUnknownRaw(segment, lexicon)) &&
            !result.segments.some(segment => isStructuredSegment(segment, lexicon))
        ) {
            pureUnknownMessages++;
        }
        lengths.push(result.text.length);
        durations.push(result.duration);
        if (result.text.length === 1) lengthBins.one++;
        else if (result.text.length <= 5) lengthBins.twoToFive++;
        else if (result.text.length <= 10) lengthBins.sixToTen++;
        else if (result.text.length <= 16) lengthBins.elevenToSixteen++;
        else lengthBins.seventeenPlus++;
        if (result.text.length >= 2 && result.text.length <= 5) targetLengthBins.twoToFive++;
        else if (result.text.length >= 6 && result.text.length <= 18) targetLengthBins.sixToEighteen++;
        else if (result.text.length >= 19 && result.text.length <= 24) targetLengthBins.nineteenToTwentyFour++;
        else targetLengthBins.other++;
        const firstCharacter = Array.from(result.text)[0] || "";
        startCharacters.set(
            firstCharacter,
            (startCharacters.get(firstCharacter) || 0) + 1
        );
        if (result.text.length < config.maxLength * 0.5) earlyEndingMessages++;
        if (
            result.segments.some((segment, index) =>
                index < result.segments.length - 1 &&
                ["dictionary", "prediction"].includes(segment.source) &&
                result.segments.slice(index + 1).some(later => isUnknownRaw(later, lexicon))
            )
        ) normalThenUnknown++;
        if (
            result.segments.some((segment, index) => {
                if (
                    index >= result.segments.length - 1 ||
                    !["dictionary", "prediction"].includes(segment.source)
                ) return false;
                const tail = result.segments.slice(index + 1);
                return tail.some(later =>
                    isUnknownRaw(later, lexicon) && later.reading.length >= 3
                ) || tail.some((later, tailIndex) =>
                    tailIndex < tail.length - 1 &&
                    isUnknownRaw(later, lexicon) &&
                    isUnknownRaw(tail[tailIndex + 1], lexicon)
                );
            })
        ) normalThenGarbageTail++;
        if (
            result.segments.some((segment, index) =>
                index < result.segments.length - 1 &&
                isStructuredSegment(segment, lexicon) &&
                result.segments.slice(index + 1).some(later =>
                    isUnknownRaw(later, lexicon)
                )
            )
        ) structuredThenUnknown++;
        if (
            result.segments.some((segment, index) => {
                if (
                    index >= result.segments.length - 1 ||
                    !isStructuredSegment(segment, lexicon)
                ) return false;
                const tail = result.segments.slice(index + 1);
                return tail.some(later =>
                    isUnknownRaw(later, lexicon) && later.reading.length >= 3
                ) || tail.some((later, tailIndex) =>
                    tailIndex < tail.length - 1 &&
                    isUnknownRaw(later, lexicon) &&
                    isUnknownRaw(tail[tailIndex + 1], lexicon)
                );
            })
        ) structuredGarbageTail++;
        if (result.log.some(event =>
            event.type === "post-confirm-decision" &&
            event.sendBoost > 0 && event.result === false
        )) terminalDirectSends++;
        frequencies.set(result.text, (frequencies.get(result.text) || 0) + 1);
    });

    const flickTotal = totals.languageGuidedFlicks + totals.freeFlicks + totals.predictionBiasedFlicks +
        totals.transitionBiasedFlicks + totals.startBiasedFlicks +
        totals.segmentAttractedFlicks;
    const confirmationTotal = Math.max(1, totals.confirmations);
    const topRepeats = Array.from(frequencies.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 10)
        .map(([text, count]) => ({ text, count }));
    const sortedLengths = lengths.slice().sort((a, b) => a - b);
    const sortedDurations = durations.slice().sort((a, b) => a - b);
    const topStartCharacters = Array.from(startCharacters.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 20)
        .map(([character, count]) => ({
            character,
            count,
            rate: round(count / results.length)
        }));
    const predictionSelectionTotal = Array.from(
        predictionSelections.values()
    ).reduce((sum, count) => sum + count, 0);
    const topPredictionSelections = Array.from(
        predictionSelections.entries()
    ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 30)
        .map(([text, count]) => ({
            text,
            count,
            rate: round(count / Math.max(1, predictionSelectionTotal))
        }));

    return {
        runs: results.length,
        safety,
        totals,
        averages: {
            length: round(totals.textLength / results.length, 3),
            actions: round(totals.actions / results.length, 3),
            segments: round(totals.segments / results.length, 3),
            duration: round(totals.duration / results.length, 3)
        },
        percentiles: {
            lengthP50: percentile(sortedLengths, 0.5),
            lengthP75: percentile(sortedLengths, 0.75),
            lengthP90: percentile(sortedLengths, 0.9),
            durationP50: percentile(sortedDurations, 0.5),
            durationP95: percentile(sortedDurations, 0.95),
            durationMax: percentile(sortedDurations, 1)
        },
        lengthDistribution: Object.fromEntries(
            Object.entries(lengthBins).map(([key, count]) => [key, {
                count,
                rate: round(count / results.length)
            }])
        ),
        targetLengthDistribution: Object.fromEntries(
            Object.entries(targetLengthBins).map(([key, count]) => [key, {
                count,
                rate: round(count / results.length)
            }])
        ),
        segmentDistribution: Object.fromEntries(
            Object.entries(segmentBins).map(([key, count]) => [key, {
                count,
                rate: round(count / results.length)
            }])
        ),
        segmentFourPlus: {
            count: segmentBins.four + segmentBins.fivePlus,
            rate: round(
                (segmentBins.four + segmentBins.fivePlus) /
                    results.length
            )
        },
        segmentSources,
        qualityClassification: Object.fromEntries(
            Object.entries(qualityClasses).map(([key, count]) => [key, {
                count,
                rate: round(count / results.length)
            }])
        ),
        posTransitions: {
            uses: totals.posTransitionUses,
            matches: totals.posTransitionMatches,
            deviations: totals.posTransitionDeviations,
            matchRate: round(
                totals.posTransitionMatches /
                    Math.max(1, totals.posTransitionUses)
            ),
            top20: Array.from(posTransitions.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 20)
                .map(([transition, count]) => ({ transition, count }))
        },
        localGrammar: {
            invalidLikeSequences: totals.invalidLikeSequences,
            invalidLikeRatePerMessage: round(
                totals.invalidLikeSequences / results.length
            ),
            rejectedCandidates: totals.invalidGrammarRejects,
            acceptedCandidates: totals.invalidGrammarAccepts,
            averageTypedPrefixLength: round(
                totals.typedPrefixTotal /
                    Math.max(1, totals.typedPrefixSamples)
            ),
            particleTransitions: Array.from(particleTransitions.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 30)
                .map(([transition, count]) => ({ transition, count }))
        },
        inflections: {
            uses: totals.inflectionUses,
            ratePerMessage: round(totals.inflectionUses / results.length),
            byType: Object.fromEntries(
                Array.from(inflections.entries()).sort((a, b) => b[1] - a[1])
            )
        },
        completion: {
            states: Object.fromEntries(Object.entries(completionStates).map(([state, counts]) => {
                const total = counts.send + counts.continue;
                return [state, Object.assign({}, counts, {
                    sendRate: round(counts.send / Math.max(1, total))
                })];
            })),
            boundaries: Object.fromEntries(Array.from(completionBoundaries.entries()).map(([key, counts]) => {
                const total = counts.send + counts.continue;
                return [key, Object.assign({}, counts, {
                    sendRate: round(counts.send / Math.max(1, total))
                })];
            })),
            inflections: Object.fromEntries(Array.from(inflectionCompletion.entries()).map(([key, counts]) => {
                const total = counts.send + counts.continue;
                return [key, Object.assign({}, counts, {
                    sendRate: round(counts.send / Math.max(1, total)),
                    continuationRate: round(counts.continue / Math.max(1, total))
                })];
            }))
        },
        rates: {
            languageGuidedFlick: round(totals.languageGuidedFlicks / Math.max(1, flickTotal)),
            freeFlick: round(totals.freeFlicks / Math.max(1, flickTotal)),
            predictionBiasedFlick: round(totals.predictionBiasedFlicks / Math.max(1, flickTotal)),
            transitionBiasedFlick: round(totals.transitionBiasedFlicks / Math.max(1, flickTotal)),
            startBiasedFlick: round(totals.startBiasedFlicks / Math.max(1, flickTotal)),
            segmentAttractedFlick: round(totals.segmentAttractedFlicks / Math.max(1, flickTotal)),
            exactConversion: round(totals.dictionary / confirmationTotal),
            predictionSelected: round(totals.prediction / confirmationTotal),
            rawKana: round(totals.rawKana / confirmationTotal),
            katakana: round(totals.katakana / confirmationTotal),
            unknownRaw: round(totals.unknownRawSegments / confirmationTotal),
            singleKanaRawSegment: round(
                totals.singleKanaRawSegments / confirmationTotal
            ),
            predictionSelectionAcceptance: round(
                totals.predictionSelectionAccepts /
                    Math.max(
                        1,
                        totals.predictionSelectionAccepts +
                            totals.predictionSelectionRejects
                    )
            ),
            earlyEnding: round(earlyEndingMessages / results.length),
            boostedEarlyEnding: round(totals.earlyEndings / results.length),
            symbolEnding: round(totals.symbolEndings / results.length),
            oneCharacterMessage: round(oneCharacterMessages / results.length),
            normalThenUnknown: round(normalThenUnknown / results.length),
            unknownTailAfterStructuredContent: round(structuredThenUnknown / results.length),
            normalThenGarbageTail: round(normalThenGarbageTail / results.length),
            structuredGarbageTail: round(structuredGarbageTail / results.length),
            terminalDirectSend: round(terminalDirectSends / results.length),
            negativeChatSelection: round(negativeChatSelections / confirmationTotal),
            pureUnknownMessage: round(pureUnknownMessages / results.length)
        },
        diversity: {
            uniqueTexts: frequencies.size,
            uniqueRatio: round(frequencies.size / results.length),
            topRepeats
        },
        predictionDiversity: {
            totalSelections: predictionSelectionTotal,
            uniqueTexts: predictionSelections.size,
            uniqueRatio: round(
                predictionSelections.size /
                    Math.max(1, predictionSelectionTotal)
            ),
            entropyBits: round(
                entropy(predictionSelections, predictionSelectionTotal),
                4
            ),
            top30: topPredictionSelections
        },
        starts: {
            entropyBits: round(entropy(startCharacters, results.length), 4),
            uniqueStartCharacters: startCharacters.size,
            top20: topStartCharacters
        }
    };
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const loaded = loadRuntime(
        options.seed,
        options.generated,
        options.anime,
        options.lexiconData
    );
    const ime = loaded.context.window.RandomIME;
    const lexicon = loaded.context.window.RandomIMELexicon;
    const generateOptions = generationProfile(
        options.mode,
        options.maxLength
    );
    const results = [];
    const timings = [];
    for (let index = 0; index < options.runs + options.samples; index++) {
        const started = performance.now();
        results.push(ime.generate(generateOptions));
        timings.push(performance.now() - started);
    }
    const stress = results.slice(0, options.runs);
    const sampleResults = results.slice(options.runs);
    function normalSegment(segment) {
        return isStructuredSegment(segment, lexicon);
    }
    const representatives = {
        singleKanaRiskContinues: findRepresentative(results, result =>
            result.log.some(event =>
                event.type === "segment-cohesion" &&
                event.singleKanaRawRisk
            ) && result.log.some(event =>
                event.type === "segment-cohesion-decision" &&
                event.typedPrefixLength === 1 &&
                event.selected === "continue-flick"
            )
        ),
        functionalSingleKanaConfirmed: findRepresentative(results, result =>
            result.segments.some((segment, index) =>
                index > 0 &&
                segment.typedReading.length === 1 &&
                segment.pos === "particle" &&
                result.segments.slice(0, index).some(normalSegment)
            )
        ),
        strongPrefixContinues: findRepresentative(results, result =>
            result.log.some(event =>
                event.type === "segment-cohesion" &&
                event.strongPrefix &&
                event.typedPrefixLength >= 2 &&
                result.log.some(decision =>
                    decision.step === event.step &&
                    decision.type === "segment-cohesion-decision" &&
                    decision.selected === "continue-flick"
                )
            )
        ),
        shortPrefixPredictionSelected: findRepresentative(results, result =>
            result.log.some(event =>
                event.type === "prediction-selection-balance" &&
                event.accepted &&
                event.typedPrefixLength === 1 &&
                event.completionLength >= 2
            )
        ),
        longerPrefixPredictionSelected: findRepresentative(results, result =>
            result.log.some(event =>
                event.type === "prediction-selection-balance" &&
                event.accepted &&
                event.typedPrefixLength >= 2 &&
                event.completionLength >= 1
            )
        ),
        twoStructuredThenSend: findRepresentative(results, result =>
            result.segments.length === 2 &&
            result.text.length >= 5 &&
            result.segments.every(segment => segment.reading.length >= 2) &&
            result.segments.every(normalSegment) &&
            result.log.some(event =>
                event.type === "post-confirm-decision" &&
                event.result === false
            )
        ),
        thirdSegmentStopsFourth: findRepresentative(results, result =>
            result.segments.length === 3 &&
            result.text.length >= 6 && result.text.length <= 16 &&
            result.segments.every(normalSegment) &&
            result.segments.filter(segment =>
                ["dictionary", "prediction"].includes(segment.source)
            ).length >= 2 &&
            result.log.some(event =>
                event.type === "continuation-adjustments" &&
                event.cohesionSegmentDecay > 0
            ) && result.log.some(event =>
                event.type === "post-confirm-decision" &&
                event.result === false
            )
        ),
        pureUnknownFreeMessage: findRepresentative(results, result =>
            result.freeFlicks > 0 &&
            result.predictionBiasedFlicks === 0 &&
            result.transitionBiasedFlicks === 0 &&
            result.startBiasedFlicks === 0 &&
            result.segmentAttractedFlicks === 0 &&
            result.segments.some(segment =>
                isUnknownRaw(segment, lexicon) &&
                segment.reading.length >= 3
            ) &&
            !result.segments.some(normalSegment)
        ),
        nounParticleVerb: findRepresentative(results, result =>
            result.segments.some((segment, index) => {
                const a = segment.pos === "proper-noun" ? "noun" : segment.pos;
                const b = result.segments[index + 1];
                const c = result.segments[index + 2];
                return a === "noun" && b && b.pos === "particle" && c && c.pos === "verb";
            })
        ),
        verbEnding: findRepresentative(results, result =>
            result.segments.some((segment, index) =>
                segment.pos === "verb" && result.segments[index + 1] &&
                ["ending", "auxiliary", "fragment"].includes(result.segments[index + 1].pos)
            )
        ),
        adjectiveEnding: findRepresentative(results, result =>
            result.segments.some((segment, index) =>
                segment.pos === "adjective" && result.segments[index + 1] &&
                ["ending", "auxiliary", "fragment"].includes(result.segments[index + 1].pos)
            )
        ),
        interjectionOrFragment: findRepresentative(results, result =>
            result.segments.some(segment => ["interjection", "fragment"].includes(segment.pos))
        ),
        verbInflection: findRepresentative(results, result =>
            result.segments.some(segment => segment.pos === "verb" && segment.inflectionType)
        ),
        adjectiveInflection: findRepresentative(results, result =>
            result.segments.some(segment => segment.pos === "adjective" && segment.inflectionType)
        ),
        animeInSentence: findRepresentative(results, result =>
            result.segments.length >= 2 && result.segments.some(segment => segment.anime)
        ),
        freeFlickDeviation: findRepresentative(results, result =>
            result.freeFlicks > 0 && result.segments.some(normalSegment) &&
            classifyResult(result, lexicon) !== "C"
        ),
        pureUnknown: findRepresentative(results, result =>
            result.segments.some(segment => isUnknownRaw(segment, lexicon)) &&
            !result.segments.some(normalSegment)
        ),
        obviousRandom: findRepresentative(results, result =>
            classifyResult(result, lexicon) === "C"
        )
    };
    const unknownReading = "\u306c\u3078\u3089\u3082";
    const unknownCandidates = ime.getCandidates(unknownReading, generateOptions).map(item => item.text);
    const sortedTimings = timings.slice(0, options.runs).sort((a, b) => a - b);
    const report = {
        mode: options.mode,
        seed: options.seed,
        version: ime.version,
        options: generateOptions,
        lexicon: {
            runtimeEntries: lexicon.entries.length,
            runtimeInflectedEntries:
                (lexicon.inflectedEntries || []).length,
            runtimeUniqueReadings: new Set(lexicon.entries.map(entry => entry.reading)).size
        },
        performance: {
            initializationMs: round(loaded.initializationMs, 3),
            generateAverageMs: round(sortedTimings.reduce((sum, value) => sum + value, 0) / sortedTimings.length),
            generateP95Ms: round(sortedTimings[Math.floor(sortedTimings.length * 0.95)]),
            generateMaxMs: round(sortedTimings[sortedTimings.length - 1])
        },
        stress: summarize(stress, lexicon, {
            maxLength: generateOptions.maxLength,
            maxSteps: ime.defaultOptions.maxSteps
        }),
        unknownReading: {
            reading: unknownReading,
            candidates: unknownCandidates,
            hasRawKana: unknownCandidates.includes(unknownReading),
            hasKatakana: unknownCandidates.includes("\u30cc\u30d8\u30e9\u30e2")
        },
        samples: sampleResults.map(result => result.text),
        continuousFirst100: stress.slice(0, 100).map(result => result.text),
        qualityClasses: sampleResults.map(result =>
            classifyResult(result, lexicon)
        ),
        sampleObservations: sampleResults.map((result, index) =>
            observeResult(result, lexicon, index)
        ),
        sampleMetrics: summarize(sampleResults, lexicon, {
            maxLength: generateOptions.maxLength,
            maxSteps: ime.defaultOptions.maxSteps
        }),
        representatives
    };
    const json = JSON.stringify(report, null, 2);
    if (options.output) {
        fs.mkdirSync(path.dirname(options.output), { recursive: true });
        fs.writeFileSync(options.output, json + "\n", "utf8");
    }
    if (!options.quiet) console.log(json);
}

main();
