#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

function percentile(sorted, ratio) {
    return sorted[Math.floor((sorted.length - 1) * ratio)];
}

function assert(value, message) {
    if (!value) throw new Error(message);
}

async function main() {
    const source = fs.readFileSync(path.join(
        __dirname,
        "..",
        "js",
        "rolling-message-scheduler.js"
    ), "utf8");
    const context = {
        window: {},
        console,
        setTimeout: function () { return 1; },
        clearTimeout: function () {}
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    const scheduler = context.window.RollingMessageScheduler;
    const distribution = {};

    ["low", "normal", "high"].forEach(function (frequency, index) {
        const random = seededRandom(20260809 + index);
        const values = Array.from({ length: 50000 }, function () {
            return scheduler.sampleRegularDelay(frequency, random) / 60000;
        }).sort(function (a, b) { return a - b; });
        distribution[frequency] = {
            p10: percentile(values, 0.1),
            p25: percentile(values, 0.25),
            median: percentile(values, 0.5),
            p75: percentile(values, 0.75),
            p90: percentile(values, 0.9),
            p95: percentile(values, 0.95),
            minimum: values[0],
            maximum: values[values.length - 1]
        };
    });
    assert(distribution.low.median > distribution.normal.median,
        "low must wait longer than normal");
    assert(distribution.normal.median > distribution.high.median,
        "normal must wait longer than high");

    const burstRandom = seededRandom(20260809);
    const burstLengths = Array.from({ length: 20000 }, function () {
        return scheduler.sampleBurstLength(burstRandom);
    });
    const burstCounts = Object.fromEntries([1, 2, 3, 4].map(function (length) {
        return [length, burstLengths.filter(value => value === length).length];
    }));
    assert(Math.max(...burstLengths) <= scheduler.limits.maximumBurstMessages,
        "burst cap exceeded");

    let currentTime = 1700000000000;
    let stored = null;
    const storage = {
        async getItem() { return stored; },
        async setItem(key, value) { stored = JSON.parse(JSON.stringify(value)); },
        async removeItem() { stored = null; }
    };
    const triggered = [];
    const engine = scheduler.createEngine({
        random: seededRandom(101),
        now: function () { return currentTime; },
        setTimeout: function () { return 1; },
        clearTimeout: function () {}
    });
    await engine.start({
        frequency: "normal",
        storage,
        storageKey: "test",
        getIdentities: function () {
            return [
                { id: "group:a", groupMemberId: "a" },
                { id: "group:b", groupMemberId: "b" }
            ];
        },
        onTrigger: function (event) { triggered.push(event); }
    });
    const initial = engine.snapshot();
    assert(initial.states.length === 2, "member states must be independent");
    initial.states.forEach(function (state) {
        assert(Number.isFinite(state.nextSendAt), "nextSendAt must be finite");
        assert(state.nextSendAt > currentTime, "nextSendAt must be future");
    });

    const unchangedNextSendAt = initial.states.map(state => state.nextSendAt);
    const unrelatedUserReplyState = { replied: false };
    unrelatedUserReplyState.replied = true;
    assert(JSON.stringify(engine.snapshot().states.map(state => state.nextSendAt)) ===
        JSON.stringify(unchangedNextSendAt),
        "user reply must not alter nextSendAt");

    stored.states.forEach(function (state, index) {
        state.nextSendAt = currentTime - (index + 1) * 60000;
    });
    await engine.stop({ clear: false });
    const restored = scheduler.createEngine({
        random: function () { return 0.1; },
        now: function () { return currentTime; },
        setTimeout: function () { return 1; },
        clearTimeout: function () {}
    });
    await restored.start({
        frequency: "normal",
        storage,
        storageKey: "test",
        getIdentities: function () {
            return [
                { id: "group:a", groupMemberId: "a" },
                { id: "group:b", groupMemberId: "b" }
            ];
        },
        onTrigger: function (event) { triggered.push(event); }
    });
    assert(triggered.length === 1,
        "overdue restore must execute at most one event");
    restored.snapshot().states.forEach(function (state) {
        assert(state.nextSendAt > currentTime, "restored nextSendAt must be future");
        assert(state.burstRemaining < scheduler.limits.maximumBurstMessages,
            "restored burst state must be capped");
    });
    await restored.stop({ clear: true });
    assert(stored === null, "disabled scheduler must clear persisted state");

    console.log(JSON.stringify({
        version: scheduler.version,
        distribution,
        burstLengthDistribution: burstCounts,
        structuralChecks: {
            finiteFutureTimes: true,
            persistenceRestore: true,
            overdueMaximumOne: true,
            userReplyIndependent: true,
            independentMembers: true,
            burstCap: true,
            disabledClearsState: true
        }
    }, null, 2));
}

main().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
