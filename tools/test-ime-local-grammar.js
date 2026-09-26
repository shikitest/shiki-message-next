#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = { window: {}, console, Math };
context.window.window = context.window;
vm.createContext(context);
[
    "js/ime/ime-pos-transitions.js",
    "js/ime/ime-local-grammar.js"
].forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
});

const grammar = context.window.RandomIMELocalGrammar;
const noun = { text: "猫", reading: "ねこ", pos: "noun" };
const particle = { text: "に", reading: "に", pos: "particle" };
const ending = { text: "かな", reading: "かな", pos: "ending" };
const inflected = { text: "見たい", reading: "みたい", pos: "verb", inflectionType: "tai" };

const nounParticle = grammar.evaluateCandidate([noun], particle);
assert(nounParticle.multiplier > 1, "noun -> particle should be attracted");

const stackedParticle = grammar.evaluateCandidate([particle], { text: "を", reading: "を", pos: "particle" });
const allowedParticle = grammar.evaluateCandidate([particle], { text: "も", reading: "も", pos: "particle" });
assert(stackedParticle.invalidLike, "unusual particle stack should be invalid-like");
assert(allowedParticle.multiplier > stackedParticle.multiplier, "allowed local particle pair should remain reachable");

const stackedEnding = grammar.evaluateCandidate([ending], { text: "かな", reading: "かな", pos: "ending" });
assert(stackedEnding.invalidLike, "repeated ending should be invalid-like");

const repeatedMorphology = grammar.evaluateCandidate([inflected], { text: "たい", reading: "たい", pos: "auxiliary" });
assert(repeatedMorphology.invalidLike, "tai inflection should not strongly repeat tai auxiliary");

const startParticle = grammar.evaluateCandidate([], { text: "を", reading: "を", pos: "particle" });
assert(startParticle.invalidLike && startParticle.multiplier < 0.2);

const particleWeights = grammar.getTransitionWeights(particle, [particle]);
const particleAfterParticle = particleWeights.find(item => item.pos === "particle");
const verbAfterParticle = particleWeights.find(item => item.pos === "verb");
assert(!particleAfterParticle || particleAfterParticle.weight < verbAfterParticle.weight);

console.log(JSON.stringify({
    passed: true,
    checks: {
        nounParticle: nounParticle.multiplier,
        stackedParticle: stackedParticle.multiplier,
        allowedParticle: allowedParticle.multiplier,
        stackedEnding: stackedEnding.multiplier,
        repeatedMorphology: repeatedMorphology.multiplier,
        startParticle: startParticle.multiplier
    }
}, null, 2));
