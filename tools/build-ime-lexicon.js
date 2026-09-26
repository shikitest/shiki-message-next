#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DEFAULT_SOURCE = path.join(__dirname, "ime-source", "JMdict_e.gz");
const DEFAULT_OUTPUT = path.join(__dirname, "..", "js", "ime", "ime-lexicon-data.js");
const DEFAULT_LIMIT = 2200;
const SOURCE_URL = "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz";

const POS_CAP_RATIOS = Object.freeze({
    noun: 0.43,
    verb: 0.24,
    adjective: 0.12,
    adverb: 0.07,
    particle: 0.015,
    auxiliary: 0.015,
    pronoun: 0.015,
    interjection: 0.025,
    fragment: 0.075,
    conjunction: 0.02,
    other: 0.015
});
const LEGACY_POS_CAPS = Object.freeze({
    noun: 920, verb: 430, adjective: 250, adverb: 150,
    particle: 60, auxiliary: 60, pronoun: 55, interjection: 90,
    fragment: 180, conjunction: 55, other: 80
});

const EXCLUDED_MISC = new Set([
    "arch", "dated", "hist", "obs", "obsc", "rare", "sens",
    "sl", "vulg", "derog", "poet"
]);

const CORE_EXCLUDED_MISC = new Set([
    ...EXCLUDED_MISC,
    "abbr", "organization", "yoji", "id", "work", "company",
    "proverb", "hon", "form", "product", "char", "surname",
    "male", "fem", "person", "place", "ev", "fict", "leg",
    "myth", "relig", "ship", "doc", "creat", "unclass"
]);

const EXCLUDED_KANJI_INFO = new Set([
    "iK", "ik", "io", "oK", "ok", "rK", "sK"
]);

// Modern consumer domains requested by the project are allowed back into the
// base lexicon. Other field-tagged specialist entries remain excluded.
const ALLOWED_MODERN_FIELDS = new Set([
    "comp", "food", "music", "sports", "internet", "vidg", "photo",
    "art", "film", "tv", "manga", "cloth", "rail", "bus", "print",
    "telec", "elec", "electr"
]);

const CORE_SINGLE_KANJI = new Set(Array.from(
    "人家本今日月年時気手目口水火木金土空雨雪花犬猫愛恋夢朝昼夜駅車道店音歌友親母父兄姉弟妹子心顔声食茶米肉魚山海川色春夏秋冬"
));

const CORE_POS_CAP_RATIOS = Object.freeze({
    noun: 0.23,
    verb: 0.38,
    adjective: 0.205,
    adverb: 0.038,
    particle: 0.016,
    auxiliary: 0.005,
    pronoun: 0.014,
    interjection: 0.023,
    fragment: 0.078,
    conjunction: 0.014,
    other: 0.002
});

const CORE_FALLBACK_CAP_RATIOS = Object.freeze({
    noun: 0.28,
    verb: 0.41,
    adjective: 0.23,
    adverb: 0.05,
    particle: 0.025,
    auxiliary: 0.012,
    pronoun: 0.025,
    interjection: 0.035,
    fragment: 0.1,
    conjunction: 0.025,
    other: 0.01
});

function parseArgs(argv) {
    const options = {
        source: DEFAULT_SOURCE,
        output: DEFAULT_OUTPUT,
        limit: DEFAULT_LIMIT,
        profile: "legacy"
    };

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--source") options.source = path.resolve(argv[++index]);
        else if (arg === "--output") options.output = path.resolve(argv[++index]);
        else if (arg === "--limit") options.limit = Number(argv[++index]);
        else if (arg === "--profile") options.profile = argv[++index];
        else if (arg === "--help") {
            console.log("Usage: node tools/build-ime-lexicon.js [--source JMdict_e.gz] [--output file] [--limit 2200] [--profile core|modern|legacy]");
            process.exit(0);
        } else {
            throw new Error("Unknown argument: " + arg);
        }
    }

    if (!Number.isInteger(options.limit) || options.limit < 1) {
        throw new Error("--limit must be a positive integer");
    }
    if (!["modern", "legacy", "core"].includes(options.profile)) {
        throw new Error("--profile must be modern, legacy, or core");
    }
    return options;
}

function decodeXml(value) {
    return String(value || "")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#([0-9]+);/g, (_, number) => String.fromCodePoint(Number(number)))
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

function extractAll(xml, tag) {
    const values = [];
    const pattern = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "g");
    let match;
    while ((match = pattern.exec(xml))) values.push(decodeXml(match[1].trim()));
    return values;
}

function extractBlocks(xml, tag) {
    return extractAll(xml, tag);
}

function entityName(value) {
    const match = String(value || "").match(/^&([^;]+);$/);
    return match ? match[1] : String(value || "");
}

function normalizeReading(reading) {
    return String(reading || "").replace(/[ァ-ヶ]/g, char =>
        String.fromCharCode(char.charCodeAt(0) - 0x60)
    );
}

function verbInflectionClass(reading, tags) {
    if (tags.some(tag => tag === "vk") && reading.endsWith("くる")) {
        return "irregular-kuru";
    }
    if (
        tags.some(tag => ["vs", "vs-i", "vs-s"].includes(tag)) &&
        reading.endsWith("する")
    ) return "irregular-suru";
    if (
        tags.some(tag => ["v1", "v1-s"].includes(tag)) &&
        reading.endsWith("る")
    ) return "ichidan";
    const godan = tags.find(tag => /^v5/.test(tag));
    if (!godan || godan === "v5r-i") return null;
    const endings = {
        v5u: "う", "v5u-s": "う", v5k: "く", "v5k-s": "く",
        v5g: "ぐ", v5s: "す", v5t: "つ", v5n: "ぬ",
        v5b: "ぶ", v5m: "む", v5r: "る", v5aru: "る"
    };
    const matched = Object.keys(endings).find(prefix =>
        godan === prefix || godan.startsWith(prefix + "-")
    );
    const ending = matched ? endings[matched] : null;
    return ending && reading.endsWith(ending) ? "godan-" + ending : null;
}

function classifyPos(reading, posValues) {
    const tags = posValues.map(entityName);
    if (tags.some(tag => tag === "n-pr")) return null;
    const verbTag = tags.some(tag =>
        /^v(?:1|5|k|s|z|[24])/.test(tag) &&
        !["vi", "vt", "v-unspec"].includes(tag)
    );
    const verbClass = verbInflectionClass(reading, tags);
    if (verbClass || verbTag) {
        return { pos: "verb", inflectionClass: verbClass };
    }
    if (tags.some(tag => /^adj-/.test(tag))) {
        const inflectionClass =
            tags.some(tag => ["adj-i", "adj-ix"].includes(tag)) &&
            reading.endsWith("い") ? "i-adjective" : null;
        return { pos: "adjective", inflectionClass };
    }
    if (tags.some(tag => tag === "adv" || tag === "adv-to")) return { pos: "adverb", inflectionClass: null };
    if (tags.some(tag => tag === "prt")) return { pos: "particle", inflectionClass: null };
    if (tags.some(tag => tag === "aux" || tag === "aux-adj" || tag === "aux-v")) return { pos: "auxiliary", inflectionClass: null };
    if (tags.some(tag => tag === "pn")) return { pos: "pronoun", inflectionClass: null };
    if (tags.some(tag => tag === "int")) return { pos: "interjection", inflectionClass: null };
    if (tags.some(tag => tag === "conj")) return { pos: "conjunction", inflectionClass: null };
    if (tags.some(tag => tag === "exp" || tag === "pref" || tag === "suf")) return { pos: "fragment", inflectionClass: null };
    if (tags.some(tag => tag === "n" || tag.startsWith("n-") || tag === "num" || tag === "ctr" || tag === "vs")) return { pos: "noun", inflectionClass: null };
    return { pos: "other", inflectionClass: null };
}

function priorityScore(tags, profile) {
    if (profile === "legacy" || profile === "core") {
        let score = 0;
        tags.map(entityName).forEach(tag => {
            const fixed = {
                spec1: 0.31, ichi1: 0.28, news1: 0.24, gai1: 0.20,
                spec2: 0.18, ichi2: 0.16, news2: 0.14, gai2: 0.12
            }[tag];
            if (fixed) score = Math.max(score, fixed);
            const nf = tag.match(/^nf(\d\d)$/);
            if (nf) {
                score = Math.max(
                    score,
                    0.20 - (Number(nf[1]) - 1) * 0.003
                );
            }
        });
        return Math.max(0, score);
    }
    const scores = [];
    tags.map(entityName).forEach(tag => {
        const fixed = {
            spec1: 0.34, ichi1: 0.32, news1: 0.28, gai1: 0.24,
            spec2: 0.19, ichi2: 0.17, news2: 0.15, gai2: 0.13
        }[tag];
        if (fixed) scores.push(fixed);
        const nf = tag.match(/^nf(\d\d)$/);
        if (nf) {
            scores.push(Math.max(
                0.03,
                0.30 - (Number(nf[1]) - 1) * 0.0055
            ));
        }
    });
    scores.sort((left, right) => right - left);
    if (!scores.length) return 0;
    return Math.min(
        0.5,
        scores[0] + scores.slice(1).reduce(
            (sum, score) => sum + score * 0.25,
            0
        )
    );
}

function isUsableReading(reading) {
    return reading.length >= 1 && reading.length <= 12 && /^[ぁ-ゖー]+$/.test(reading);
}

function isUsableSurface(text) {
    return text.length >= 1 && text.length <= 10 &&
        /^[一-龯々〆ヵヶぁ-ゖァ-ヺーA-Za-z0-9]+$/.test(text);
}

function calculateScore(
    reading,
    text,
    pos,
    priority,
    fieldTagged,
    profile
) {
    let score = (profile === "legacy" || profile === "core" ? 0.51 : 0.42) + priority;
    if (pos === "interjection" || pos === "fragment") score += 0.035;
    if (pos === "verb" || pos === "adjective") score += 0.018;
    if (reading.length <= 5) score += 0.025;
    if (reading.length > 8) score -= (reading.length - 8) * 0.018;
    if (text.length > 6) score -= (text.length - 6) * 0.012;
    if (fieldTagged && profile !== "legacy") score -= 0.025;
    return profile === "legacy" || profile === "core" ?
        Math.max(0.45, Math.min(0.98, score)) :
        Math.max(0.42, Math.min(0.97, score));
}

function calculateChatWeight(priorityTags, pos, misc, fields, reading, text) {
    const tags = priorityTags.map(entityName);
    let weight = 0;
    if (tags.includes("ichi1")) weight += 0.18;
    if (tags.includes("spec1")) weight += 0.16;
    if (tags.includes("gai1")) weight += 0.1;
    if (tags.includes("ichi2") || tags.includes("spec2")) weight += 0.04;
    const nfRanks = tags.map(tag => {
        const match = tag.match(/^nf(\d\d)$/);
        return match ? Number(match[1]) : null;
    }).filter(rank => rank !== null);
    const bestNf = nfRanks.length ? Math.min(...nfRanks) : null;
    if (bestNf !== null) {
        if (bestNf <= 10) weight += 0.14;
        else if (bestNf <= 20) weight += 0.09;
        else if (bestNf <= 30) weight += 0.04;
        else if (bestNf >= 36) weight -= 0.06;
    }
    if (pos === "interjection") weight += 0.16;
    else if (["adverb", "pronoun"].includes(pos)) weight += 0.09;
    else if (pos === "verb") weight += 0.07;
    else if (pos === "adjective") weight += 0.08;
    else if (pos === "fragment") weight += misc.includes("exp") ? 0.08 : 0.02;
    if (misc.some(tag => ["col", "fam", "net-sl", "on-mim"].includes(tag))) weight += 0.1;
    if (misc.includes("uk")) weight += 0.02;
    if (fields.length) weight -= 0.02;
    if (reading.length > 7) weight -= (reading.length - 7) * 0.025;
    if (text.length > 6) weight -= (text.length - 6) * 0.02;
    if (/^[一-龯]$/.test(text) && !CORE_SINGLE_KANJI.has(text)) weight -= 0.14;
    return Math.max(-0.35, Math.min(0.35, Number(weight.toFixed(3))));
}

function passesCoreQualityGate(candidate, posTags, misc) {
    if (candidate.priority < 0.08 || candidate.chatWeight < -0.16) return false;
    if (/^[一-龯]$/.test(candidate.text) && !CORE_SINGLE_KANJI.has(candidate.text)) return false;
    if (/^[A-Za-z0-9]$/.test(candidate.text)) return false;
    const affixOnly = posTags.length > 0 &&
        posTags.every(tag => ["pref", "suf", "n-pref", "n-suf"].includes(tag));
    if (affixOnly) return false;
    if (misc.some(tag => CORE_EXCLUDED_MISC.has(tag))) return false;
    return true;
}

function parseEntry(xml, profile) {
    const senseBlocks = extractBlocks(xml, "sense");
    const posValues = senseBlocks.flatMap(block => extractAll(block, "pos"));
    const posTags = posValues.map(entityName);

    const misc = senseBlocks.flatMap(block => extractAll(block, "misc")).map(entityName);
    const excludedMisc = profile === "core" ? CORE_EXCLUDED_MISC : EXCLUDED_MISC;
    if (misc.some(tag => excludedMisc.has(tag))) return [];
    const fields = senseBlocks.flatMap(block =>
        extractAll(block, "field")
    ).map(entityName);
    if (
        profile === "legacy" ? fields.length > 0 :
            fields.some(field => !ALLOWED_MODERN_FIELDS.has(field))
    ) return [];

    const forms = extractBlocks(xml, "k_ele").map(block => ({
        text: extractAll(block, "keb")[0] || "",
        priority: extractAll(block, "ke_pri"),
        info: extractAll(block, "ke_inf").map(entityName)
    })).filter(form => form.text && !form.info.some(tag => EXCLUDED_KANJI_INFO.has(tag)));

    const readings = extractBlocks(xml, "r_ele").map(block => {
        const sourceReading = extractAll(block, "reb")[0] || "";
        return {
            reading: normalizeReading(sourceReading),
            kanaSurface: sourceReading,
            priority: extractAll(block, "re_pri"),
            restrictions: new Set(extractAll(block, "re_restr")),
            noKanji: /<re_nokanji\s*\/>/.test(block)
        };
    });

    const candidates = [];
    readings.forEach(readingInfo => {
        if (!isUsableReading(readingInfo.reading)) return;
        const classification = classifyPos(readingInfo.reading, posValues);
        if (!classification) return;
        const pos = classification.pos;
        if (
            readingInfo.reading.length === 1 &&
            !["particle", "auxiliary", "pronoun", "interjection"].includes(pos)
        ) {
            return;
        }
        const allowedForms = readingInfo.noKanji ? [] : forms.filter(form =>
            readingInfo.restrictions.size === 0 || readingInfo.restrictions.has(form.text)
        );
        const surfaces = allowedForms.length ? allowedForms : [{
            text: readingInfo.kanaSurface,
            priority: readingInfo.priority,
            info: []
        }];

        surfaces.forEach(form => {
            if (!isUsableSurface(form.text)) return;
            const priorityTags = readingInfo.priority.concat(form.priority);
            const priority = priorityScore(priorityTags, profile);
            if (priority <= 0) return;
            const chatWeight = profile === "core" ? calculateChatWeight(
                priorityTags,
                pos,
                misc.concat(posTags),
                fields,
                readingInfo.reading,
                form.text
            ) : 0;
            const weight = calculateScore(
                readingInfo.reading,
                form.text,
                pos,
                priority,
                fields.length > 0,
                profile
            );
            const candidate = {
                reading: readingInfo.reading,
                text: form.text,
                pos,
                weight: Number(weight.toFixed(3)),
                chatWeight,
                inflectionClass: classification.inflectionClass,
                score: profile === "core" ? weight + chatWeight * 0.12 : weight,
                priority
            };
            if (profile !== "core" || passesCoreQualityGate(candidate, posTags, misc)) {
                candidates.push(candidate);
            }
        });
    });
    return candidates;
}

function chooseEntries(candidates, limit, profile) {
    const deduped = new Map();
    candidates.forEach(entry => {
        const key = entry.reading + "\u0000" + entry.text + "\u0000" + entry.pos;
        const existing = deduped.get(key);
        if (!existing || entry.score > existing.score) deduped.set(key, entry);
    });

    const sorted = Array.from(deduped.values()).sort((left, right) =>
        right.score - left.score ||
        right.priority - left.priority ||
        left.reading.length - right.reading.length ||
        left.reading.localeCompare(right.reading, "ja") ||
        left.text.localeCompare(right.text, "ja")
    );

    const counts = Object.create(null);
    const selected = [];
    const selectedKeys = new Set();
    sorted.forEach(entry => {
        if (selected.length >= limit) return;
        const ratios = profile === "core" ? CORE_POS_CAP_RATIOS : POS_CAP_RATIOS;
        const ratio = ratios[entry.pos] || ratios.other;
        const cap = profile === "legacy" ?
            (LEGACY_POS_CAPS[entry.pos] || LEGACY_POS_CAPS.other) :
            Math.max(1, Math.ceil(limit * ratio));
        if ((counts[entry.pos] || 0) >= cap) return;
        const key = entry.reading + "\u0000" + entry.text + "\u0000" + entry.pos;
        selected.push(entry);
        selectedKeys.add(key);
        counts[entry.pos] = (counts[entry.pos] || 0) + 1;
    });

    if (selected.length < limit && profile === "core") {
        sorted.forEach(entry => {
            if (selected.length >= limit) return;
            const key = entry.reading + "\u0000" + entry.text + "\u0000" + entry.pos;
            if (selectedKeys.has(key)) return;
            const ratio = CORE_FALLBACK_CAP_RATIOS[entry.pos] ||
                CORE_FALLBACK_CAP_RATIOS.other;
            if ((counts[entry.pos] || 0) >= Math.ceil(limit * ratio)) return;
            selected.push(entry);
            selectedKeys.add(key);
            counts[entry.pos] = (counts[entry.pos] || 0) + 1;
        });
    }

    if (selected.length < limit) {
        sorted.forEach(entry => {
            if (selected.length >= limit) return;
            const key = entry.reading + "\u0000" + entry.text + "\u0000" + entry.pos;
            if (selectedKeys.has(key)) return;
            selected.push(entry);
            selectedKeys.add(key);
            counts[entry.pos] = (counts[entry.pos] || 0) + 1;
        });
    }

    return { selected, counts, available: sorted.length };
}

function renderOutput(entries, metadata) {
    const rows = entries.map(entry => {
        const row = metadata.profile === "core" ? [
            entry.reading,
            entry.text,
            entry.pos,
            entry.weight,
            entry.chatWeight,
            entry.inflectionClass
        ] : [entry.reading, entry.text, entry.pos, entry.weight];
        return "        " + JSON.stringify(row);
    }).join(",\n");

    return `(function () {\n` +
        `    "use strict";\n\n` +
        `    // Derived from JMdict by the Electronic Dictionary Research and Development Group.\n` +
        `    // This derived data file is licensed under CC BY-SA 4.0.\n` +
        `    // Source and attribution: docs/ime-lexicon-sources.md\n` +
        `    window.RandomIMELexiconData = Object.freeze({\n` +
        `        metadata: Object.freeze(${JSON.stringify(metadata, null, 8).replace(/^/gm, "        ").trimStart()}),\n` +
        `        entries: Object.freeze([\n${rows}\n        ])\n` +
        `    });\n` +
        `})();\n`;
}

async function readEntries(sourcePath, profile) {
    return new Promise((resolve, reject) => {
        const candidates = [];
        let parsedEntries = 0;
        let buffer = "";
        const input = fs.createReadStream(sourcePath);
        const stream = sourcePath.endsWith(".gz") ? input.pipe(zlib.createGunzip()) : input;
        stream.setEncoding("utf8");
        stream.on("data", chunk => {
            buffer += chunk;
            let start;
            let end;
            while ((start = buffer.indexOf("<entry>")) !== -1 &&
                   (end = buffer.indexOf("</entry>", start)) !== -1) {
                const entryXml = buffer.slice(start, end + 8);
                buffer = buffer.slice(end + 8);
                parsedEntries++;
                candidates.push(...parseEntry(entryXml, profile));
            }
            if (buffer.length > 2_000_000 && buffer.indexOf("<entry>") === -1) {
                buffer = buffer.slice(-100_000);
            }
        });
        stream.on("end", () => resolve({ candidates, parsedEntries }));
        stream.on("error", reject);
        input.on("error", reject);
    });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (!fs.existsSync(options.source)) {
        throw new Error("JMdict source not found: " + options.source + "\nDownload it from " + SOURCE_URL);
    }

    const sourceBuffer = fs.readFileSync(options.source);
    const sourceSha256 = crypto.createHash("sha256").update(sourceBuffer).digest("hex");
    const started = process.hrtime.bigint();
    const parsed = await readEntries(options.source, options.profile);
    const chosen = chooseEntries(
        parsed.candidates,
        options.limit,
        options.profile
    );
    const readings = new Set(chosen.selected.map(entry => entry.reading));
    const prefixes = new Set([""]);
    chosen.selected.forEach(entry => {
        for (let length = 1; length <= entry.reading.length; length++) {
            prefixes.add(entry.reading.slice(0, length));
        }
    });

    const metadata = {
        formatVersion: options.profile === "core" ? 2 : 1,
        profile: options.profile,
        source: "JMdict_e",
        sourceUrl: SOURCE_URL,
        sourceSha256,
        license: "CC BY-SA 4.0",
        entryCount: chosen.selected.length,
        uniqueReadings: readings.size,
        prefixCount: prefixes.size
    };
    const output = renderOutput(chosen.selected, metadata);
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, output, "utf8");

    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(JSON.stringify({
        sourceEntries: parsed.parsedEntries,
        eligibleCandidates: chosen.available,
        outputEntries: chosen.selected.length,
        uniqueReadings: readings.size,
        prefixCount: prefixes.size,
        outputBytes: Buffer.byteLength(output),
        posCounts: chosen.counts,
        buildMs: Number(elapsedMs.toFixed(2)),
        sourceSha256
    }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
});
