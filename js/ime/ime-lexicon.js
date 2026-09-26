(function () {
    "use strict";

    // RandomIME starter lexicon.
    // This project-authored list contains common lexical units and short IME
    // fragments only. It is not a sentence corpus or dialogue library.

    const entries = [];
    const seen = new Set();

    function addEntry(reading, text, pos, weight, metadata) {
        const key =
            reading + "\u0000" + text + "\u0000" + pos;

        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        entries.push(Object.freeze(Object.assign({
            reading,
            text,
            pos,
            weight
        }, metadata || {})));
    }

    function addGroup(pos, defaultWeight, rows) {
        rows.forEach(function (row) {
            const reading = row[0];
            const text = row[1];
            addEntry(
                reading,
                text,
                pos,
                (
                    typeof row[2] === "number" ?
                        row[2] : defaultWeight
                )
            );
        });
    }

    addGroup("noun", 0.72, [
        ["あい", "愛", 0.82], ["あいだ", "間"], ["あいて", "相手"],
        ["あお", "青"], ["あか", "赤"], ["あさ", "朝", 0.88],
        ["あし", "足"], ["あした", "明日", 0.92], ["あたま", "頭"],
        ["あと", "後", 0.86], ["あめ", "雨", 0.82], ["あめ", "飴", 0.58],
        ["いえ", "家", 0.9], ["いぬ", "犬", 0.84], ["いま", "今", 0.95],
        ["いみ", "意味"], ["いろ", "色"], ["うえ", "上"],
        ["うた", "歌"], ["うち", "家", 0.78], ["うみ", "海"],
        ["え", "絵"], ["えき", "駅"], ["おかね", "お金", 0.82],
        ["おと", "音"], ["おなか", "お腹"], ["おみせ", "お店"],
        ["かお", "顔"], ["かぜ", "風"], ["かぜ", "風邪"],
        ["かた", "方"], ["かみ", "紙"], ["かみ", "神"], ["かみ", "髪"],
        ["からだ", "体"], ["かわ", "川"], ["き", "木"], ["き", "気", 0.88],
        ["きおく", "記憶"], ["きもち", "気持ち", 0.85], ["きょう", "今日", 0.95],
        ["きょう", "京", 0.42], ["くうき", "空気"], ["くるま", "車"],
        ["けさ", "今朝"], ["こえ", "声"], ["こころ", "心"],
        ["こと", "事", 0.88], ["ことば", "言葉"], ["こども", "子供"],
        ["ごはん", "ご飯", 0.9], ["さかな", "魚"], ["じかん", "時間", 0.9],
        ["しごと", "仕事", 0.88], ["した", "下"], ["しゃしん", "写真", 0.82],
        ["しゅうまつ", "週末"], ["そと", "外"], ["そら", "空"],
        ["たべもの", "食べ物"], ["だれ", "誰", 0.88], ["ちから", "力"],
        ["つき", "月"], ["つぎ", "次"], ["て", "手"],
        ["てんき", "天気", 0.86], ["でんわ", "電話", 0.82], ["ところ", "所"],
        ["ともだち", "友達", 0.9], ["なか", "中"], ["なまえ", "名前", 0.86],
        ["ねこ", "猫", 0.9], ["はな", "花"], ["はな", "鼻", 0.65],
        ["はなし", "話", 0.84], ["ひと", "人", 0.92], ["ひる", "昼"],
        ["ふく", "服"], ["へや", "部屋", 0.82], ["ほし", "星"],
        ["ほん", "本", 0.86], ["まち", "街"], ["みず", "水", 0.86],
        ["みせ", "店"], ["みち", "道"], ["もの", "物", 0.84],
        ["もんだい", "問題"], ["やま", "山"], ["ゆめ", "夢"],
        ["よる", "夜", 0.84], ["りゆう", "理由"], ["れんらく", "連絡"],
        ["わけ", "訳"], ["わたし", "私", 0.92]
    ]);

    addGroup("verb", 0.74, [
        ["あう", "会う", 0.84], ["あう", "合う"], ["あける", "開ける"],
        ["あそぶ", "遊ぶ"], ["あつまる", "集まる"], ["いう", "言う", 0.92],
        ["いく", "行く", 0.94], ["いそぐ", "急ぐ"], ["いる", "いる", 0.94],
        ["いる", "居る"], ["うごく", "動く"], ["うたう", "歌う"],
        ["うる", "売る"], ["おきる", "起きる", 0.86], ["おく", "置く"],
        ["おくる", "送る", 0.84], ["おもう", "思う", 0.92], ["おわる", "終わる"],
        ["かう", "買う", 0.86], ["かえる", "帰る", 0.88], ["かえる", "変える"],
        ["かく", "書く"], ["かんがえる", "考える", 0.84], ["きく", "聞く", 0.88],
        ["きく", "聴く"], ["きる", "着る"], ["きる", "切る"],
        ["くる", "来る", 0.92], ["こたえる", "答える"], ["さがす", "探す"],
        ["しる", "知る", 0.88], ["すむ", "住む"], ["する", "する", 0.98],
        ["だす", "出す", 0.88], ["たべる", "食べる", 0.92], ["つかう", "使う", 0.88],
        ["つく", "着く"], ["つくる", "作る", 0.86], ["つづく", "続く"],
        ["でかける", "出かける"], ["できる", "できる", 0.94], ["とぶ", "飛ぶ"],
        ["とる", "取る"], ["とる", "撮る"], ["なおす", "直す"],
        ["なく", "泣く"], ["なる", "なる", 0.94], ["ねる", "寝る", 0.9],
        ["のむ", "飲む", 0.88], ["はいる", "入る", 0.86], ["はじまる", "始まる"],
        ["はなす", "話す", 0.88], ["まつ", "待つ", 0.9], ["みる", "見る", 0.94],
        ["みる", "観る"], ["もつ", "持つ", 0.86], ["やすむ", "休む"],
        ["やる", "やる", 0.9], ["よぶ", "呼ぶ"], ["よむ", "読む", 0.86],
        ["わかる", "分かる", 0.94], ["わすれる", "忘れる", 0.82],
        ["あいたい", "会いたい", 0.82], ["いきたい", "行きたい", 0.86],
        ["かえりたい", "帰りたい"], ["しらない", "知らない", 0.88],
        ["できない", "できない", 0.88], ["みたい", "見たい", 0.84],
        ["わからない", "分からない", 0.9]
    ]);

    addGroup("adjective", 0.74, [
        ["あかるい", "明るい"], ["あつい", "暑い", 0.86], ["あつい", "熱い"],
        ["あぶない", "危ない"], ["あまい", "甘い"], ["いい", "いい", 0.96],
        ["うれしい", "嬉しい", 0.88], ["おいしい", "美味しい", 0.9],
        ["おおい", "多い"], ["おおきい", "大きい"], ["おそい", "遅い"],
        ["おもしろい", "面白い", 0.88], ["かわいい", "可愛い", 0.94],
        ["きらい", "嫌い", 0.84], ["くらい", "暗い"], ["こわい", "怖い", 0.84],
        ["さむい", "寒い", 0.86], ["すごい", "凄い", 0.92], ["たかい", "高い"],
        ["たのしい", "楽しい", 0.88], ["ちいさい", "小さい"], ["つよい", "強い"],
        ["ながい", "長い"], ["ねむい", "眠い", 0.9], ["はやい", "早い"],
        ["はやい", "速い"], ["ひくい", "低い"], ["ひろい", "広い"],
        ["ふるい", "古い"], ["ほしい", "欲しい", 0.92], ["むずかしい", "難しい"],
        ["やさしい", "優しい"], ["やすい", "安い"], ["やばい", "やばい", 0.94],
        ["よい", "良い", 0.84], ["わるい", "悪い", 0.86]
    ]);

    addGroup("adverb", 0.76, [
        ["あまり", "あまり"], ["いちばん", "一番", 0.84], ["いつも", "いつも", 0.86],
        ["いまさら", "今さら"], ["いろいろ", "色々", 0.82], ["きっと", "きっと", 0.84],
        ["けっこう", "結構", 0.82], ["こんど", "今度", 0.86], ["さすが", "さすが"],
        ["しばらく", "しばらく"], ["すぐ", "すぐ", 0.9], ["すこし", "少し", 0.86],
        ["ずっと", "ずっと", 0.88], ["ぜったい", "絶対", 0.88], ["ぜんぜん", "全然", 0.88],
        ["そろそろ", "そろそろ", 0.86], ["たぶん", "多分", 0.9], ["たまたま", "たまたま"],
        ["ちゃんと", "ちゃんと", 0.86], ["ちょっと", "ちょっと", 0.94],
        ["とても", "とても"], ["とりあえず", "とりあえず", 0.86], ["なかなか", "なかなか"],
        ["なんとなく", "なんとなく", 0.84], ["ほんとうに", "本当に", 0.88],
        ["ほんとに", "ほんとに", 0.9], ["また", "また", 0.9], ["まだ", "まだ", 0.92],
        ["もう", "もう", 0.94], ["もっと", "もっと", 0.88], ["やっぱり", "やっぱり", 0.9],
        ["やっぱ", "やっぱ", 0.9], ["ゆっくり", "ゆっくり", 0.84], ["わりと", "割と"]
    ]);

    addGroup("particle", 0.88, [
        ["は", "は", 0.98], ["が", "が", 0.96], ["を", "を", 0.96],
        ["に", "に", 0.97], ["で", "で", 0.96], ["と", "と", 0.95],
        ["も", "も", 0.95], ["へ", "へ"], ["の", "の", 0.98],
        ["から", "から", 0.92], ["まで", "まで", 0.86], ["より", "より"],
        ["だけ", "だけ", 0.88], ["しか", "しか"], ["くらい", "くらい"],
        ["ぐらい", "ぐらい"], ["って", "って", 0.94], ["とか", "とか", 0.9],
        ["でも", "でも", 0.94], ["けど", "けど", 0.92], ["ので", "ので", 0.86],
        ["のに", "のに", 0.84], ["なら", "なら", 0.88], ["たら", "たら", 0.86],
        ["ながら", "ながら"], ["について", "について"], ["みたい", "みたい", 0.9],
        ["みたいな", "みたいな", 0.84], ["かも", "かも", 0.92], ["かな", "かな", 0.94],
        ["よ", "よ", 0.94], ["ね", "ね", 0.96], ["な", "な", 0.88],
        ["さ", "さ"], ["わ", "わ"], ["ぞ", "ぞ", 0.58], ["ぜ", "ぜ", 0.58]
    ]);

    addGroup("pronoun", 0.84, [
        ["これ", "これ", 0.94], ["それ", "それ", 0.94], ["あれ", "あれ", 0.88],
        ["ここ", "ここ", 0.92], ["そこ", "そこ", 0.9], ["あそこ", "あそこ"],
        ["こちら", "こちら"], ["そちら", "そちら"], ["どこ", "どこ", 0.92],
        ["どれ", "どれ", 0.86], ["どっち", "どっち", 0.9], ["だれ", "誰", 0.9],
        ["なに", "何", 0.96], ["なん", "何", 0.96], ["いつ", "いつ", 0.92],
        ["どう", "どう", 0.96], ["どんな", "どんな", 0.88], ["こんな", "こんな", 0.9],
        ["そんな", "そんな", 0.9], ["あんな", "あんな"], ["みんな", "みんな", 0.9],
        ["じぶん", "自分", 0.88], ["わたし", "私", 0.94], ["ぼく", "僕", 0.86],
        ["おれ", "俺", 0.82]
    ]);

    addGroup("fragment", 0.82, [
        ["ありがとう", "ありがとう", 0.96], ["ありがと", "ありがと", 0.94],
        ["おはよう", "おはよう", 0.94], ["おやすみ", "おやすみ", 0.94],
        ["こんにちは", "こんにちは", 0.9], ["こんばんは", "こんばんは", 0.88],
        ["ごめん", "ごめん", 0.94], ["ごめんね", "ごめんね", 0.9],
        ["よろしく", "よろしく", 0.9], ["おねがい", "お願い", 0.9],
        ["だいじょうぶ", "大丈夫", 0.94], ["だめ", "駄目", 0.9],
        ["ほんと", "本当", 0.94], ["まじ", "まじ", 0.94], ["まじで", "まじで", 0.92],
        ["そう", "そう", 0.96], ["そうか", "そうか", 0.88], ["そうだ", "そうだ", 0.88],
        ["そうだね", "そうだね", 0.9], ["そうなの", "そうなの", 0.88],
        ["なんか", "なんか", 0.94], ["なんで", "なんで", 0.94],
        ["なんだ", "なんだ", 0.9], ["なんだろう", "なんだろう", 0.84],
        ["なにそれ", "なにそれ", 0.88], ["どうして", "どうして", 0.9],
        ["どうしよう", "どうしよう", 0.9], ["どうかな", "どうかな", 0.84],
        ["わかった", "分かった", 0.94], ["わかんない", "分かんない", 0.9],
        ["しらない", "知らない", 0.9], ["しらん", "知らん", 0.78],
        ["たしかに", "確かに", 0.9], ["なるほど", "なるほど", 0.92],
        ["いいね", "いいね", 0.94], ["いいよ", "いいよ", 0.92],
        ["いやだ", "嫌だ", 0.88], ["やだ", "やだ", 0.9],
        ["やった", "やった", 0.9], ["むり", "無理", 0.94],
        ["かもしれない", "かもしれない", 0.86], ["かもね", "かもね", 0.86],
        ["だよ", "だよ", 0.92], ["だね", "だね", 0.94],
        ["だな", "だな", 0.84], ["です", "です", 0.96], ["ます", "ます", 0.94],
        ["でした", "でした", 0.86], ["ません", "ません", 0.84],
        ["ほしい", "欲しい", 0.94], ["ほしく", "欲しく", 0.82],
        ["みたい", "みたい", 0.92], ["みたいな", "みたいな", 0.86]
    ]);

    addGroup("interjection", 0.78, [
        ["あ", "あ", 0.9], ["ああ", "ああ", 0.84], ["あっ", "あっ", 0.88],
        ["え", "え", 0.94], ["ええ", "ええ", 0.82], ["えっ", "えっ", 0.92],
        ["お", "お", 0.82], ["おお", "おお", 0.8], ["おっ", "おっ", 0.82],
        ["うん", "うん", 0.96], ["ううん", "ううん", 0.9], ["うーん", "うーん", 0.9],
        ["へえ", "へえ", 0.86], ["へー", "へー", 0.84], ["ほう", "ほう", 0.72],
        ["まあ", "まあ", 0.9], ["いや", "いや", 0.92], ["えっと", "えっと", 0.9],
        ["あの", "あの", 0.9], ["その", "その", 0.88], ["ねえ", "ねえ", 0.9],
        ["わあ", "わあ", 0.82], ["わー", "わー", 0.82], ["ふーん", "ふーん", 0.8]
    ]);

    // Short sentence-final units. These are independent IME words/fragments,
    // not ordered slots or complete reply templates.
    addGroup("ending", 0.88, [
        ["ね", "ね", 0.98], ["よ", "よ", 0.96],
        ["よね", "よね", 0.94], ["かな", "かな", 0.96],
        ["かも", "かも", 0.94], ["けど", "けど", 0.92],
        ["から", "から", 0.88], ["ので", "ので", 0.84],
        ["の", "の", 0.9], ["んだ", "んだ", 0.92],
        ["んだけど", "んだけど", 0.88]
    ]);

    addGroup("time", 0.8, [
        ["きょう", "今日", 0.96], ["きのう", "昨日", 0.9], ["あした", "明日", 0.94],
        ["あさ", "朝", 0.88], ["ひる", "昼", 0.84], ["よる", "夜", 0.88],
        ["いま", "今", 0.96], ["あと", "後", 0.88], ["さき", "先", 0.82],
        ["つぎ", "次", 0.84], ["まえ", "前", 0.84], ["こんど", "今度", 0.9],
        ["さいきん", "最近", 0.88], ["まいにち", "毎日", 0.84],
        ["しゅうまつ", "週末", 0.84], ["らいしゅう", "来週", 0.82]
    ]);

    const generatedData = window.RandomIMELexiconData;

    if (
        generatedData &&
        Array.isArray(generatedData.entries)
    ) {
        generatedData.entries.forEach(function (row) {
            if (!Array.isArray(row) || row.length < 4) {
                return;
            }

            const metadata = { generated: true };
            if (row.length >= 5) {
                metadata.chatWeight = Number(row[4]) || 0;
            }
            if (row.length >= 6) {
                metadata.inflectionClass = row[5] || null;
            }

            addEntry(
                String(row[0] || ""),
                String(row[1] || ""),
                String(row[2] || "other"),
                Number(row[3]) || 0.5,
                metadata
            );
        });
    }

    const animeOverrides =
        window.RANDOM_IME_ANIME_OVERRIDES;

    if (Array.isArray(animeOverrides)) {
        animeOverrides.forEach(function (entry) {
            if (
                !entry ||
                typeof entry.reading !== "string" ||
                typeof entry.text !== "string"
            ) {
                return;
            }

            addEntry(
                entry.reading,
                entry.text,
                "proper-noun",
                Math.max(
                    0.01,
                    Math.min(1, Number(entry.weight) / 100)
                ),
                { anime: true }
            );
        });
    }

    // Inflections are virtual runtime candidates. They do not increase the
    // base lexicon count and are never treated as independent lemmas.
    const inflectionEngine = window.RandomIMEInflections || null;
    const inflectedEntries = [];
    const inflectedSeen = new Set();

    if (inflectionEngine) {
        entries.slice().forEach(function (entry) {
            inflectionEngine.expandEntry(entry).forEach(function (derived) {
                const key = derived.reading + "\u0000" +
                    derived.text + "\u0000" + derived.pos;
                if (seen.has(key) || inflectedSeen.has(key)) return;
                inflectedSeen.add(key);
                inflectedEntries.push(Object.freeze(derived));
            });
        });
    }

    const searchEntries = entries.concat(inflectedEntries);
    const customLexicon = window.RandomIMECustomLexicon || null;
    const localGrammar = window.RandomIMELocalGrammar || null;
    const exactIndex = new Map();
    const prefixIndex = new Map();
    const dictionary = Object.create(null);

    searchEntries.forEach(function (entry) {
        if (!exactIndex.has(entry.reading)) {
            exactIndex.set(entry.reading, []);
        }
        exactIndex.get(entry.reading).push(entry);

        if (!dictionary[entry.reading]) {
            dictionary[entry.reading] = [];
        }
        if (!dictionary[entry.reading].includes(entry.text)) {
            dictionary[entry.reading].push(entry.text);
        }

        for (
            let length = 0;
            length <= entry.reading.length;
            length++
        ) {
            const prefix = entry.reading.slice(0, length);

            if (!prefixIndex.has(prefix)) {
                prefixIndex.set(prefix, []);
            }
            prefixIndex.get(prefix).push(entry);
        }
    });

    // Keep the browser index broad, but rank each prefix once at startup so
    // every Flick does not repeatedly sort thousands of entries. Runtime
    // context re-ranking scans a bounded high-value window; exact lookup and
    // the full stored lexicon remain unchanged.
    prefixIndex.forEach(function (list) {
        list.sort(function (left, right) {
            return right.weight - left.weight ||
                left.reading.length - right.reading.length;
        });
    });

    function prefixScanLimit(prefix, requested) {
        const floor = prefix.length === 0 ? 1200 :
            prefix.length === 1 ? 900 : 500;
        return Math.max(floor, requested * 16);
    }

    function contextMultiplier(entry, options) {
        const config = options || {};
        const influence = Number(config.grammarInfluence) || 0;
        const transitions = window.RandomIMEPOSTransitions || null;
        const desiredInfluence = Math.max(
            0,
            Number(config.posAttraction) || 0
        );
        const compatibility =
            transitions && config.desiredPos ?
                transitions.compatibility(config.desiredPos, entry.pos) : 0;
        let multiplier = 1;

        multiplier *= 1 + Math.max(
            -0.35,
            Math.min(0.35, Number(entry.chatWeight) || 0)
        ) * 0.3;

        if (
            localGrammar &&
            Array.isArray(config.localSegments)
        ) {
            multiplier *= localGrammar.evaluateCandidate(
                config.localSegments,
                entry
            ).multiplier;
        }

        if (desiredInfluence > 0 && config.desiredPos) {
            multiplier *= 1 + desiredInfluence * compatibility;
        }

        if (!config.previousPos || influence <= 0) {
            return multiplier;
        }

        if (
            config.previousPos === "noun" &&
            entry.pos === "particle"
        ) {
            return multiplier * (1 + influence);
        }

        if (
            config.previousPos === "verb" &&
            (
                entry.pos === "particle" ||
                entry.pos === "fragment"
            )
        ) {
            return multiplier * (1 + influence * 0.45);
        }

        return multiplier;
    }

    function getExact(reading) {
        const builtIn = (
            exactIndex.get(String(reading || "")) ||
            []
        ).slice();
        const custom = customLexicon ?
            customLexicon.getExact(reading) : [];
        return builtIn.concat(custom);
    }

    function getPrefixMatches(prefix, options) {
        const config = options || {};
        const limit = Math.max(
            1,
            Math.floor(config.limit || 50)
        );

        const builtIn = (
            prefixIndex.get(String(prefix || "")) ||
            []
        ).slice(0, prefixScanLimit(String(prefix || ""), limit));
        const custom = customLexicon ?
            customLexicon.getPrefixMatches(prefix, {
                limit: Math.max(limit * 4, 100)
            }) : [];

        return builtIn.concat(custom).sort(function (left, right) {
            return (
                right.weight * contextMultiplier(right, config) -
                left.weight * contextMultiplier(left, config)
            );
        }).slice(0, limit);
    }

    function getPredictions(prefix, options) {
        const reading = String(prefix || "");
        const config = options || {};
        const limit = Math.max(
            1,
            Math.floor(config.limit || 6)
        );

        return getPrefixMatches(
            reading,
            Object.assign({}, config, {
                limit: Math.max(limit * 8, 40)
            })
        ).filter(function (entry) {
            return entry.reading.length > reading.length;
        }).slice(0, limit);
    }

    function getNextKanaWeights(prefix, options) {
        const reading = String(prefix || "");
        const config = options || {};
        const matches = (prefixIndex.get(reading) || []).slice(
            0,
            reading.length === 0 ? 1600 :
                reading.length === 1 ? 1200 : 800
        ).concat(
            customLexicon ?
                customLexicon.getPrefixMatches(reading, { limit: 5000 }) : []
        );
        const weights = new Map();

        matches.forEach(function (entry) {
            if (entry.reading.length <= reading.length) {
                return;
            }

            const kana = entry.reading.charAt(reading.length);
            const weight =
                entry.weight *
                contextMultiplier(entry, config);

            weights.set(
                kana,
                (weights.get(kana) || 0) + weight
            );
        });

        return Array.from(weights.entries()).map(
            function (item) {
                return {
                    kana: item[0],
                    weight: item[1]
                };
            }
        ).sort(function (left, right) {
            return right.weight - left.weight;
        });
    }

    function getGuidedNextKanaWeights(prefix, options) {
        const reading = String(prefix || "");
        const config = options || {};
        const transitions = window.RandomIMEPOSTransitions || null;
        const desiredPos = config.desiredPos;

        if (!desiredPos || !transitions || desiredPos === "unknown") {
            return [];
        }

        const matches = (prefixIndex.get(reading) || []).slice(
            0,
            reading.length === 0 ? 1600 :
                reading.length === 1 ? 1200 : 800
        ).concat(
            customLexicon ?
                customLexicon.getPrefixMatches(reading, { limit: 5000 }) : []
        );
        const weights = new Map();

        matches.forEach(function (entry) {
            if (entry.reading.length <= reading.length) return;
            const compatibility = transitions.compatibility(
                desiredPos,
                entry.pos
            );
            if (compatibility <= 0) return;
            const kana = entry.reading.charAt(reading.length);
            const inflectionMultiplier = entry.inflectionType ?
                (reading.length >= 3 ? 1.14 :
                    (reading.length === 2 ? 1.02 : 0.78)) : 1;
            const weight = entry.weight *
                (0.3 + compatibility * 0.7) *
                inflectionMultiplier;
            weights.set(kana, (weights.get(kana) || 0) + weight);
        });

        return Array.from(weights.entries()).map(function (item) {
            return { kana: item[0], weight: item[1] };
        }).sort(function (left, right) {
            return right.weight - left.weight;
        });
    }

    window.RandomIMELexicon = Object.freeze({
        version: "0.2.0",
        entries: Object.freeze(entries.slice()),
        inflectedEntries: Object.freeze(inflectedEntries.slice()),
        customLexicon,
        dictionary: Object.freeze(dictionary),
        metadata:
            generatedData && generatedData.metadata ?
                generatedData.metadata : null,
        getExact,
        getPrefixMatches,
        getPredictions,
        getNextKanaWeights,
        getGuidedNextKanaWeights
    });

    console.log(
        "[RandomIME] starter lexicon loaded:",
        entries.length,
        "base entries,",
        inflectedEntries.length,
        "virtual inflections"
    );
})();
