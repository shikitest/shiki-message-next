#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(value, message) {
    if (!value) throw new Error(message);
}

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`Missing function ${name}`);
    const brace = source.indexOf("{", start);
    let depth = 0;
    for (let index = brace; index < source.length; index++) {
        if (source[index] === "{") depth++;
        else if (source[index] === "}") {
            depth--;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    throw new Error(`Unclosed function ${name}`);
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return function () {
        state = Math.imul(1664525, state) + 1013904223 >>> 0;
        return state / 4294967296;
    };
}

function main() {
    const root = path.join(__dirname, "..");
    const core = fs.readFileSync(path.join(root, "js", "core.js"), "utf8");
    const scheduler = fs.readFileSync(path.join(
        root,
        "js",
        "rolling-message-scheduler.js"
    ), "utf8");
    const translation = fs.readFileSync(path.join(
        root,
        "js",
        "translation-helper.js"
    ), "utf8");
    const randomIME = fs.readFileSync(path.join(
        root,
        "js",
        "random-ime.js"
    ), "utf8");
    const chooseSource = extractFunction(core, "chooseReplyText");
    const settings = { textGenerationMode: "card" };
    let imeCalls = 0;
    const random = seededRandom(20260809);
    const math = Object.create(Math);
    math.random = random;
    const context = {
        settings,
        window: {
            RandomIME: {
                generate() {
                    imeCalls++;
                    return { text: `IME-${imeCalls}` };
                }
            }
        },
        Math: math,
        normalizeTextGenerationMode(mode) {
            return ["card", "ime", "mixed"].includes(mode) ? mode : "card";
        }
    };
    const chooseReplyText = vm.runInNewContext(`(${chooseSource})`, context);
    const pool = ["CARD-A", "CARD-B"];
    const counts = {};

    ["card", "ime"].forEach(function (mode) {
        settings.textGenerationMode = mode;
        const before = imeCalls;
        const results = Array.from({ length: 1000 }, function () {
            return chooseReplyText(pool);
        });
        counts[mode] = results.reduce(function (acc, item) {
            acc[item.source] = (acc[item.source] || 0) + 1;
            return acc;
        }, {});
        assert(results.length === 1000, `${mode} changed reply slot count`);
        if (mode === "card") assert(imeCalls === before,
            "card mode called RandomIME");
        if (mode === "ime") assert(results.every(item => item.source === "ime"),
            "ime mode did not use IME for every slot");
    });

    settings.textGenerationMode = "mixed";
    const mixed = Array.from({ length: 5000 }, function () {
        return chooseReplyText(pool);
    });
    counts.mixed = mixed.reduce(function (acc, item) {
        acc[item.source] = (acc[item.source] || 0) + 1;
        return acc;
    }, {});
    assert(mixed.length === 5000, "mixed changed reply slot count");
    assert(counts.mixed.card > 2200 && counts.mixed.card < 2800,
        "mixed card distribution is not near 50%");
    assert(counts.mixed.ime > 2200 && counts.mixed.ime < 2800,
        "mixed IME distribution is not near 50%");

    assert(core.includes("const replyCount = Math.random() < 0.75 ? 1"),
        "replyCount scheduler changed");
    assert(core.includes("Math.random() < 0.03") &&
        core.includes("Math.random() < 0.01"),
        "poke/photo probabilities missing");
    assert(core.includes("// 注意：这里故意没有 return"),
        "special-event fallthrough guard missing");
    assert(core.includes("groupMemberId: replyGroupMemberId"),
        "scheduled group sender id is not preserved");
    assert(scheduler.includes("simulateReply") === false,
        "scheduler module should use a callback, not own chat generation");
    assert(!/(userResponded|waitingForUserReply|pauseUntilUserReply|replyRequired|conversationActive)/.test(scheduler),
        "scheduler contains user-reply coupling state");
    assert(!/(RandomIME|candidate|\bPOS\b|translationText|message\.text|history)/.test(scheduler),
        "scheduler reads text-generation or translation state");
    assert(!randomIME.includes("translationText"),
        "RandomIME consumes translation output");
    assert(!translation.includes("chooseReplyText") &&
        !translation.includes("RandomIME.generate") &&
        !translation.includes("RollingMessageScheduler"),
        "translation helper feeds a generator or scheduler");

    console.log(JSON.stringify({
        textGenerationModes: counts,
        invariants: {
            replySlotCountUnchanged: true,
            cardDoesNotCallIME: true,
            mixedIndependentPerSlot: true,
            replyCountFormulaPresent: true,
            pokeAndPhotoProbabilitiesPresent: true,
            specialEventsFallThroughToText: true,
            scheduledGroupMemberIdPreserved: true,
            schedulerCallbackOnly: true,
            schedulerUserReplyIndependent: true,
            schedulerContentBlind: true,
            translationGeneratorIsolation: true
        }
    }, null, 2));
}

main();
