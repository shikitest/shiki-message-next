(function () {
    "use strict";

    // Probabilistic Japanese POS adjacency rules for RandomIME.
    // This module knows grammatical categories only. It never receives text
    // from the chat, never assigns meaning, and never stores sentence shapes.

    const ALIASES = Object.freeze({
        "proper-noun": "noun",
        time: "noun",
        other: "unknown",
        "raw-kana": "unknown"
    });

    const TRANSITIONS = Object.freeze({
        START: Object.freeze([
            ["fragment", 1.15],
            ["interjection", 0.9],
            ["noun", 1.35],
            ["pronoun", 0.9],
            ["adverb", 0.82],
            ["adjective", 0.72],
            ["verb", 0.72],
            ["conjunction", 0.48],
            ["unknown", 0.09]
        ]),
        noun: Object.freeze([
            ["particle", 1.8],
            ["ending", 0.72],
            ["auxiliary", 0.58],
            ["noun", 0.52],
            ["verb", 0.44],
            ["adjective", 0.4],
            ["fragment", 0.3],
            ["unknown", 0.08]
        ]),
        pronoun: Object.freeze([
            ["particle", 1.85],
            ["noun", 0.42],
            ["verb", 0.48],
            ["adjective", 0.4],
            ["ending", 0.45],
            ["fragment", 0.25],
            ["unknown", 0.07]
        ]),
        particle: Object.freeze([
            ["noun", 1.25],
            ["verb", 1.35],
            ["adjective", 0.9],
            ["adverb", 0.62],
            ["pronoun", 0.58],
            ["fragment", 0.25],
            ["unknown", 0.08]
        ]),
        verb: Object.freeze([
            ["ending", 1.4],
            ["auxiliary", 1.15],
            ["particle", 0.78],
            ["fragment", 0.72],
            ["conjunction", 0.38],
            ["noun", 0.22],
            ["verb", 0.22],
            ["unknown", 0.07]
        ]),
        adjective: Object.freeze([
            ["ending", 1.45],
            ["particle", 0.82],
            ["auxiliary", 0.65],
            ["fragment", 0.75],
            ["conjunction", 0.32],
            ["noun", 0.24],
            ["adjective", 0.2],
            ["unknown", 0.07]
        ]),
        adverb: Object.freeze([
            ["verb", 1.45],
            ["adjective", 1.05],
            ["adverb", 0.35],
            ["noun", 0.28],
            ["fragment", 0.35],
            ["unknown", 0.08]
        ]),
        auxiliary: Object.freeze([
            ["ending", 1.2],
            ["particle", 0.78],
            ["fragment", 0.7],
            ["auxiliary", 0.34],
            ["conjunction", 0.28],
            ["unknown", 0.07]
        ]),
        ending: Object.freeze([
            ["fragment", 0.95],
            ["particle", 0.55],
            ["conjunction", 0.38],
            ["noun", 0.28],
            ["verb", 0.22],
            ["unknown", 0.08]
        ]),
        conjunction: Object.freeze([
            ["noun", 1.05],
            ["pronoun", 0.72],
            ["verb", 0.9],
            ["adjective", 0.82],
            ["adverb", 0.7],
            ["fragment", 0.48],
            ["interjection", 0.3],
            ["unknown", 0.08]
        ]),
        fragment: Object.freeze([
            ["ending", 0.7],
            ["particle", 0.48],
            ["fragment", 0.5],
            ["noun", 0.38],
            ["verb", 0.35],
            ["adjective", 0.32],
            ["unknown", 0.09]
        ]),
        interjection: Object.freeze([
            ["fragment", 0.9],
            ["noun", 0.62],
            ["pronoun", 0.55],
            ["adverb", 0.5],
            ["verb", 0.4],
            ["adjective", 0.4],
            ["unknown", 0.1]
        ]),
        unknown: Object.freeze([
            ["noun", 0.72],
            ["fragment", 0.62],
            ["verb", 0.55],
            ["adjective", 0.45],
            ["particle", 0.35],
            ["unknown", 0.32]
        ])
    });

    function normalizePos(pos) {
        const value = String(pos || "unknown");
        return ALIASES[value] || value;
    }

    function getWeights(previousPos) {
        const key = previousPos ? normalizePos(previousPos) : "START";
        return (TRANSITIONS[key] || TRANSITIONS.unknown).map(function (row) {
            return { pos: row[0], weight: row[1] };
        });
    }

    function chooseNext(previousPos, random) {
        const weights = getWeights(previousPos);
        const total = weights.reduce(function (sum, item) {
            return sum + item.weight;
        }, 0);
        let cursor = (typeof random === "function" ? random() : Math.random()) * total;

        for (const item of weights) {
            cursor -= item.weight;
            if (cursor <= 0) return item.pos;
        }
        return weights[weights.length - 1].pos;
    }

    function compatibility(expectedPos, actualPos) {
        const expected = normalizePos(expectedPos);
        const actual = normalizePos(actualPos);
        if (expected === actual) return 1;
        if (expected === "ending" && ["fragment", "particle", "auxiliary"].includes(actual)) return 0.48;
        if (expected === "noun" && ["pronoun"].includes(actual)) return 0.42;
        if (expected === "fragment" && ["interjection", "conjunction", "ending"].includes(actual)) return 0.38;
        return 0;
    }

    window.RandomIMEPOSTransitions = Object.freeze({
        version: "1.0.0",
        transitions: TRANSITIONS,
        normalizePos,
        getWeights,
        chooseNext,
        compatibility
    });
})();
