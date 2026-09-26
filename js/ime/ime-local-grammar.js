(function () {
    "use strict";

    // Local, semantic-blind Japanese cohesion rules. These rules inspect only
    // RandomIME's own already-confirmed segments, POS labels and morphology.
    // They never inspect chat messages and never prescribe a sentence shape.

    const POS = window.RandomIMEPOSTransitions || null;
    const CORE_PARTICLES = new Set([
        "は", "が", "を", "に", "で", "と", "も", "の", "へ",
        "から", "まで", "より", "だけ", "しか", "って", "とか",
        "ので", "のに"
    ]);
    const CLAUSE_PARTICLES = new Set([
        "から", "けど", "ので", "のに", "って", "とか", "と",
        "まで", "なら", "たら", "ながら"
    ]);
    const ENDINGS = new Set([
        "ね", "よ", "よね", "かな", "かも", "けど", "から",
        "ので", "の", "んだ", "んだけど"
    ]);
    const PARTICLE_PAIRS = new Set([
        "に→も", "に→は", "で→も", "で→は", "と→も", "と→は",
        "から→も", "から→の", "から→まで", "まで→に", "まで→も",
        "より→も", "より→は"
    ]);
    const ENDING_PAIRS = new Set([
        "かも→ね", "よ→ね", "けど→ね", "んだ→よ", "んだ→ね"
    ]);
    const MORPHOLOGY_MARKERS = Object.freeze({
        tai: ["たい"],
        negative: ["ない"],
        "te-form": ["て", "で"],
        "progressive-casual": ["てる", "でる"],
        "past-progressive-casual": ["てた", "でた"],
        past: ["た", "だ"],
        "te-continuation": ["くて"]
    });

    function normalizePos(value) {
        return POS ? POS.normalizePos(value) : String(value || "unknown");
    }

    function lastSegment(segments) {
        return Array.isArray(segments) && segments.length ?
            segments[segments.length - 1] : null;
    }

    function candidateText(candidate) {
        return String(candidate && (candidate.text || candidate.reading) || "");
    }

    function morphologyRepeats(previous, candidate) {
        if (!previous || !previous.inflectionType) return false;
        const markers = MORPHOLOGY_MARKERS[previous.inflectionType] || [];
        const next = candidateText(candidate);
        return markers.some(function (marker) {
            return next === marker || next.startsWith(marker);
        });
    }

    function evaluateCandidate(segments, candidate) {
        const previous = lastSegment(segments);
        const currentPos = normalizePos(candidate && candidate.pos);
        const currentText = candidateText(candidate);
        let multiplier = 1;
        const reasons = [];
        let invalidLike = false;
        let particleTransition = null;

        if (!previous) {
            if (currentPos === "particle") {
                const discourseStart = ["でも", "けど", "なら"].includes(currentText);
                multiplier *= discourseStart ? 0.58 : 0.1;
                invalidLike = !discourseStart;
                reasons.push(discourseStart ? "discourse-particle-start" : "particle-at-start");
            } else if (currentPos === "ending" || currentPos === "auxiliary") {
                multiplier *= 0.16;
                invalidLike = true;
                reasons.push("ending-at-start");
            }
            return { multiplier, scoreAdjustment: Math.log(multiplier), invalidLike, reasons, particleTransition };
        }

        const previousPos = normalizePos(previous.pos);
        const previousText = String(previous.text || previous.reading || "");

        if (previousText && previousText === currentText) {
            multiplier *= 0.08;
            invalidLike = true;
            reasons.push("immediate-repeat");
        }

        if (previousPos === "particle") {
            particleTransition = previousText + "→" + currentText;
            if (currentPos === "particle") {
                const allowed = PARTICLE_PAIRS.has(particleTransition);
                multiplier *= allowed ? 0.62 : 0.11;
                invalidLike = !allowed;
                reasons.push(allowed ? "allowed-particle-pair" : "stacked-particle");
            } else if (["noun", "pronoun", "verb", "adjective", "adverb"].includes(currentPos)) {
                multiplier *= 1.22;
                reasons.push("particle-content-continuation");
            } else if (["ending", "auxiliary"].includes(currentPos)) {
                multiplier *= 0.18;
                invalidLike = true;
                reasons.push("particle-ending-boundary");
            }
        }

        if (["noun", "pronoun"].includes(previousPos) && currentPos === "particle") {
            multiplier *= CORE_PARTICLES.has(currentText) ? 1.3 : 1.05;
            reasons.push("nominal-particle");
        }

        if (previousPos === "verb" && currentPos === "particle") {
            const allowed = CLAUSE_PARTICLES.has(currentText);
            multiplier *= allowed ? 1.08 : 0.34;
            invalidLike = invalidLike || (!allowed && ["を", "が", "へ"].includes(currentText));
            reasons.push(allowed ? "verb-clause-particle" : "verb-particle-weak");
        }

        if (previousPos === "adjective" && currentPos === "particle") {
            const allowed = new Set(["けど", "から", "ので", "のに", "って", "とか", "と", "も"]);
            multiplier *= allowed.has(currentText) ? 1.08 : 0.3;
            invalidLike = invalidLike || ["を", "へ"].includes(currentText);
            reasons.push(allowed.has(currentText) ? "adjective-clause-particle" : "adjective-particle-weak");
        }

        if (previousPos === "adverb") {
            if (["verb", "adjective"].includes(currentPos)) {
                multiplier *= 1.28;
                reasons.push("adverb-predicate");
            } else if (["particle", "ending", "auxiliary"].includes(currentPos)) {
                multiplier *= 0.3;
                reasons.push("adverb-boundary-weak");
            }
        }

        if (previousPos === "ending" && currentPos === "ending") {
            const pair = previousText + "→" + currentText;
            const allowed = ENDING_PAIRS.has(pair);
            multiplier *= allowed ? 0.58 : 0.09;
            invalidLike = !allowed;
            reasons.push(allowed ? "allowed-ending-pair" : "stacked-ending");
        } else if (previousPos === "ending" && currentPos === "particle") {
            multiplier *= 0.2;
            reasons.push("ending-particle-boundary");
        }

        if (morphologyRepeats(previous, candidate)) {
            multiplier *= 0.07;
            invalidLike = true;
            reasons.push("repeated-inflection-function");
        }

        if (
            previous.inflectionType &&
            ["ending", "auxiliary"].includes(currentPos) &&
            ["たい", "ない", "てる", "てた"].some(function (marker) {
                return currentText === marker;
            })
        ) {
            multiplier *= 0.12;
            invalidLike = true;
            reasons.push("inflection-auxiliary-duplicate");
        }

        if (
            previousPos === "fragment" &&
            previous.fragmentTerminal >= 0.7 &&
            ["particle", "auxiliary"].includes(currentPos)
        ) {
            multiplier *= 0.3;
            reasons.push("terminal-fragment-boundary");
        }

        if (currentPos === "ending" && !ENDINGS.has(currentText)) {
            multiplier *= 0.78;
        }

        multiplier = Math.max(0.03, Math.min(1.5, multiplier));
        return {
            multiplier,
            scoreAdjustment: Math.log(multiplier) * 0.32,
            invalidLike,
            reasons,
            particleTransition
        };
    }

    function getTransitionWeights(previous, recentSegments) {
        const base = POS ? POS.getWeights(previous ? previous.pos : null) : [];
        const previousPos = previous ? normalizePos(previous.pos) : null;
        return base.map(function (item) {
            let multiplier = 1;
            if (!previous && ["particle", "ending", "auxiliary"].includes(item.pos)) multiplier *= 0.1;
            if (previousPos === "particle" && ["particle", "ending", "auxiliary"].includes(item.pos)) multiplier *= 0.12;
            if (previousPos === "ending" && ["ending", "particle", "auxiliary"].includes(item.pos)) multiplier *= 0.18;
            if (previousPos === "adverb" && ["verb", "adjective"].includes(item.pos)) multiplier *= 1.25;
            if (previous && previous.inflectionType && item.pos === "auxiliary") multiplier *= 0.28;
            if (Array.isArray(recentSegments) && recentSegments.length >= 2) {
                const lastTwo = recentSegments.slice(-2).map(function (segment) {
                    return normalizePos(segment.pos);
                });
                if (lastTwo[0] === item.pos && lastTwo[1] === item.pos) multiplier *= 0.22;
            }
            return { pos: item.pos, weight: Math.max(0.005, item.weight * multiplier) };
        });
    }

    function chooseNext(previous, recentSegments, random) {
        const weights = getTransitionWeights(previous, recentSegments);
        const total = weights.reduce(function (sum, item) { return sum + item.weight; }, 0);
        let cursor = (typeof random === "function" ? random() : Math.random()) * total;
        for (const item of weights) {
            cursor -= item.weight;
            if (cursor <= 0) return item.pos;
        }
        return weights.length ? weights[weights.length - 1].pos : "unknown";
    }

    window.RandomIMELocalGrammar = Object.freeze({
        version: "1.0.0",
        evaluateCandidate,
        getTransitionWeights,
        chooseNext,
        morphologyRepeats
    });
})();
