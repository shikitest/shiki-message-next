#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const root = path.join(__dirname, "..");
const context = {
    window: {},
    console: { log() {}, warn() {}, error: console.error.bind(console) },
    Math
};
context.window.window = context.window;
vm.createContext(context);

const files = [
    "js/ime/ime-lexicon-data.js",
    "js/ime/ime-anime-overrides.js",
    "js/ime/ime-pos-transitions.js",
    "js/ime/ime-inflections.js",
    "js/ime/ime-local-grammar.js",
    "js/ime/ime-custom-lexicon.js",
    "js/ime/ime-lexicon.js",
    "js/ime/ime-chat-overrides.js",
    "js/random-ime.js"
];
const started = performance.now();
files.forEach(file => vm.runInContext(
    fs.readFileSync(path.join(root, file), "utf8"),
    context,
    { filename: file }
));
const initializationMs = performance.now() - started;
const lexicon = context.window.RandomIMELexicon;
const ime = context.window.RandomIME;
const queries = ["ねこ", "きょう", "しごと", "げーむ", "すまほ"];

function benchmark(callback, iterations) {
    const start = performance.now();
    for (let index = 0; index < iterations; index++) {
        callback(queries[index % queries.length]);
    }
    return (performance.now() - start) / iterations;
}

const generationTimes = [];
for (let index = 0; index < 200; index++) {
    const start = performance.now();
    ime.generate({ debug: false });
    generationTimes.push(performance.now() - start);
}
generationTimes.sort((left, right) => left - right);

const output = {
    passed: true,
    generatedEntries: context.window.RandomIMELexiconData.metadata.entryCount,
    runtimeEntries: lexicon.entries.length,
    runtimeInflectedEntries: lexicon.inflectedEntries.length,
    uniqueReadings: new Set(lexicon.entries.map(entry => entry.reading)).size,
    generatedFileBytes: fs.statSync(path.join(
        root,
        "js/ime/ime-lexicon-data.js"
    )).size,
    initializationMs: Number(initializationMs.toFixed(3)),
    heapUsedBytes: process.memoryUsage().heapUsed,
    lookupAverageMs: {
        exact: Number(benchmark(reading =>
            lexicon.getExact(reading), 5000).toFixed(6)),
        prefix: Number(benchmark(reading =>
            lexicon.getPrefixMatches(reading.slice(0, 2), { limit: 20 }),
        2000).toFixed(6)),
        nextKana: Number(benchmark(reading =>
            lexicon.getNextKanaWeights(reading.slice(0, 1)),
        2000).toFixed(6))
    },
    generationAverageMs: Number((
        generationTimes.reduce((sum, value) => sum + value, 0) /
        generationTimes.length
    ).toFixed(4)),
    generationP95Ms: Number(generationTimes[
        Math.floor(generationTimes.length * 0.95)
    ].toFixed(4))
};

console.log(JSON.stringify(output, null, 2));
