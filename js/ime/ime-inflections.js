(function () {
    "use strict";

    // Small, deterministic Japanese inflection engine. It derives local word
    // forms from lemma + POS only and has no access to chat or sentence meaning.

    const GODAN_RU = new Set([
        "かえる", "きる", "しる", "はいる", "はしる", "へる",
        "しゃべる", "すべる", "にぎる", "まいる", "かぎる"
    ]);
    const ICHIDAN_RU = /[いきぎしじちぢにひびぴみりえけげせぜてでねへべぺめれ]る$/;
    const GODAN = Object.freeze({
        "う": { a: "わ", i: "い", te: "って", past: "った" },
        "く": { a: "か", i: "き", te: "いて", past: "いた" },
        "ぐ": { a: "が", i: "ぎ", te: "いで", past: "いだ" },
        "す": { a: "さ", i: "し", te: "して", past: "した" },
        "つ": { a: "た", i: "ち", te: "って", past: "った" },
        "ぬ": { a: "な", i: "に", te: "んで", past: "んだ" },
        "ぶ": { a: "ば", i: "び", te: "んで", past: "んだ" },
        "む": { a: "ま", i: "み", te: "んで", past: "んだ" },
        "る": { a: "ら", i: "り", te: "って", past: "った" }
    });

    function replaceLast(value, suffix) {
        return String(value || "").slice(0, -1) + suffix;
    }

    function form(reading, text, type, conjugationType) {
        return { reading, text, inflectionType: type, conjugationType };
    }

    function verbForms(entry) {
        const reading = entry.reading;
        const text = entry.text;
        const explicit = Object.prototype.hasOwnProperty.call(
            entry,
            "inflectionClass"
        );
        const inflectionClass = explicit ? entry.inflectionClass : null;
        if (explicit && !inflectionClass) return [];
        if (!/[うくぐすつぬぶむる]$/.test(reading)) return [];

        if (
            inflectionClass === "irregular-suru" ||
            (!explicit && reading.endsWith("する"))
        ) {
            const readingStem = reading.slice(0, -2);
            const stemText = text.endsWith("する") ? text.slice(0, -2) :
                (readingStem ? text : "");
            return [
                form(readingStem + "した", stemText + "した", "past", "irregular-suru"),
                form(readingStem + "しない", stemText + "しない", "negative", "irregular-suru"),
                form(readingStem + "して", stemText + "して", "te-form", "irregular-suru"),
                form(readingStem + "したい", stemText + "したい", "tai", "irregular-suru"),
                form(readingStem + "してる", stemText + "してる", "progressive-casual", "irregular-suru"),
                form(readingStem + "してた", stemText + "してた", "past-progressive-casual", "irregular-suru")
            ];
        }

        if (
            inflectionClass === "irregular-kuru" ||
            (!explicit && reading === "くる")
        ) {
            const kanji = text.includes("来");
            return [
                form("きた", kanji ? "来た" : "きた", "past", "irregular-kuru"),
                form("こない", kanji ? "来ない" : "こない", "negative", "irregular-kuru"),
                form("きて", kanji ? "来て" : "きて", "te-form", "irregular-kuru"),
                form("きたい", kanji ? "来たい" : "きたい", "tai", "irregular-kuru"),
                form("きてる", kanji ? "来てる" : "きてる", "progressive-casual", "irregular-kuru"),
                form("きてた", kanji ? "来てた" : "きてた", "past-progressive-casual", "irregular-kuru")
            ];
        }

        const ichidan = explicit ? inflectionClass === "ichidan" :
            reading.endsWith("る") && ICHIDAN_RU.test(reading) &&
                !GODAN_RU.has(reading);
        if (ichidan) {
            const r = reading.slice(0, -1);
            const t = text.endsWith("る") ? text.slice(0, -1) : text;
            return [
                form(r + "た", t + "た", "past", "ichidan"),
                form(r + "ない", t + "ない", "negative", "ichidan"),
                form(r + "て", t + "て", "te-form", "ichidan"),
                form(r + "たい", t + "たい", "tai", "ichidan"),
                form(r + "てる", t + "てる", "progressive-casual", "ichidan"),
                form(r + "てた", t + "てた", "past-progressive-casual", "ichidan")
            ];
        }

        const ending = explicit && /^godan-[うくぐすつぬぶむる]$/.test(inflectionClass) ?
            inflectionClass.slice(-1) : reading.slice(-1);
        if (explicit && !inflectionClass.startsWith("godan-")) return [];
        if (!reading.endsWith(ending)) return [];
        const rule = GODAN[ending];
        if (!rule) return [];
        const readingStem = reading.slice(0, -1);
        const textStem = text.endsWith(ending) ? text.slice(0, -1) : text.slice(0, -1);
        let te = rule.te;
        let past = rule.past;
        if (reading === "いく") {
            te = "って";
            past = "った";
        }
        return [
            form(readingStem + past, textStem + past, "past", "godan-" + ending),
            form(readingStem + rule.a + "ない", textStem + rule.a + "ない", "negative", "godan-" + ending),
            form(readingStem + te, textStem + te, "te-form", "godan-" + ending),
            form(readingStem + rule.i + "たい", textStem + rule.i + "たい", "tai", "godan-" + ending),
            form(readingStem + te + "る", textStem + te + "る", "progressive-casual", "godan-" + ending),
            form(readingStem + te + "た", textStem + te + "た", "past-progressive-casual", "godan-" + ending)
        ];
    }

    function adjectiveForms(entry) {
        const reading = entry.reading;
        const text = entry.text;
        const explicit = Object.prototype.hasOwnProperty.call(
            entry,
            "inflectionClass"
        );
        if (explicit && entry.inflectionClass !== "i-adjective") return [];
        if (!reading.endsWith("い") || reading === "きらい") return [];
        const good = reading === "いい" || reading === "よい";
        const readingStem = good ? "よ" : reading.slice(0, -1);
        const textStem = good ? (text === "良い" ? "良" : "よ") :
            (text.endsWith("い") ? text.slice(0, -1) : text);
        return [
            form(readingStem + "かった", textStem + "かった", "past", "i-adjective"),
            form(readingStem + "くない", textStem + "くない", "negative", "i-adjective"),
            form(readingStem + "くて", textStem + "くて", "te-continuation", "i-adjective")
        ];
    }

    function expandEntry(entry) {
        const derived = entry.pos === "verb" ? verbForms(entry) :
            entry.pos === "adjective" ? adjectiveForms(entry) : [];
        return derived.filter(function (item) {
            return item.reading && item.text && item.reading !== entry.reading;
        }).map(function (item) {
            return Object.assign({}, item, {
                lemmaReading: entry.reading,
                lemmaText: entry.text,
                pos: entry.pos,
                weight: Math.max(0.35, (entry.weight || 0.5) * 0.92),
                chatWeight: Number(entry.chatWeight) || 0,
                inflectionClass: item.conjugationType
            });
        });
    }

    window.RandomIMEInflections = Object.freeze({
        version: "1.0.0",
        expandEntry,
        verbForms,
        adjectiveForms
    });
})();
