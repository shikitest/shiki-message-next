(function () {
    "use strict";

    // Small, hand-maintained word/fragment weights for mobile chat.
    // This is deliberately not a sentence library and never reads chat context.
    const READING_OVERRIDES = Object.freeze({
        "あ": { weight: 0.08, terminal: 0.1, category: "interjection" },
        "え": { weight: 0.16, terminal: 0.35, category: "interjection" },
        "うん": { weight: 0.34, terminal: 0.95, category: "interjection" },
        "へえ": { weight: 0.25, terminal: 0.86, category: "interjection" },
        "わ": { weight: 0.08, terminal: 0.15, category: "particle" },
        "そう": { weight: 0.31, terminal: 0.82, category: "fragment" },
        "まあ": { weight: 0.25, terminal: 0.7, category: "fragment" },
        "でも": { weight: 0.23, terminal: 0.58, category: "fragment" },
        "たぶん": { weight: 0.3, terminal: 0.72, category: "fragment" },
        "なん": { weight: 0.22, terminal: 0.3, category: "fragment" },
        "なんか": { weight: 0.32, terminal: 0.72, category: "fragment" },
        "なんで": { weight: 0.32, terminal: 0.82, category: "fragment" },
        "なんだ": { weight: 0.27, terminal: 0.72, category: "fragment" },
        "なに": { weight: 0.3, terminal: 0.76, category: "fragment" },
        "どこ": { weight: 0.34, terminal: 0.88, category: "fragment" },
        "だれ": { weight: 0.3, terminal: 0.84, category: "fragment" },
        "これ": { weight: 0.27, terminal: 0.68, category: "fragment" },
        "それ": { weight: 0.27, terminal: 0.68, category: "fragment" },
        "あれ": { weight: 0.24, terminal: 0.66, category: "fragment" },
        "きょう": { weight: 0.3, terminal: 0.36, category: "daily" },
        "きのう": { weight: 0.27, terminal: 0.42, category: "daily" },
        "あした": { weight: 0.29, terminal: 0.42, category: "daily" },
        "ともだち": { weight: 0.25, terminal: 0.35, category: "daily" },
        "がっこう": { weight: 0.2, terminal: 0.3, category: "daily" },
        "いえ": { weight: 0.2, terminal: 0.42, category: "daily" },
        "ねる": { weight: 0.29, terminal: 0.7, category: "daily" },
        "みる": { weight: 0.25, terminal: 0.62, category: "daily" },
        "いく": { weight: 0.27, terminal: 0.66, category: "daily" },
        "くる": { weight: 0.24, terminal: 0.64, category: "daily" },
        "すき": { weight: 0.32, terminal: 0.78, category: "feeling" },
        "きらい": { weight: 0.23, terminal: 0.72, category: "feeling" },
        "ねむい": { weight: 0.36, terminal: 0.93, category: "feeling" },
        "つかれた": { weight: 0.35, terminal: 0.94, category: "feeling" },
        "おやすみ": { weight: 0.42, terminal: 1, category: "chat-terminal" },
        "ありがとう": { weight: 0.42, terminal: 1, category: "chat-terminal" },
        "ごめん": { weight: 0.38, terminal: 0.98, category: "chat-terminal" },
        "ほんと": { weight: 0.34, terminal: 0.86, category: "fragment" },
        "まじ": { weight: 0.35, terminal: 0.86, category: "fragment" },
        "やばい": { weight: 0.39, terminal: 0.92, category: "feeling" },
        "すごい": { weight: 0.35, terminal: 0.9, category: "feeling" },
        "かわいい": { weight: 0.4, terminal: 0.94, category: "feeling" },
        "いい": { weight: 0.31, terminal: 0.86, category: "fragment" },
        "いや": { weight: 0.28, terminal: 0.82, category: "fragment" },
        "ちょっと": { weight: 0.3, terminal: 0.65, category: "fragment" },
        "もう": { weight: 0.24, terminal: 0.58, category: "fragment" },
        "まだ": { weight: 0.23, terminal: 0.58, category: "fragment" },
        "すぐ": { weight: 0.22, terminal: 0.55, category: "fragment" },
        "だいじょうぶ": { weight: 0.4, terminal: 0.98, category: "chat-terminal" },
        "おねがい": { weight: 0.35, terminal: 0.9, category: "chat-terminal" },
        "もしもし": { weight: 0.34, terminal: 0.9, category: "chat-terminal" },
        "かな": { weight: 0.28, terminal: 0.94, category: "ending" },
        "かも": { weight: 0.28, terminal: 0.94, category: "ending" },
        "けど": { weight: 0.23, terminal: 0.82, category: "ending" },
        "から": { weight: 0.2, terminal: 0.58, category: "ending" },
        "ので": { weight: 0.18, terminal: 0.48, category: "ending" },
        "だね": { weight: 0.24, terminal: 0.92, category: "ending" },
        "だよ": { weight: 0.22, terminal: 0.9, category: "ending" },
        "よね": { weight: 0.22, terminal: 0.92, category: "ending" },
        "みたい": { weight: 0.26, terminal: 0.78, category: "fragment" },
        "っぽい": { weight: 0.2, terminal: 0.76, category: "fragment" },
        "はい": { weight: 0.28, terminal: 0.9, category: "interjection" },
        "むり": { weight: 0.3, terminal: 0.9, category: "chat-terminal" },
        "は": { weight: 0.04, terminal: 0.04, category: "particle" },
        "が": { weight: 0.04, terminal: 0.04, category: "particle" },
        "を": { weight: 0.04, terminal: 0.03, category: "particle" },
        "に": { weight: 0.04, terminal: 0.04, category: "particle" },
        "で": { weight: 0.04, terminal: 0.05, category: "particle" },
        "も": { weight: 0.04, terminal: 0.08, category: "particle" },
        "の": { weight: 0.04, terminal: 0.08, category: "particle" },
        "と": { weight: 0.04, terminal: 0.05, category: "particle" },
        "よ": { weight: 0.12, terminal: 0.32, category: "particle" },
        "ね": { weight: 0.16, terminal: 0.38, category: "particle" }
    });

    const TEXT_OVERRIDES = Object.freeze({
        "今日": { weight: 0.22, category: "daily" },
        "昨日": { weight: 0.2, category: "daily" },
        "明日": { weight: 0.22, category: "daily" },
        "友達": { weight: 0.18, category: "daily" },
        "学校": { weight: 0.14, category: "daily" },
        "家": { weight: 0.14, category: "daily" },
        "寝る": { weight: 0.2, terminal: 0.62, category: "daily" },
        "見る": { weight: 0.14, category: "daily" },
        "行く": { weight: 0.18, terminal: 0.58, category: "daily" },
        "来る": { weight: 0.16, terminal: 0.56, category: "daily" },
        "好き": { weight: 0.24, terminal: 0.76, category: "feeling" },
        "嫌い": { weight: 0.15, terminal: 0.7, category: "feeling" },
        "眠い": { weight: 0.28, terminal: 0.9, category: "feeling" },
        "疲れた": { weight: 0.28, terminal: 0.92, category: "feeling" },
        "可愛い": { weight: 0.3, terminal: 0.92, category: "feeling" },
        "大丈夫": { weight: 0.28, terminal: 0.96, category: "chat-terminal" },
        "拉致": { weight: -1.1, category: "news-formal" },
        "戦闘機": { weight: -1.15, category: "news-formal" },
        "内閣府": { weight: -1.1, category: "news-formal" },
        "拳銃": { weight: -0.9, category: "news-formal" },
        "払拭": { weight: -0.88, category: "formal" },
        "御覧": { weight: -0.82, category: "formal" },
        "乃至": { weight: -0.95, category: "formal" },
        "当該": { weight: -0.92, category: "formal" },
        "於いて": { weight: -0.9, category: "formal" },
        "及び": { weight: -1, category: "formal" },
        "琉球": { weight: -0.72, category: "proper-formal" },
        "原子力": { weight: -0.78, category: "technical" },
        "証券": { weight: -0.72, category: "technical" },
        "法人": { weight: -0.68, category: "formal" }
    });

    const LENGTH_BALANCE_READINGS = Object.freeze({
        "から": true,
        "ので": true,
        "だね": true,
        "だよ": true,
        "よね": true,
        "みたい": true,
        "っぽい": true,
        "はい": true,
        "むり": true,
        "は": true,
        "が": true,
        "を": true,
        "に": true,
        "で": true,
        "も": true,
        "の": true,
        "と": true
    });

    function resolve(reading, text, options) {
        const normalizedReading = String(reading || "");
        const includeLengthBalance = !options ||
            options.lengthBalanceEnabled !== false;
        const readingRule =
            !includeLengthBalance &&
            LENGTH_BALANCE_READINGS[normalizedReading] ?
                null :
                READING_OVERRIDES[normalizedReading] || null;
        const textRule = TEXT_OVERRIDES[String(text || "")] || null;
        return {
            weight: (readingRule ? readingRule.weight || 0 : 0) +
                (textRule ? textRule.weight || 0 : 0),
            terminal: Math.max(
                readingRule ? readingRule.terminal || 0 : 0,
                textRule ? textRule.terminal || 0 : 0
            ),
            category: (textRule && textRule.category) ||
                (readingRule && readingRule.category) || null,
            matched: Boolean(readingRule || textRule)
        };
    }

    window.RandomIMEChatOverrides = Object.freeze({
        version: "1.0.0",
        readings: READING_OVERRIDES,
        texts: TEXT_OVERRIDES,
        resolve
    });
})();
