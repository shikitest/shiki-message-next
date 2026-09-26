#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = { window: {}, console };
context.window.window = context.window;
vm.createContext(context);

[
    "js/ime/ime-lexicon-data.js",
    "js/ime/ime-inflections.js",
    "js/ime/ime-custom-lexicon.js",
    "js/ime/ime-lexicon.js"
].forEach(file => vm.runInContext(
    fs.readFileSync(path.join(root, file), "utf8"),
    context,
    { filename: file }
));

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const data = context.window.RandomIMELexiconData;
const engine = context.window.RandomIMEInflections;
const lexicon = context.window.RandomIMELexicon;
const allowedClasses = new Set([
    null,
    "irregular-kuru",
    "irregular-suru",
    "ichidan",
    "i-adjective",
    "godan-う",
    "godan-く",
    "godan-ぐ",
    "godan-す",
    "godan-つ",
    "godan-ぬ",
    "godan-ぶ",
    "godan-む",
    "godan-る"
]);

assert(data.metadata.formatVersion === 2, "core lexicon must use formatVersion 2");
assert(data.metadata.profile === "core", "runtime lexicon must use the core profile");
assert(data.entries.length === 4000, "runtime core lexicon must contain 4000 rows");

data.entries.forEach((row, index) => {
    assert(row.length === 6, `row ${index} is missing core metadata`);
    assert(Number.isFinite(row[4]), `row ${index} has invalid chatWeight`);
    assert(row[4] >= -0.35 && row[4] <= 0.35, `row ${index} chatWeight out of range`);
    assert(allowedClasses.has(row[5]), `row ${index} has unknown inflectionClass`);
    if (row[5] && row[5].startsWith("godan-")) {
        assert(row[2] === "verb", `row ${index} gives a godan class to a non-verb`);
        assert(row[0].endsWith(row[5].slice(-1)), `row ${index} godan ending mismatch`);
    }
    if (["ichidan", "irregular-kuru", "irregular-suru"].includes(row[5])) {
        assert(row[2] === "verb", `row ${index} gives a verb class to a non-verb`);
    }
    if (row[5] === "i-adjective") {
        assert(row[2] === "adjective", `row ${index} gives i-adjective to another POS`);
        assert(row[0].endsWith("い"), `row ${index} i-adjective reading does not end in い`);
    }
});

const iru = engine.expandEntry({
    reading: "いる",
    text: "要る",
    pos: "verb",
    weight: 0.8,
    inflectionClass: "godan-る"
});
assert(iru.some(entry => entry.text === "要った"), "要る must produce 要った");
assert(!iru.some(entry => entry.text === "要た"), "要る must never produce 要た");

const fusei = engine.expandEntry({
    reading: "ふせい",
    text: "不正",
    pos: "adjective",
    weight: 0.8,
    inflectionClass: null
});
assert(fusei.length === 0, "explicit non-inflecting adjective must not expand");

const customCompatibility = engine.expandEntry({
    reading: "たべる",
    text: "食べる",
    pos: "verb",
    weight: 0.8
});
assert(
    customCompatibility.some(entry => entry.text === "食べた"),
    "metadata-free custom entries must preserve compatibility inference"
);

const unsafeTexts = lexicon.inflectedEntries.filter(entry =>
    entry.text === "要た" ||
    entry.text === "不正かった" ||
    entry.text === "不正くない" ||
    entry.text === "不正くて"
);
assert(unsafeTexts.length === 0, "runtime lexicon contains unsafe derived forms");

console.log(JSON.stringify({
    passed: true,
    generatedRows: data.entries.length,
    runtimeEntries: lexicon.entries.length,
    runtimeInflectedEntries: lexicon.inflectedEntries.length,
    explicitInflectionRows: data.entries.filter(row => row[5]).length,
    explicitNonInflectingRows: data.entries.filter(row => row[5] === null).length,
    compatibilityInferencePreserved: true,
    rejectedForms: ["要た", "不正かった", "不正くない", "不正くて"]
}, null, 2));
