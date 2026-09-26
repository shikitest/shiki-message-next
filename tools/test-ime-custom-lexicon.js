#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function createRuntime(storage) {
    const context = {
        window: {},
        console: { log() {}, warn() {}, error: console.error.bind(console) },
        Math,
        Date,
        setTimeout,
        clearTimeout
    };
    context.window.window = context.window;
    context.window.APP_PREFIX = "TEST_";
    context.window.localforage = {
        async getItem(key) { return storage.has(key) ? structuredClone(storage.get(key)) : null; },
        async setItem(key, value) { storage.set(key, structuredClone(value)); return value; }
    };
    vm.createContext(context);
    [
        "js/ime/ime-pos-transitions.js",
        "js/ime/ime-inflections.js",
        "js/ime/ime-local-grammar.js",
        "js/ime/ime-custom-lexicon.js"
    ].forEach(function (file) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
    });
    return context;
}

function loadIME(context) {
    [
        "js/ime/ime-lexicon-data.js",
        "js/ime/ime-anime-overrides.js",
        "js/ime/ime-lexicon.js",
        "js/ime/ime-chat-overrides.js",
        "js/random-ime.js"
    ].forEach(function (file) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
    });
}

async function main() {
    const storage = new Map();
    let context = createRuntime(storage);
    let api = context.window.RandomIMECustomLexicon;
    await api.ready;
    loadIME(context);

    const added = await api.add({ reading: "シキ", text: "詩季", pos: "noun", weight: "normal" });
    assert.equal(added.valid, true);
    assert.equal(added.entry.reading, "しき", "katakana reading should normalize");
    assert(context.window.RandomIME.getCandidates("しき").some(candidate => candidate.text === "詩季"));
    assert(api.getPrefixMatches("し", { limit: 20 }).some(entry => entry.text === "詩季"));
    assert(api.getNextKanaWeights("し").some(item => item.kana === "き"));

    context = createRuntime(storage);
    api = context.window.RandomIMECustomLexicon;
    await api.ready;
    loadIME(context);
    assert(context.window.RandomIME.getCandidates("しき").some(candidate => candidate.text === "詩季"), "reload persistence");

    const id = api.list()[0].id;
    const edited = await api.update(id, { text: "诗季测试词" });
    assert.equal(edited.valid, true);
    assert(context.window.RandomIME.getCandidates("しき").some(candidate => candidate.text === "诗季测试词"));
    assert(!context.window.RandomIME.getCandidates("しき").some(candidate => candidate.text === "詩季" && candidate.custom));

    await api.setEnabled(id, false);
    assert(!context.window.RandomIME.getCandidates("しき").some(candidate => candidate.text === "诗季测试词" && candidate.custom));
    await api.setEnabled(id, true);
    assert(context.window.RandomIME.getCandidates("しき").some(candidate => candidate.text === "诗季测试词"));

    const homophone = await api.add({ reading: "しき", text: "四季测试词", pos: "noun", weight: "high" });
    assert.equal(homophone.valid, true, "homophones should be accepted");
    const duplicate = await api.add({ reading: "しき", text: "四季测试词", pos: "noun", weight: "low" });
    assert.equal(duplicate.valid, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(api.search("四季").length, 1);
    assert.equal(api.search("しき").length, 2);

    const exported = api.exportJSON();
    const beforeExport = api.list();
    await api.clear();
    assert.equal(api.list().length, 0);
    const imported = await api.importJSON(exported, { mode: "replace" });
    assert.equal(imported.valid, true);
    assert.equal(api.list().length, beforeExport.length);

    const beforeInvalid = api.list();
    const invalidJSON = await api.importJSON("{broken", { mode: "replace" });
    assert.equal(invalidJSON.valid, false);
    assert.deepEqual(api.list(), beforeInvalid, "invalid JSON must not mutate existing data");

    const partial = await api.importJSON(JSON.stringify({
        version: 1,
        entries: [
            { reading: "ねこ", text: "猫测试", pos: "noun", weight: "normal" },
            { reading: "", text: "非法", pos: "noun" },
            { reading: "abc", text: "非法2", pos: "noun" }
        ]
    }));
    assert.equal(partial.valid, true);
    assert.equal(partial.imported, 1);
    assert.equal(partial.skipped, 2);

    const deleteId = api.search("诗季测试词")[0].id;
    await api.remove(deleteId);
    assert(!context.window.RandomIME.getCandidates("しき").some(candidate => candidate.text === "诗季测试词" && candidate.custom));

    const kanaDigits = Array.from("あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ");
    function encodedReading(number) {
        let value = number;
        let suffix = "";
        do {
            suffix = kanaDigits[value % kanaDigits.length] + suffix;
            value = Math.floor(value / kanaDigits.length);
        } while (value > 0);
        return "てすと" + suffix;
    }
    const bulkEntries = Array.from({ length: 3000 }, function (_, index) {
        return { reading: encodedReading(index), text: "性能测试词" + index, pos: "noun", weight: "normal" };
    });
    const bulkStarted = performance.now();
    const bulkResult = await api.importJSON(JSON.stringify({ version: 1, entries: bulkEntries }));
    const bulkImportMs = performance.now() - bulkStarted;
    assert.equal(bulkResult.imported, 3000, "thousands of entries should import");
    const lookupStarted = performance.now();
    for (let index = 0; index < 1000; index++) {
        api.getExact(encodedReading(index % 3000));
        api.getPrefixMatches("てすと", { limit: 20 });
    }
    const lookupMs = performance.now() - lookupStarted;

    console.log(JSON.stringify({
        passed: true,
        tests: [
            "add/exact/prefix/next-kana", "reload persistence", "edit/index update",
            "disable/enable", "homophone", "duplicate rejection", "search",
            "export/clear/import", "invalid JSON atomicity", "partial validation", "delete",
            "3000-entry indexed import and lookup"
        ],
        finalEntries: api.list().length,
        performance: {
            bulkImportMs: Number(bulkImportMs.toFixed(2)),
            twoThousandLookupsMs: Number(lookupMs.toFixed(2))
        }
    }, null, 2));
}

main().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
