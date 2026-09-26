(function () {
    "use strict";

    // ============================================================
    // Random Flick IME
    //
    // 第一阶段目标：
    // 1. 不预先决定句意
    // 2. 不依赖自定义回复词库
    // 3. 从 Flick 假名输入行为开始
    // 4. 候选只是输入法建议，角色可以完全无视
    // 5. 最终文本由输入过程自己生长出来
    // ============================================================

    const VERSION = "0.4.3";

    // ============================================================
    // 基础设置
    // ============================================================

    const DEFAULT_OPTIONS = {
        minLength: 1,
        maxLength: 24,

        // 每确认一次 composition 后继续输入的基础概率
        continueChance: 0.68,

        // 当前 composition 存在词典候选时，打开候选栏的概率
        candidateChance: 0.68,

        // 只有原假名/片假名时，也可能打开候选栏
        fallbackCandidateChance: 0.05,

        // 候选栏中确认当前候选的概率
        chooseCandidateChance: 0.88,

        // 候选栏中向前/向后浏览的概率
        candidateBrowseChance: 0.22,

        // 不打开候选栏时，作为 IME conversion 确认片假名的概率
        katakanaChance: 0.035,

        // 下一次 Flick 的混合来源权重。自由路径始终保留非零权重。
        freeFlickWeight: 0.12,
        baseFreeFlickWeight: 0.12,
        predictionInfluence: 0.72,
        kanaTransitionInfluence: 0.08,

        // Stage 6: POS chooses only a local attraction for the current
        // segment. The selected reading still has to grow through Flicks.
        languageLayerEnabled: true,
        languageGuidanceInfluence: 1.65,
        posAttraction: 2.8,
        desiredPosCandidateBoost: 0.9,
        incompatibleCandidateAcceptance: 0.16,
        incompletePosContinueBoost: 0.38,
        localGrammarEnabled: true,
        invalidGrammarAcceptance: 0.14,

        // Stage 6.2: completion is inferred only from this IME session's
        // confirmed local structure. It never inspects chat or user text.
        completionAwareEnabled: true,
        highCompletionSendBoost: 0.34,
        mediumCompletionSendBoost: 0.1,
        lowCompletionContinueBoost: 0.1,
        completedTailFreeMultiplier: 0.24,
        mediumTailFreeMultiplier: 0.58,

        // Stage 6.3: this lightweight state observes only RandomIME's own
        // confirmed segment structure. It is not a semantic/context state.
        structuredStabilityEnabled: true,
        stableStructuredFreeMultiplier: 0.18,
        structuredStabilityTailBoost: 0.72,
        highStabilitySendBoost: 0.32,
        mediumStabilitySendBoost: 0.16,

        // Stage 4A.5: local probabilities only. Disabling this flag restores
        // the Step A decisions for fixed-seed A/B tests.
        naturalnessEnabled: true,
        lengthBalanceEnabled: true,
        unknownTailControlEnabled: true,
        segmentCohesionEnabled: true,
        localPathStickiness: 0.56,
        stablePathFreeFlickMultiplier: 0.58,
        unknownPathFreedom: 0.32,
        exactHitConfirmBoost: 0.2,
        strongPrefixConfirmBoost: 0.1,
        chatWeightInfluence: 0.22,
        postConfirmContinueChance: 0.68,
        completeFragmentSendBoost: 0.26,
        fragmentTerminalWeight: 0.18,
        startKanaBiasInfluence: 0.16,
        symbolEndingChance: 0.02,

        // Stage 4A.6: smooth length/information-density controls. These do
        // not select a target length; they only alter the next local choice.
        shortSegmentPenalty: 0.72,
        shortMessageContinueBoost: 0.16,
        secondSegmentAttraction: 0.18,
        segmentContinuationDecay: 0.075,
        segmentAttractionInfluence: 0.12,
        continuedSegmentFreeMultiplier: 0.55,
        continuedSegmentPredictionMultiplier: 1.6,
        shortPrefixCandidateBoost: 0.12,
        predictionCompletionBoost: 0,
        informationDensityInfluence: 0.16,
        structuredPairSendBoost: 0.06,
        structuredMessageSendBoost: 0.07,
        unknownTailPenaltyStrength: 0.82,
        tailContinueFloor: 0.24,
        tailConfirmUnknownFloor: 0.08,
        tailBackspaceWeight: 0.34,
        tailCancelWeight: 0.3,
        tailSendExistingWeight: 0.24,
        tailCandidateOpenBoost: 0.1,
        lengthCurveMidpoint: 14,
        lengthCurveSlope: 2.8,
        initialPredictionMultiplier: 0.68,

        // Stage 4A.8: local segment-boundary and prediction-completion
        // controls. They do not choose future words or rewrite final text.
        segmentCohesionStrength: 0.82,
        singleKanaRawConfirmFloor: 0.14,
        cohesionCandidateOpenBoost: 0.12,
        cohesionBackspaceChance: 0.035,
        cohesionSegmentDecay: 0.075,
        cohesionSecondSegmentMultiplier: 0.72,
        predictionSelectionFloor: 0.06,
        predictionSelectionCoverage: 0.72,
        predictionLongCompletionPenalty: 0.065,

        // 符号使用独立低概率 secondary path。
        symbolChance: 0.012,

        // prediction candidate 和排序参数
        predictionCandidateChance: 0.48,
        maxPredictionCandidates: 6,
        candidateRandomness: 0.12,

        // POS 只提供很轻的局部吸引，不构造语法模板。
        grammarInfluence: 0.08,

        // composition / 已确认文本的修正概率
        backspaceChance: 0.07,

        // Flick 后使用小字、浊音或半浊音键的概率
        kanaVariantChance: 0.16,

        // composition 越长，越倾向于局部确认；到上限强制确认
        baseConfirmChance: 0.12,
        confirmGrowthPerKana: 0.08,
        maxCompositionLength: 8,

        // 兼容 0.1.x 配置；0.2.0 已不再预先决定 segment 长度
        minSegmentKana: 1,
        maxSegmentKana: 4,

        // 防止随机状态机跑太久
        maxSteps: 120,
        maxCandidateMoves: 4,
        maxCorrections: 6,

        // 可选的软提示接口。本阶段不提供语法模板。
        grammarHintProvider: null,

        debug: false
    };

    const STATES = Object.freeze({
        IDLE: "IDLE",
        COMPOSING: "COMPOSING",
        CANDIDATE_SELECT: "CANDIDATE_SELECT",
        CONFIRMED: "CONFIRMED",
        CORRECTING: "CORRECTING",
        READY_TO_SEND: "READY_TO_SEND",
        SENT: "SENT"
    });

    // ============================================================
    // Flick 键盘
    //
    // 使用：
    // center = 点按
    // left / up / right / down = 四方向 Flick
    //
    // 日语 12 键 Flick 的核心是：
    // 一行假名由一个主键 + 四方向产生。
    // ============================================================

    const FLICK_KEYS = [
        {
            key: "あ",
            center: "あ",
            left: "い",
            up: "う",
            right: "え",
            down: "お"
        },
        {
            key: "か",
            center: "か",
            left: "き",
            up: "く",
            right: "け",
            down: "こ"
        },
        {
            key: "さ",
            center: "さ",
            left: "し",
            up: "す",
            right: "せ",
            down: "そ"
        },
        {
            key: "た",
            center: "た",
            left: "ち",
            up: "つ",
            right: "て",
            down: "と"
        },
        {
            key: "な",
            center: "な",
            left: "に",
            up: "ぬ",
            right: "ね",
            down: "の"
        },
        {
            key: "は",
            center: "は",
            left: "ひ",
            up: "ふ",
            right: "へ",
            down: "ほ"
        },
        {
            key: "ま",
            center: "ま",
            left: "み",
            up: "む",
            right: "め",
            down: "も"
        },
        {
            key: "や",
            center: "や",
            left: "（",
            up: "ゆ",
            right: "）",
            down: "よ"
        },
        {
            key: "ら",
            center: "ら",
            left: "り",
            up: "る",
            right: "れ",
            down: "ろ"
        },
        {
            key: "わ",
            center: "わ",
            left: "を",
            up: "ん",
            right: "ー",
            down: "〜"
        }
    ];

    const FLICK_DIRECTIONS = [
        "center",
        "left",
        "up",
        "right",
        "down"
    ];

    // ============================================================
    // 小字 / 浊音 / 半浊音
    //
    // 这一阶段先模拟成“输入后再做一次变换”。
    // 后面可以进一步模拟真实键盘上的小字/浊音键操作。
    // ============================================================

    const KANA_VARIANTS = {
        "か": ["が"],
        "き": ["ぎ"],
        "く": ["ぐ"],
        "け": ["げ"],
        "こ": ["ご"],

        "さ": ["ざ"],
        "し": ["じ"],
        "す": ["ず"],
        "せ": ["ぜ"],
        "そ": ["ぞ"],

        "た": ["だ"],
        "ち": ["ぢ"],
        "つ": ["づ", "っ"],
        "て": ["で"],
        "と": ["ど"],

        "は": ["ば", "ぱ"],
        "ひ": ["び", "ぴ"],
        "ふ": ["ぶ", "ぷ"],
        "へ": ["べ", "ぺ"],
        "ほ": ["ぼ", "ぽ"],

        "や": ["ゃ"],
        "ゆ": ["ゅ"],
        "よ": ["ょ"],

        "あ": ["ぁ"],
        "い": ["ぃ"],
        "う": ["ぅ"],
        "え": ["ぇ"],
        "お": ["ぉ"],

        "わ": ["ゎ"]
    };

    const SYMBOL_OUTPUTS = new Set([
        "（",
        "）",
        "〜",
        "ー"
    ]);
    const PRIMARY_FLICK_PATHS = [];
    const SYMBOL_FLICK_PATHS = [];
    const FLICK_PATH_BY_OUTPUT = new Map();

    FLICK_KEYS.forEach(function (keyData) {
        FLICK_DIRECTIONS.forEach(function (direction) {
            const output = keyData[direction];
            const path = {
                key: keyData.key,
                direction,
                baseOutput: output,
                output,
                modifier: null,
                category:
                    SYMBOL_OUTPUTS.has(output) ?
                        "symbol" : "kana"
            };

            if (path.category === "symbol") {
                SYMBOL_FLICK_PATHS.push(path);
            } else {
                PRIMARY_FLICK_PATHS.push(path);
            }

            if (!FLICK_PATH_BY_OUTPUT.has(output)) {
                FLICK_PATH_BY_OUTPUT.set(output, path);
            }

            (KANA_VARIANTS[output] || []).forEach(
                function (variant) {
                    if (!FLICK_PATH_BY_OUTPUT.has(variant)) {
                        FLICK_PATH_BY_OUTPUT.set(
                            variant,
                            Object.assign({}, path, {
                                output: variant,
                                modifier: "kana-variant"
                            })
                        );
                    }
                }
            );
        });
    });

    // ============================================================
    // 第一阶段小型 IME 候选库
    //
    // 注意：
    // 这不是角色“能说什么”的词库。
    //
    // 它只是：
    // 输入这个读音时，虚拟 IME 可以提供什么候选。
    //
    // 后面会单独扩展成大型 ime-dictionary.js / json。
    // ============================================================

    const LEXICON = window.RandomIMELexicon || null;
    const CHAT_OVERRIDES =
        window.RandomIMEChatOverrides || null;
    const POS_TRANSITIONS =
        window.RandomIMEPOSTransitions || null;
    const LOCAL_GRAMMAR =
        window.RandomIMELocalGrammar || null;

    // This biases only the first physical Flick. It does not select a word,
    // reading, segment, or target text; every Flick output remains reachable.
    const START_KANA_WEIGHTS_4A5 = Object.freeze([
        { kana: "あ", weight: 1 },
        { kana: "え", weight: 0.72 },
        { kana: "お", weight: 0.9 },
        { kana: "き", weight: 0.75 },
        { kana: "こ", weight: 0.82 },
        { kana: "そ", weight: 0.92 },
        { kana: "た", weight: 0.82 },
        { kana: "ど", weight: 0.9 },
        { kana: "な", weight: 0.94 },
        { kana: "ね", weight: 0.9 },
        { kana: "ほ", weight: 0.75 },
        { kana: "ま", weight: 0.84 },
        { kana: "み", weight: 0.74 },
        { kana: "も", weight: 0.88 },
        { kana: "や", weight: 0.75 },
        { kana: "よ", weight: 0.76 },
        { kana: "わ", weight: 0.68 }
    ]);

    // Flatter 4A.6 distribution. It remains a first-Flick-only soft path;
    // the free and prediction sources still compete with it.
    const START_KANA_WEIGHTS_4A6 = Object.freeze([
        { kana: "あ", weight: 0.9 },
        { kana: "い", weight: 0.84 },
        { kana: "う", weight: 0.82 },
        { kana: "え", weight: 0.76 },
        { kana: "お", weight: 0.88 },
        { kana: "か", weight: 0.9 },
        { kana: "き", weight: 0.86 },
        { kana: "こ", weight: 0.9 },
        { kana: "さ", weight: 0.78 },
        { kana: "し", weight: 0.9 },
        { kana: "す", weight: 0.82 },
        { kana: "そ", weight: 0.9 },
        { kana: "た", weight: 0.86 },
        { kana: "て", weight: 0.78 },
        { kana: "と", weight: 0.88 },
        { kana: "な", weight: 0.9 },
        { kana: "に", weight: 0.82 },
        { kana: "ね", weight: 0.86 },
        { kana: "は", weight: 0.82 },
        { kana: "ほ", weight: 0.8 },
        { kana: "ま", weight: 0.86 },
        { kana: "み", weight: 0.8 },
        { kana: "も", weight: 0.86 },
        { kana: "や", weight: 0.76 },
        { kana: "よ", weight: 0.8 },
        { kana: "わ", weight: 0.74 }
    ]);

    // POS affects only the next Flick's first kana. It never reserves a
    // completion or grammar slot, so free deviation remains possible.
    const POS_START_KANA_WEIGHTS = Object.freeze({
        noun: Object.freeze([
            { kana: "は", weight: 0.9 },
            { kana: "が", weight: 0.8 },
            { kana: "を", weight: 0.82 },
            { kana: "に", weight: 0.76 },
            { kana: "で", weight: 0.72 },
            { kana: "も", weight: 0.7 },
            { kana: "の", weight: 0.68 }
        ]),
        verb: Object.freeze([
            { kana: "ね", weight: 0.82 },
            { kana: "よ", weight: 0.76 },
            { kana: "か", weight: 0.88 },
            { kana: "け", weight: 0.62 }
        ]),
        adjective: Object.freeze([
            { kana: "ね", weight: 0.86 },
            { kana: "よ", weight: 0.78 },
            { kana: "か", weight: 0.9 }
        ]),
        fragment: Object.freeze([
            { kana: "ね", weight: 0.7 },
            { kana: "よ", weight: 0.64 },
            { kana: "で", weight: 0.58 }
        ]),
        interjection: Object.freeze([
            { kana: "で", weight: 0.62 },
            { kana: "ま", weight: 0.58 },
            { kana: "そ", weight: 0.58 }
        ])
    });

    // 只有在 ime-lexicon.js 未加载时才使用旧版小型 fallback。
    const IME_DICTIONARY = LEXICON ? LEXICON.dictionary : {
        "あい": ["愛", "藍"],
        "あう": ["会う", "合う"],
        "あお": ["青"],
        "あか": ["赤"],
        "あさ": ["朝"],
        "あし": ["足"],
        "あした": ["明日"],
        "あつい": ["暑い", "熱い"],
        "あと": ["後", "あと"],
        "あめ": ["雨", "飴"],

        "いえ": ["家"],
        "いく": ["行く"],
        "いま": ["今"],
        "いみ": ["意味"],
        "いる": ["居る", "いる"],

        "うえ": ["上"],
        "うみ": ["海"],
        "うれしい": ["嬉しい"],

        "え": ["絵"],
        "えき": ["駅"],

        "おと": ["音"],
        "おもう": ["思う"],
        "おもしろい": ["面白い"],

        "かお": ["顔"],
        "かみ": ["神", "紙", "髪"],
        "かわ": ["川"],
        "かわいい": ["可愛い", "かわいい"],
        "き": ["木", "気"],
        "きょう": ["今日", "京"],
        "きる": ["着る", "切る"],
        "くる": ["来る"],
        "くろ": ["黒"],

        "ここ": ["ここ"],
        "こと": ["事", "こと"],
        "こえ": ["声"],
        "こわい": ["怖い"],

        "さかな": ["魚"],
        "さむい": ["寒い"],
        "しろ": ["白"],
        "すき": ["好き"],
        "すごい": ["凄い", "すごい"],

        "そら": ["空"],
        "それ": ["それ"],

        "たべる": ["食べる"],
        "たのしい": ["楽しい"],
        "だめ": ["駄目", "ダメ"],
        "ちょっと": ["ちょっと"],
        "つき": ["月"],
        "つよい": ["強い"],

        "て": ["手"],
        "てんき": ["天気"],

        "とき": ["時"],
        "ともだち": ["友達"],

        "なに": ["何"],
        "なん": ["何", "なん"],
        "なんか": ["なんか"],
        "ねこ": ["猫"],
        "ねむい": ["眠い"],

        "はな": ["花", "鼻"],
        "ひと": ["人"],
        "ひる": ["昼"],
        "ほし": ["星", "欲し"],
        "ほん": ["本"],
        "ほんと": ["本当", "ほんと"],

        "まつ": ["待つ"],
        "みる": ["見る", "観る"],
        "みず": ["水"],
        "むり": ["無理"],

        "やばい": ["やばい", "ヤバい"],
        "やる": ["やる"],
        "ゆめ": ["夢"],

        "よる": ["夜"],
        "よむ": ["読む"],

        "わかる": ["分かる", "わかる"],
        "わたし": ["私"]
    };

    // ============================================================
    // 工具函数
    // ============================================================

    function randomItem(array) {
        if (!Array.isArray(array) || array.length === 0) {
            return null;
        }

        return array[
            Math.floor(
                Math.random() * array.length
            )
        ];
    }

    function randomInt(min, max) {
        return Math.floor(
            Math.random() * (max - min + 1)
        ) + min;
    }

    function clampNumber(value, fallback, min, max) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return fallback;
        }

        return Math.min(
            max,
            Math.max(min, number)
        );
    }

    function mergeOptions(options) {
        const merged = Object.assign(
            {},
            DEFAULT_OPTIONS,
            options || {}
        );

        if (
            options &&
            Object.prototype.hasOwnProperty.call(
                options,
                "freeFlickWeight"
            ) &&
            !Object.prototype.hasOwnProperty.call(
                options,
                "baseFreeFlickWeight"
            )
        ) {
            merged.baseFreeFlickWeight =
                options.freeFlickWeight;
        }

        merged.naturalnessEnabled =
            merged.naturalnessEnabled !== false;
        merged.lengthBalanceEnabled =
            merged.lengthBalanceEnabled !== false;
        merged.unknownTailControlEnabled =
            merged.unknownTailControlEnabled !== false;
        merged.segmentCohesionEnabled =
            merged.segmentCohesionEnabled !== false;
        merged.languageLayerEnabled =
            merged.languageLayerEnabled !== false;
        merged.localGrammarEnabled =
            merged.localGrammarEnabled !== false;
        merged.completionAwareEnabled =
            merged.completionAwareEnabled !== false;
        merged.structuredStabilityEnabled =
            merged.structuredStabilityEnabled !== false;

        merged.minLength = Math.floor(
            clampNumber(
                merged.minLength,
                DEFAULT_OPTIONS.minLength,
                1,
                100
            )
        );
        merged.maxLength = Math.floor(
            clampNumber(
                merged.maxLength,
                DEFAULT_OPTIONS.maxLength,
                merged.minLength,
                200
            )
        );
        merged.maxSteps = Math.floor(
            clampNumber(
                merged.maxSteps,
                DEFAULT_OPTIONS.maxSteps,
                8,
                5000
            )
        );
        merged.maxCandidateMoves = Math.floor(
            clampNumber(
                merged.maxCandidateMoves,
                DEFAULT_OPTIONS.maxCandidateMoves,
                0,
                30
            )
        );
        merged.maxCorrections = Math.floor(
            clampNumber(
                merged.maxCorrections,
                DEFAULT_OPTIONS.maxCorrections,
                0,
                100
            )
        );
        merged.maxCompositionLength = Math.floor(
            clampNumber(
                merged.maxCompositionLength,
                DEFAULT_OPTIONS.maxCompositionLength,
                1,
                merged.maxLength
            )
        );
        merged.maxPredictionCandidates = Math.floor(
            clampNumber(
                merged.maxPredictionCandidates,
                DEFAULT_OPTIONS.maxPredictionCandidates,
                0,
                30
            )
        );

        [
            "continueChance",
            "candidateChance",
            "fallbackCandidateChance",
            "chooseCandidateChance",
            "candidateBrowseChance",
            "katakanaChance",
            "predictionCandidateChance",
            "candidateRandomness",
            "grammarInfluence",
            "symbolChance",
            "backspaceChance",
            "kanaVariantChance",
            "baseConfirmChance",
            "confirmGrowthPerKana",
            "localPathStickiness",
            "stablePathFreeFlickMultiplier",
            "unknownPathFreedom",
            "exactHitConfirmBoost",
            "strongPrefixConfirmBoost",
            "postConfirmContinueChance",
            "completeFragmentSendBoost",
            "fragmentTerminalWeight",
            "startKanaBiasInfluence",
            "symbolEndingChance",
            "shortSegmentPenalty",
            "shortMessageContinueBoost",
            "secondSegmentAttraction",
            "segmentContinuationDecay",
            "segmentAttractionInfluence",
            "continuedSegmentFreeMultiplier",
            "continuedSegmentPredictionMultiplier",
            "shortPrefixCandidateBoost",
            "predictionCompletionBoost",
            "informationDensityInfluence",
            "structuredPairSendBoost",
            "structuredMessageSendBoost",
            "unknownTailPenaltyStrength",
            "tailContinueFloor",
            "tailConfirmUnknownFloor",
            "tailBackspaceWeight",
            "tailCancelWeight",
            "tailSendExistingWeight",
            "tailCandidateOpenBoost",
            "initialPredictionMultiplier",
            "segmentCohesionStrength",
            "singleKanaRawConfirmFloor",
            "cohesionCandidateOpenBoost",
            "cohesionBackspaceChance",
            "cohesionSegmentDecay",
            "cohesionSecondSegmentMultiplier",
            "predictionSelectionFloor",
            "predictionSelectionCoverage",
            "predictionLongCompletionPenalty",
            "desiredPosCandidateBoost",
            "incompatibleCandidateAcceptance",
            "incompletePosContinueBoost",
            "invalidGrammarAcceptance",
            "highCompletionSendBoost",
            "mediumCompletionSendBoost",
            "lowCompletionContinueBoost",
            "completedTailFreeMultiplier",
            "mediumTailFreeMultiplier",
            "stableStructuredFreeMultiplier",
            "structuredStabilityTailBoost",
            "highStabilitySendBoost",
            "mediumStabilitySendBoost"
        ].forEach(function (key) {
            merged[key] = clampNumber(
                merged[key],
                DEFAULT_OPTIONS[key],
                0,
                1
            );
        });

        merged.freeFlickWeight = clampNumber(
            merged.freeFlickWeight,
            DEFAULT_OPTIONS.freeFlickWeight,
            0.01,
            10
        );
        merged.baseFreeFlickWeight = clampNumber(
            merged.baseFreeFlickWeight,
            DEFAULT_OPTIONS.baseFreeFlickWeight,
            0.01,
            10
        );
        merged.chatWeightInfluence = clampNumber(
            merged.chatWeightInfluence,
            DEFAULT_OPTIONS.chatWeightInfluence,
            0,
            2
        );
        merged.lengthCurveMidpoint = clampNumber(
            merged.lengthCurveMidpoint,
            DEFAULT_OPTIONS.lengthCurveMidpoint,
            2,
            merged.maxLength
        );
        merged.lengthCurveSlope = clampNumber(
            merged.lengthCurveSlope,
            DEFAULT_OPTIONS.lengthCurveSlope,
            0.5,
            10
        );
        merged.predictionInfluence = clampNumber(
            merged.predictionInfluence,
            DEFAULT_OPTIONS.predictionInfluence,
            0,
            10
        );
        merged.kanaTransitionInfluence = clampNumber(
            merged.kanaTransitionInfluence,
            DEFAULT_OPTIONS.kanaTransitionInfluence,
            0,
            10
        );
        merged.languageGuidanceInfluence = clampNumber(
            merged.languageGuidanceInfluence,
            DEFAULT_OPTIONS.languageGuidanceInfluence,
            0,
            10
        );
        merged.posAttraction = clampNumber(
            merged.posAttraction,
            DEFAULT_OPTIONS.posAttraction,
            0,
            10
        );

        return merged;
    }

    function hiraganaToKatakana(text) {
        return String(text || "").replace(
            /[\u3041-\u3096]/g,
            function (char) {
                return String.fromCharCode(
                    char.charCodeAt(0) + 0x60
                );
            }
        );
    }

    // ============================================================
    // 模拟一次 Flick
    // ============================================================

    function randomWeightedItem(items) {
        if (!items || !items.length) {
            return null;
        }

        const total = items.reduce(
            function (sum, item) {
                return sum + Math.max(0, item.weight || 0);
            },
            0
        );

        if (total <= 0) {
            return randomItem(items);
        }

        let cursor = Math.random() * total;

        for (const item of items) {
            cursor -= Math.max(0, item.weight || 0);

            if (cursor <= 0) {
                return item;
            }
        }

        return items[items.length - 1];
    }

    function getFlickForOutput(output, inputSource) {
        const path = FLICK_PATH_BY_OUTPUT.get(output);

        if (!path) {
            return null;
        }

        return Object.assign({}, path, {
            inputSource: inputSource || "free"
        });
    }

    function variantChance(baseOutput, previousKana, options) {
        const baseChance = options.kanaVariantChance;

        if (["や", "ゆ", "よ"].includes(baseOutput)) {
            return /[きぎしじちぢにひびぴみり]$/.test(
                previousKana || ""
            ) ? Math.min(0.34, baseChance * 1.8) :
                baseChance * 0.07;
        }

        if (["あ", "い", "う", "え", "お"].includes(baseOutput)) {
            return baseChance * 0.12;
        }

        if (baseOutput === "つ") {
            return baseChance * 0.55;
        }

        if (baseOutput === "わ") {
            return baseChance * 0.04;
        }

        return baseChance;
    }

    function randomFlick(options, previousKana) {
        const config = options || DEFAULT_OPTIONS;
        const useSymbol =
            SYMBOL_FLICK_PATHS.length > 0 &&
            Math.random() < config.symbolChance;
        const basePath = randomItem(
            useSymbol ?
                SYMBOL_FLICK_PATHS :
                PRIMARY_FLICK_PATHS
        );
        const flick = Object.assign({}, basePath, {
            inputSource: useSymbol ? "symbol" : "free"
        });

        if (
            flick.category === "kana" &&
            KANA_VARIANTS[flick.output] &&
            Math.random() < variantChance(
                flick.output,
                previousKana,
                config
            )
        ) {
            flick.output = randomItem(
                KANA_VARIANTS[flick.output]
            );
            flick.modifier = "kana-variant";
        }

        return flick;
    }

    // ============================================================
    // 根据当前读音产生候选
    // ============================================================

    function getCandidates(reading, options) {
        const normalizedReading = String(reading || "");
        const config = Object.assign(
            {},
            DEFAULT_OPTIONS,
            options || {}
        );
        const candidates = [];
        const exactEntries = LEXICON ?
            LEXICON.getExact(normalizedReading) : [];
        const inferredPos = exactEntries.length ?
            exactEntries[0].pos : "unknown";

        // 原平假名永远存在
        candidates.push({
            reading: normalizedReading,
            text: normalizedReading,
            source: "raw-kana",
            pos: inferredPos,
            weight: 0.82
        });

        // 片假名永远可以作为路径存在
        candidates.push({
            reading: normalizedReading,
            text: hiraganaToKatakana(normalizedReading),
            source: "katakana",
            pos: inferredPos,
            weight: 0.46
        });

        if (LEXICON) {
            exactEntries.forEach(function (entry) {
                candidates.push({
                    reading: entry.reading,
                    text: entry.text,
                    source: "dictionary",
                    pos: entry.pos,
                    weight: entry.weight,
                    lexiconChatWeight: Number(entry.chatWeight) || 0,
                    lemmaReading: entry.lemmaReading || null,
                    lemmaText: entry.lemmaText || null,
                    inflectionType: entry.inflectionType || null,
                    conjugationType: entry.conjugationType || null,
                    anime: Boolean(entry.anime),
                    custom: Boolean(entry.custom),
                    userEntryId: entry.userEntryId || null
                });
            });
        } else {
            const dictionaryCandidates =
                IME_DICTIONARY[normalizedReading];

            if (Array.isArray(dictionaryCandidates)) {
                dictionaryCandidates.forEach(
                    function (text) {
                        candidates.push({
                            reading: normalizedReading,
                            text,
                            source: "dictionary",
                            pos: "unknown",
                            weight: 0.72
                        });
                    }
                );
            }
        }

        if (
            LEXICON &&
            normalizedReading &&
            config.maxPredictionCandidates > 0
        ) {
            LEXICON.getPredictions(normalizedReading, {
                limit: config.maxPredictionCandidates,
                previousPos: config.previousPos,
                grammarInfluence: config.grammarInfluence,
                desiredPos: config.desiredPos,
                posAttraction: config.posAttraction,
                localSegments: config.localSegments
            }).forEach(function (entry) {
                candidates.push({
                    reading: entry.reading,
                    text: entry.text,
                    source: "prediction",
                    pos: entry.pos,
                    weight: entry.weight,
                    lexiconChatWeight: Number(entry.chatWeight) || 0,
                    lemmaReading: entry.lemmaReading || null,
                    lemmaText: entry.lemmaText || null,
                    inflectionType: entry.inflectionType || null,
                    conjugationType: entry.conjugationType || null,
                    anime: Boolean(entry.anime),
                    custom: Boolean(entry.custom),
                    userEntryId: entry.userEntryId || null
                });
            });
        }

        candidates.forEach(function (candidate) {
            let relevance = 0;
            const typedPrefixLength = normalizedReading.length;
            const candidateReadingLength = Math.max(
                1,
                String(candidate.reading || normalizedReading).length
            );
            const completionLength = Math.max(
                0,
                candidateReadingLength - typedPrefixLength
            );
            const prefixCoverage = Math.min(
                1,
                typedPrefixLength / candidateReadingLength
            );
            const chatOverride =
                config.naturalnessEnabled &&
                CHAT_OVERRIDES ?
                    CHAT_OVERRIDES.resolve(
                        candidate.reading,
                        candidate.text,
                        config
                    ) :
                    {
                        weight: 0,
                        terminal: 0,
                        category: null,
                        matched: false
                    };
            const localGrammar =
                config.localGrammarEnabled &&
                LOCAL_GRAMMAR &&
                Array.isArray(config.localSegments) ?
                    LOCAL_GRAMMAR.evaluateCandidate(
                        config.localSegments,
                        candidate
                    ) : {
                        multiplier: 1,
                        scoreAdjustment: 0,
                        invalidLike: false,
                        reasons: [],
                        particleTransition: null
                    };

            switch (candidate.source) {
                case "dictionary":
                    relevance = 1.15;
                    break;
                case "raw-kana":
                    relevance = 0.94;
                    break;
                case "prediction":
                    relevance =
                        0.64 +
                        normalizedReading.length /
                            candidate.reading.length * 0.3;
                    break;
                case "katakana":
                    relevance = 0.48;
                    break;
            }

            candidate.typedPrefixLength = typedPrefixLength;
            candidate.completionLength = completionLength;
            candidate.prefixCoverage = prefixCoverage;
            candidate.predictionSelectionWeight =
                config.segmentCohesionEnabled &&
                candidate.source === "prediction" ?
                    Math.max(
                        config.predictionSelectionFloor,
                        Math.min(
                            1,
                            config.predictionSelectionFloor +
                                prefixCoverage *
                                    config.predictionSelectionCoverage -
                                Math.max(0, completionLength - 2) *
                                    config.predictionLongCompletionPenalty
                        )
                    ) : 1;
            if (
                candidate.source === "prediction" &&
                candidate.inflectionType &&
                typedPrefixLength >= 2
            ) {
                candidate.predictionSelectionWeight = Math.min(
                    1,
                    candidate.predictionSelectionWeight +
                        Math.min(0.14, typedPrefixLength * 0.025)
                );
            }

            candidate.score =
                relevance +
                candidate.weight * 0.42 +
                (
                    config.languageLayerEnabled &&
                    POS_TRANSITIONS &&
                    config.desiredPos ?
                        POS_TRANSITIONS.compatibility(
                            config.desiredPos,
                            candidate.pos
                        ) * config.desiredPosCandidateBoost -
                            (
                                POS_TRANSITIONS.compatibility(
                                    config.desiredPos,
                                    candidate.pos
                                ) === 0 ?
                                    config.desiredPosCandidateBoost * 0.38 : 0
                            ) : 0
                ) +
                (
                    chatOverride.weight +
                    (candidate.lexiconChatWeight || 0)
                ) *
                    config.chatWeightInfluence +
                (
                    config.lengthBalanceEnabled &&
                    candidate.source === "prediction" ?
                        config.predictionCompletionBoost : 0
                ) +
                (
                    Math.random() - 0.5
                ) * config.candidateRandomness +
                (
                    config.segmentCohesionEnabled &&
                    candidate.source === "prediction" ?
                        (candidate.predictionSelectionWeight - 1) * 0.12 : 0
                ) + localGrammar.scoreAdjustment;
            candidate.chatWeight = chatOverride.weight +
                (candidate.lexiconChatWeight || 0);
            candidate.fragmentTerminal =
                chatOverride.terminal;
            candidate.chatCategory =
                chatOverride.category;
            candidate.localGrammarMultiplier =
                localGrammar.multiplier;
            candidate.localGrammarInvalidLike =
                localGrammar.invalidLike;
            candidate.localGrammarReasons =
                localGrammar.reasons;
            candidate.particleTransition =
                localGrammar.particleTransition;
        });

        const bestByText = new Map();

        candidates.forEach(function (candidate) {
            const existing = bestByText.get(candidate.text);

            if (!existing || candidate.score > existing.score) {
                bestByText.set(candidate.text, candidate);
            }
        });

        return Array.from(bestByText.values()).sort(
            function (left, right) {
                return right.score - left.score;
            }
        );
    }

    // ============================================================
    // 状态机工具
    // ============================================================

    const ACTION_DURATION_RANGES = {
        flick: [110, 250],
        "kana-variant": [55, 125],
        "open-candidates": [120, 260],
        "candidate-move": [75, 165],
        "candidate-cancel": [65, 140],
        confirm: [70, 155],
        backspace: [80, 170],
        continue: [90, 320],
        "ready-to-send": [80, 300],
        send: [45, 110]
    };

    function actionDuration(type) {
        const range =
            ACTION_DURATION_RANGES[type] ||
            [40, 100];

        return randomInt(range[0], range[1]);
    }

    function pushLog(session, event) {
        session.log.push(
            Object.assign(
                {
                    step: session.actions,
                    elapsed: session.duration,
                    state: session.state
                },
                event
            )
        );
    }

    function recordAction(
        session,
        type,
        details,
        durationType,
        keystrokes
    ) {
        session.actions++;
        session.keystrokes +=
            typeof keystrokes === "number" ?
                keystrokes : 1;

        const duration = actionDuration(
            durationType || type
        );

        session.duration += duration;

        pushLog(
            session,
            Object.assign(
                {
                    type,
                    duration
                },
                details || {}
            )
        );
    }

    function transition(session, nextState, reason) {
        if (session.state === nextState) {
            return;
        }

        const previousState = session.state;
        session.state = nextState;

        pushLog(session, {
            type: "state-change",
            from: previousState,
            to: nextState,
            reason: reason || null,
            confirmedText: session.text,
            composition: session.composition
        });
    }

    function previousSegmentPos(session) {
        if (!session.segments.length) {
            return null;
        }

        return session.segments[
            session.segments.length - 1
        ].pos || null;
    }

    function ensureLanguageTarget(session, options) {
        if (
            !options.languageLayerEnabled ||
            !POS_TRANSITIONS ||
            session.languageState.desiredPos
        ) {
            return session.languageState.desiredPos;
        }

        const previousPos = previousSegmentPos(session);
        const previousSegment = session.segments.length ?
            session.segments[session.segments.length - 1] : null;
        const localWeights =
            options.localGrammarEnabled && LOCAL_GRAMMAR ?
                LOCAL_GRAMMAR.getTransitionWeights(
                    previousSegment,
                    session.segments
                ) : POS_TRANSITIONS.getWeights(previousPos);
        const desiredPos =
            options.localGrammarEnabled && LOCAL_GRAMMAR ?
                LOCAL_GRAMMAR.chooseNext(
                    previousSegment,
                    session.segments,
                    Math.random
                ) : POS_TRANSITIONS.chooseNext(
                    previousPos,
                    Math.random
                );
        const transitionKey =
            (previousPos || "START") + "→" + desiredPos;

        session.languageState.desiredPos = desiredPos;
        session.languageState.previousPos = previousPos;
        session.posTransitionUses++;
        session.posTransitionCounts[transitionKey] =
            (session.posTransitionCounts[transitionKey] || 0) + 1;

        pushLog(session, {
            type: "pos-transition",
            previousPos: previousPos || "START",
            desiredPos,
            weights: localWeights,
            localGrammar: Boolean(
                options.localGrammarEnabled && LOCAL_GRAMMAR
            ),
            note: "local POS attraction only; no word or sentence selected"
        });

        return desiredPos;
    }

    function languageKanaWeights(session, options) {
        if (
            !LEXICON ||
            !options.languageLayerEnabled ||
            !POS_TRANSITIONS ||
            typeof LEXICON.getGuidedNextKanaWeights !== "function"
        ) {
            return [];
        }

        const desiredPos = ensureLanguageTarget(session, options);
        return LEXICON.getGuidedNextKanaWeights(
            session.composition,
            {
                desiredPos,
                previousPos: previousSegmentPos(session),
                posAttraction: options.posAttraction,
                grammarInfluence: options.grammarInfluence,
                localSegments: session.segments
            }
        ).filter(function (item) {
            const path = FLICK_PATH_BY_OUTPUT.get(item.kana);
            return path && path.category === "kana";
        });
    }

    function transitionKanaWeights(composition) {
        const lastKana = String(composition || "").slice(-1);
        const weights = [];

        if (/[きぎしじちぢにひびぴみり]/.test(lastKana)) {
            weights.push(
                { kana: "ゃ", weight: 0.9 },
                { kana: "ゅ", weight: 0.72 },
                { kana: "ょ", weight: 0.88 }
            );
        }

        if (
            lastKana &&
            /[ぁ-ん]/.test(lastKana) &&
            !/[っゃゅょぁぃぅぇぉ]/.test(lastKana)
        ) {
            weights.push({ kana: "っ", weight: 0.16 });
        }

        return weights;
    }

    function predictionKanaWeights(session, options) {
        if (!LEXICON) {
            return [];
        }

        return LEXICON.getNextKanaWeights(
            session.composition,
            {
                previousPos: previousSegmentPos(session),
                grammarInfluence: options.grammarInfluence,
                desiredPos: session.languageState.desiredPos,
                posAttraction: options.posAttraction
            }
        ).filter(function (item) {
            const path = FLICK_PATH_BY_OUTPUT.get(item.kana);
            return path && path.category === "kana";
        });
    }

    function analyzeLocalPath(session, options) {
        const reading = session.composition;
        const exactEntries =
            LEXICON && reading ? LEXICON.getExact(reading) : [];
        const prefixEntries =
            LEXICON && reading ?
                LEXICON.getPrefixMatches(reading, { limit: 24 }) : [];
        const longerEntries = prefixEntries.filter(
            function (entry) {
                return entry.reading.length > reading.length;
            }
        );
        const exactWeight = exactEntries.reduce(
            function (best, entry) {
                return Math.max(best, entry.weight || 0);
            },
            0
        );
        const prefixWeight = longerEntries.reduce(
            function (best, entry) {
                return Math.max(best, entry.weight || 0);
            },
            0
        );
        const prefixStrength = Math.min(
            1,
            prefixWeight * 0.58 +
                Math.min(1, longerEntries.length / 8) * 0.42
        );
        let chat = CHAT_OVERRIDES && reading ?
            CHAT_OVERRIDES.resolve(reading, reading, options) :
            { weight: 0, terminal: 0, category: null, matched: false };

        exactEntries.forEach(function (entry) {
            if (!CHAT_OVERRIDES) return;
            const resolved = CHAT_OVERRIDES.resolve(
                reading,
                entry.text,
                options
            );
            if (
                resolved.weight > chat.weight ||
                resolved.terminal > chat.terminal
            ) {
                chat = {
                    weight: Math.max(chat.weight, resolved.weight),
                    terminal: Math.max(chat.terminal, resolved.terminal),
                    category: resolved.category || chat.category,
                    matched: chat.matched || resolved.matched
                };
            }
        });

        const exactHit = exactEntries.length > 0;
        const strongPrefix =
            longerEntries.length > 0 && prefixStrength >= 0.55;
        const quality = Math.min(
            1,
            (exactHit ? 0.34 + exactWeight * 0.34 : 0) +
                prefixStrength * 0.32 +
                Math.max(0, chat.weight) *
                    options.chatWeightInfluence
        );

        return {
            reading,
            exactHit,
            exactWeight,
            prefixMatches: longerEntries.length,
            prefixStrength,
            strongPrefix,
            chatWeight: chat.weight,
            fragmentTerminal: chat.terminal,
            chatCategory: chat.category,
            chatMatched: chat.matched,
            quality
        };
    }

    function dynamicFlickWeights(session, options, hasPrediction) {
        if (!options.naturalnessEnabled) {
            return {
                path: null,
                free: options.freeFlickWeight,
                prediction: options.predictionInfluence,
                transition: options.kanaTransitionInfluence,
                start: 0
            };
        }

        const path = analyzeLocalPath(session, options);
        const stability =
            path.quality * options.localPathStickiness;
        const freeMultiplier =
            1 - stability *
                (1 - options.stablePathFreeFlickMultiplier);
        const minimumFree =
            options.baseFreeFlickWeight *
            options.unknownPathFreedom;
        const atMessageStart =
            !session.text && !session.composition;
        const atContinuedSegmentStart =
            Boolean(session.text) && !session.composition;
        const continuedFreeMultiplier =
            options.lengthBalanceEnabled &&
            atContinuedSegmentStart ?
                options.continuedSegmentFreeMultiplier : 1;
        const continuedPredictionMultiplier =
            options.lengthBalanceEnabled &&
            atContinuedSegmentStart ?
                options.continuedSegmentPredictionMultiplier : 1;
        const structuredStability =
            evaluateStructuredStability(session, options);
        const structuredStabilityMultiplier =
            atContinuedSegmentStart ?
                1 - structuredStability.score *
                    (1 - options.stableStructuredFreeMultiplier) : 1;

        const completionTailMultiplier =
            options.completionAwareEnabled &&
            structuredSegmentCount(session) >= 2 &&
            !session.composition ?
                session.lastCompletionState === "HIGH" ?
                    options.completedTailFreeMultiplier :
                session.lastCompletionState === "MEDIUM" ?
                    options.mediumTailFreeMultiplier : 1 : 1;

        return {
            path,
            free: Math.max(
                minimumFree * completionTailMultiplier *
                    structuredStabilityMultiplier,
                options.baseFreeFlickWeight * freeMultiplier *
                    continuedFreeMultiplier * completionTailMultiplier *
                    structuredStabilityMultiplier
            ),
            prediction: hasPrediction ?
                options.predictionInfluence *
                    (1 + stability * 0.75) *
                    (
                        options.lengthBalanceEnabled &&
                        atMessageStart ?
                            options.initialPredictionMultiplier : 1
                    ) * continuedPredictionMultiplier :
                0,
            transition: options.kanaTransitionInfluence,
            start: atMessageStart ?
                options.startKanaBiasInfluence : 0,
            completionTailMultiplier,
            structuredStability,
            structuredStabilityMultiplier
        };
    }

    function chooseNextFlick(session, options) {
        const languageWeights =
            languageKanaWeights(session, options);
        const predictionWeights =
            predictionKanaWeights(session, options);
        const localTransitionWeights =
            transitionKanaWeights(session.composition);
        const previousPos = previousSegmentPos(session);
        const segmentAttractionWeights =
            options.lengthBalanceEnabled &&
            !session.composition && previousPos ?
                POS_START_KANA_WEIGHTS[previousPos] || [] : [];
        const dynamic = dynamicFlickWeights(
            session,
            options,
            predictionWeights.length > 0
        );
        const sources = [
            {
                source: "free",
                weight: dynamic.free
            }
        ];

        if (languageWeights.length) {
            sources.push({
                source: "language-guided",
                weight: options.languageGuidanceInfluence
            });
        }

        if (options.naturalnessEnabled) {
            pushLog(session, {
                type: "path-quality",
                reading: session.composition,
                exactHit: dynamic.path.exactHit,
                exactWeight: dynamic.path.exactWeight,
                prefixMatches: dynamic.path.prefixMatches,
                prefixStrength: dynamic.path.prefixStrength,
                strongPrefix: dynamic.path.strongPrefix,
                chatWeight: dynamic.path.chatWeight,
                fragmentTerminal:
                    dynamic.path.fragmentTerminal,
                quality: dynamic.path.quality
            });
            pushLog(session, {
                type: "dynamic-weights",
                free: dynamic.free,
                prediction: dynamic.prediction,
                transition: dynamic.transition,
                start: dynamic.start,
                completionTailMultiplier:
                    dynamic.completionTailMultiplier || 1,
                completionState:
                    session.lastCompletionState || "LOW",
                structuredStability:
                    dynamic.structuredStability,
                structuredStabilityMultiplier:
                    dynamic.structuredStabilityMultiplier || 1
            });
        }

        if (predictionWeights.length) {
            sources.push({
                source: "prediction-biased",
                weight: dynamic.prediction
            });
        }

        if (localTransitionWeights.length) {
            sources.push({
                source: "transition-biased",
                weight: dynamic.transition
            });
        }

        if (dynamic.start > 0) {
            sources.push({
                source: "start-biased",
                weight: dynamic.start
            });
        }

        if (segmentAttractionWeights.length) {
            sources.push({
                source: "segment-attracted",
                weight: options.segmentAttractionInfluence
            });
        }

        const source = randomWeightedItem(sources).source;

        if (source === "language-guided") {
            const selected = randomWeightedItem(languageWeights);
            const guidedFlick = getFlickForOutput(
                selected.kana,
                source
            );

            if (guidedFlick) {
                guidedFlick.desiredPos =
                    session.languageState.desiredPos;
                guidedFlick.guidanceWeight = selected.weight;
                return guidedFlick;
            }
        }

        if (source === "prediction-biased") {
            const selected =
                randomWeightedItem(predictionWeights);
            const predictedFlick = getFlickForOutput(
                selected.kana,
                source
            );

            if (predictedFlick) {
                predictedFlick.predictionPrefix =
                    session.composition;
                predictedFlick.predictionWeight =
                    selected.weight;
                return predictedFlick;
            }
        }

        if (source === "transition-biased") {
            const selected = randomWeightedItem(
                localTransitionWeights
            );
            const transitionFlick = getFlickForOutput(
                selected.kana,
                source
            );

            if (transitionFlick) {
                return transitionFlick;
            }
        }

        if (source === "start-biased") {
            const selected = randomWeightedItem(
                options.lengthBalanceEnabled ?
                    START_KANA_WEIGHTS_4A6 :
                    START_KANA_WEIGHTS_4A5
            );
            const startFlick = getFlickForOutput(
                selected.kana,
                source
            );

            if (startFlick) {
                return startFlick;
            }
        }

        if (source === "segment-attracted") {
            const selected = randomWeightedItem(
                segmentAttractionWeights
            );
            const segmentFlick = getFlickForOutput(
                selected.kana,
                source
            );

            if (segmentFlick) {
                segmentFlick.previousPos = previousPos;
                return segmentFlick;
            }
        }

        return randomFlick(
            options,
            session.composition.slice(-1)
        );
    }

    function availableCandidates(session, options) {
        const remaining =
            options.maxLength - session.text.length;

        return getCandidates(
            session.composition,
            Object.assign({}, options, {
                previousPos: previousSegmentPos(session),
                desiredPos: session.languageState.desiredPos,
                posAttraction: options.posAttraction,
                localSegments: session.segments
            })
        ).filter(function (candidate) {
            return candidate.text.length <= remaining;
        });
    }

    function updateCandidateSnapshot(session, options) {
        const candidates =
            availableCandidates(session, options);

        session.currentCandidates = candidates;

        pushLog(session, {
            type: "candidate-list",
            reading: session.composition,
            candidates: candidates.map(
                function (candidate) {
                    return candidate.text;
                }
            ),
            candidateDetails: candidates.map(
                function (candidate) {
                    return {
                        text: candidate.text,
                        reading: candidate.reading,
                        source: candidate.source,
                        pos: candidate.pos,
                        score: candidate.score,
                        chatWeight: candidate.chatWeight || 0,
                        fragmentTerminal:
                            candidate.fragmentTerminal || 0,
                        chatCategory:
                            candidate.chatCategory || null,
                        typedPrefixLength:
                            candidate.typedPrefixLength,
                        completionLength:
                            candidate.completionLength,
                        predictionSelectionWeight:
                            candidate.predictionSelectionWeight,
                        inflectionType:
                            candidate.inflectionType || null,
                        conjugationType:
                            candidate.conjugationType || null,
                        lemmaReading:
                            candidate.lemmaReading || null,
                        anime: Boolean(candidate.anime),
                        custom: Boolean(candidate.custom),
                        localGrammarMultiplier:
                            candidate.localGrammarMultiplier || 1,
                        localGrammarInvalidLike:
                            Boolean(candidate.localGrammarInvalidLike),
                        localGrammarReasons:
                            candidate.localGrammarReasons || []
                    };
                }
            )
        });

        return candidates;
    }

    function appendFlick(session, options) {
        const remainingActions =
            options.maxSteps - session.actions;
        const flickOptions = Object.assign(
            {},
            options
        );

        if (!session.composition) {
            session.compositionCandidateBrowsed = false;
        }

        // 最后两个动作必须留给 confirm 和 send。
        if (remainingActions <= 3) {
            flickOptions.kanaVariantChance = 0;
        }

        let flick = chooseNextFlick(
            session,
            flickOptions
        );

        if (
            remainingActions <= 3 &&
            flick.modifier
        ) {
            flick = randomFlick(
                flickOptions,
                session.composition.slice(-1)
            );
        }

        if (flick.inputSource === "language-guided") {
            session.languageGuidedFlicks++;
        } else if (flick.inputSource === "prediction-biased") {
            session.predictionBiasedFlicks++;
        } else if (flick.inputSource === "transition-biased") {
            session.transitionBiasedFlicks++;
        } else if (flick.inputSource === "start-biased") {
            session.startBiasedFlicks++;
        } else if (flick.inputSource === "segment-attracted") {
            session.segmentAttractedFlicks++;
        } else if (flick.inputSource === "symbol") {
            session.symbolInputs++;
        } else {
            session.freeFlicks++;
        }

        if (flick.inputSource === "language-guided") {
            pushLog(session, {
                type: "language-guided-flick",
                desiredPos: flick.desiredPos,
                suggestedKana: flick.output,
                weight: flick.guidanceWeight,
                prefix: session.composition,
                note: "Flick guidance only; no final word selected"
            });
        } else if (flick.inputSource === "prediction-biased") {
            pushLog(session, {
                type: "prediction-influence",
                prefix: flick.predictionPrefix,
                suggestedKana: flick.output,
                weight: flick.predictionWeight
            });
        } else if (
            flick.inputSource === "transition-biased"
        ) {
            pushLog(session, {
                type: "kana-transition-influence",
                previousKana:
                    session.composition.slice(-1),
                suggestedKana: flick.output
            });
        } else if (flick.inputSource === "start-biased") {
            pushLog(session, {
                type: "start-kana-bias",
                suggestedKana: flick.output,
                note: "first-Flick-only; no target word selected"
            });
        } else if (flick.inputSource === "segment-attracted") {
            pushLog(session, {
                type: "segment-pos-influence",
                previousPos: flick.previousPos,
                suggestedKana: flick.output,
                note: "next-Flick-only; no grammar slot reserved"
            });
        }

        pushLog(session, {
            type: "touch",
            key: flick.key
        });

        recordAction(
            session,
            flick.category === "symbol" ?
                "symbol-input" : "flick",
            {
                key: flick.key,
                direction: flick.direction,
                baseOutput: flick.baseOutput,
                inputSource: flick.inputSource,
                predictionPrefix:
                    flick.predictionPrefix || null,
                predictionWeight:
                    flick.predictionWeight || null,
                desiredPos: flick.desiredPos || null,
                guidanceWeight: flick.guidanceWeight || null
            },
            "flick",
            1
        );

        if (flick.modifier) {
            recordAction(
                session,
                "kana-variant",
                {
                    from: flick.baseOutput,
                    to: flick.output
                },
                "kana-variant",
                1
            );
        }

        session.composition += flick.output;

        pushLog(session, {
            type: "output",
            output: flick.output
        });
        pushLog(session, {
            type: "composition",
            reading: session.composition
        });

        updateCandidateSnapshot(session, options);
    }

    function openCandidates(session, options) {
        const candidates =
            session.currentCandidates.length ?
                session.currentCandidates :
                updateCandidateSnapshot(
                    session,
                    options
                );

        session.candidateSession = {
            candidates,
            index: 0,
            moves: 0
        };
        session.candidateSessions++;

        recordAction(session, "open-candidates", {
            reading: session.composition,
            index: 0,
            text: candidates[0].text
        });

        transition(
            session,
            STATES.CANDIDATE_SELECT,
            "candidate-bar-opened"
        );
    }

    function moveCandidate(session, direction) {
        const candidateSession =
            session.candidateSession;
        const candidateCount =
            candidateSession.candidates.length;
        const offset = direction === "previous" ?
            -1 : 1;

        candidateSession.index =
            (
                candidateSession.index +
                offset +
                candidateCount
            ) % candidateCount;
        candidateSession.moves++;
        session.candidateMoves++;
        session.compositionCandidateBrowsed = true;

        const selected =
            candidateSession.candidates[
                candidateSession.index
            ];

        recordAction(
            session,
            direction === "previous" ?
                "candidate-previous" :
                "candidate-next",
            {
                index: candidateSession.index,
                text: selected.text,
                source: selected.source
            },
            "candidate-move"
        );
    }

    function closeCandidates(session) {
        recordAction(
            session,
            "candidate-cancel",
            {
                reading: session.composition
            }
        );
        session.candidateSession = null;
        session.compositionCandidateBrowsed = true;

        transition(
            session,
            STATES.COMPOSING,
            "candidate-selection-cancelled"
        );
    }

    function confirmComposition(
        session,
        candidate
    ) {
        const reading = session.composition;
        const confirmed = candidate || {
            text: reading,
            source: "raw-kana"
        };
        const expectedPos = session.languageState.desiredPos || null;
        const actualPos = confirmed.pos || "unknown";
        const posCompatibility =
            expectedPos && POS_TRANSITIONS ?
                POS_TRANSITIONS.compatibility(expectedPos, actualPos) : 0;

        recordAction(session, "confirm", {
            reading,
            candidateReading:
                confirmed.reading || reading,
            text: confirmed.text,
            source: confirmed.source,
            pos: confirmed.pos || "unknown",
            typedPrefixLength:
                confirmed.typedPrefixLength || reading.length,
            completionLength:
                confirmed.completionLength || 0,
            predictionSelectionWeight:
                confirmed.predictionSelectionWeight || 1,
            expectedPos,
            posCompatibility,
            inflectionType: confirmed.inflectionType || null,
            conjugationType: confirmed.conjugationType || null,
            lemmaReading: confirmed.lemmaReading || null,
            anime: Boolean(confirmed.anime),
            custom: Boolean(confirmed.custom),
            localGrammarMultiplier:
                confirmed.localGrammarMultiplier || 1,
            localGrammarInvalidLike:
                Boolean(confirmed.localGrammarInvalidLike),
            localGrammarReasons:
                confirmed.localGrammarReasons || []
        });

        session.segments.push({
            typedReading: reading,
            reading: confirmed.reading || reading,
            text: confirmed.text,
            source: confirmed.source,
            pos: confirmed.pos || "unknown",
            candidateWeight: confirmed.weight || 0,
            candidateScore: confirmed.score || 0,
            typedPrefixLength:
                confirmed.typedPrefixLength || reading.length,
            completionLength:
                confirmed.completionLength || 0,
            predictionSelectionWeight:
                confirmed.predictionSelectionWeight || 1,
            chatWeight: confirmed.chatWeight || 0,
            fragmentTerminal:
                confirmed.fragmentTerminal || 0,
            chatCategory:
                confirmed.chatCategory || null,
            expectedPos,
            posCompatibility,
            lemmaReading: confirmed.lemmaReading || null,
            lemmaText: confirmed.lemmaText || null,
            inflectionType: confirmed.inflectionType || null,
            conjugationType: confirmed.conjugationType || null,
            anime: Boolean(confirmed.anime),
            custom: Boolean(confirmed.custom),
            userEntryId: confirmed.userEntryId || null,
            localGrammarMultiplier:
                confirmed.localGrammarMultiplier || 1,
            localGrammarInvalidLike:
                Boolean(confirmed.localGrammarInvalidLike),
            localGrammarReasons:
                confirmed.localGrammarReasons || [],
            particleTransition:
                confirmed.particleTransition || null
        });
        session.confirmationSources[confirmed.source] =
            (
                session.confirmationSources[
                    confirmed.source
                ] || 0
            ) + 1;
        session.text += confirmed.text;
        session.composition = "";
        session.currentCandidates = [];
        session.candidateSession = null;
        session.compositionCandidateBrowsed = false;
        session.confirmations++;
        session.endingSymbolConsidered = false;

        if (expectedPos) {
            if (posCompatibility > 0) {
                session.posTransitionMatches++;
            } else {
                session.posTransitionDeviations++;
            }
        }
        session.languageState.previousPos = actualPos;
        session.languageState.recentPos.push(actualPos);
        if (session.languageState.recentPos.length > 4) {
            session.languageState.recentPos.shift();
        }
        session.languageState.desiredPos = null;

        if (confirmed.inflectionType) {
            session.inflectionUses++;
            const inflectionKey =
                actualPos + ":" + confirmed.inflectionType;
            session.inflectionCounts[inflectionKey] =
                (session.inflectionCounts[inflectionKey] || 0) + 1;
            pushLog(session, {
                type: "inflection-confirm",
                lemmaReading: confirmed.lemmaReading,
                lemmaText: confirmed.lemmaText,
                reading: confirmed.reading,
                text: confirmed.text,
                pos: actualPos,
                inflectionType: confirmed.inflectionType,
                conjugationType: confirmed.conjugationType
            });
        }
        if (actualPos === "particle") session.particleContinuations++;
        if (confirmed.particleTransition) {
            session.particleTransitionCounts[
                confirmed.particleTransition
            ] = (
                session.particleTransitionCounts[
                    confirmed.particleTransition
                ] || 0
            ) + 1;
        }
        if (confirmed.localGrammarInvalidLike) {
            session.invalidLikeSequences++;
        }
        session.typedPrefixTotal +=
            confirmed.typedPrefixLength || reading.length;
        session.typedPrefixSamples++;
        if (["ending", "auxiliary"].includes(actualPos)) {
            session.endingContinuations++;
        }

        transition(
            session,
            STATES.CONFIRMED,
            "composition-confirmed"
        );
    }

    function beginCorrection(session, target) {
        session.correctionTarget = target;

        transition(
            session,
            STATES.CORRECTING,
            target + "-backspace"
        );
    }

    function performCorrection(session, options) {
        const target = session.correctionTarget;
        const source = target === "composition" ?
            session.composition : session.text;
        const removed = source.slice(-1);
        const remaining = source.slice(0, -1);

        if (target === "composition") {
            session.composition = remaining;
        } else {
            session.text = remaining;
        }

        session.corrections++;

        recordAction(session, "backspace", {
            target,
            removed,
            confirmedText: session.text,
            composition: session.composition
        });

        session.correctionTarget = null;

        transition(
            session,
            STATES.COMPOSING,
            "correction-complete"
        );

        if (session.composition) {
            pushLog(session, {
                type: "composition",
                reading: session.composition
            });
            updateCandidateSnapshot(session, options);
        }
    }

    function structuredSegmentCount(session) {
        return session.segments.filter(function (segment) {
            return segmentStructuralQuality(segment) >= 0.5;
        }).length;
    }

    function evaluateStructuredStability(session, options) {
        const disabled = !options.structuredStabilityEnabled;
        const structuredCount = structuredSegmentCount(session);
        const total = session.segments.length;
        const latest = session.segments[total - 1] || null;
        const latestPos = POS_TRANSITIONS && latest ?
            POS_TRANSITIONS.normalizePos(latest.pos) :
            (latest ? latest.pos : null);
        const incompleteInflection = Boolean(
            latest && ["te-form", "te-continuation"].includes(
                latest.inflectionType
            )
        );
        const incomplete = Boolean(
            latest && (
                ["particle", "conjunction", "adverb", "auxiliary"]
                    .includes(latestPos) ||
                incompleteInflection
            )
        );

        if (disabled || structuredCount < 2 || !latest || incomplete) {
            return {
                score: 0,
                level: "LOW",
                structuredCount,
                totalSegments: total,
                latestPos: latestPos || null,
                incomplete
            };
        }

        const recent = session.segments.slice(-3);
        const recentQuality = recent.reduce(function (sum, segment) {
            return sum + segmentStructuralQuality(segment);
        }, 0) / Math.max(1, recent.length);
        const structuredRatio = structuredCount / Math.max(1, total);
        const completionBoost =
            session.lastCompletionState === "HIGH" ? 0.17 :
            session.lastCompletionState === "MEDIUM" ? 0.08 : 0;
        const score = clampUnit(
            0.42 +
            recentQuality * 0.23 +
            structuredRatio * 0.18 +
            Math.min(0.08, Math.max(0, structuredCount - 2) * 0.04) +
            completionBoost
        );

        return {
            score,
            level: score >= 0.72 ? "HIGH" :
                score >= 0.5 ? "MEDIUM" : "LOW",
            structuredCount,
            totalSegments: total,
            latestPos: latestPos || null,
            incomplete: false
        };
    }

    function evaluateTailQuality(session, path, options) {
        const structuredCount = structuredSegmentCount(session);
        const stability = evaluateStructuredStability(session, options);
        const previousStructured =
            Boolean(session.text) && structuredCount > 0;
        const unknownLength = session.composition.length;
        const prefixQuality = Math.max(
            path.exactHit ? 1 : 0,
            path.prefixStrength || 0
        );
        const unknownness = 1 - prefixQuality;
        const lengthPressure = clampUnit(
            Math.max(0, unknownLength - 1) / 3
        );
        const density = calculateInformationDensity(session);
        const segmentCaution = Math.min(
            1.25,
            1 + Math.max(0, session.segments.length - 1) * 0.1
        );
        const completionCaution =
            options.completionAwareEnabled &&
            structuredCount >= 1 ?
                session.lastCompletionState === "HIGH" ? 0.8 :
                session.lastCompletionState === "MEDIUM" ? 0.55 : 0 : 0;
        const stabilityPenalty =
            unknownness * stability.score *
            options.structuredStabilityTailBoost;
        const unknownTailPenalty = previousStructured ?
            clampUnit(
                unknownness *
                (0.15 + lengthPressure * 0.85) *
                options.unknownTailPenaltyStrength *
                segmentCaution +
                unknownness * completionCaution +
                stabilityPenalty
            ) : 0;
        const hasCandidatePath =
            path.exactHit || path.prefixStrength >= 0.42;
        const knownContinuationCaution =
            previousStructured &&
            !path.exactHit &&
            hasCandidatePath ?
                clampUnit(0.25 + path.prefixStrength * 0.45) : 0;
        const recoveryMultiplier = hasCandidatePath ? 0.35 : 1;
        const continueFlick = Math.max(
            options.tailContinueFloor,
            1 + knownContinuationCaution * 0.55 -
                unknownTailPenalty *
                (options.completionAwareEnabled ? 1.05 : 0.72) -
                stability.score * 0.24 * recoveryMultiplier
        );
        const dynamicConfirmFloor =
            options.tailConfirmUnknownFloor *
            (
                previousStructured ?
                    0.08 + (1 - stability.score) * 0.12 : 1
            );
        const confirmRaw = Math.max(
            dynamicConfirmFloor,
            0.38 * (1 - unknownTailPenalty *
                (options.completionAwareEnabled ? 1 : 0.9)) *
                (1 - stability.score * 0.78 * recoveryMultiplier) *
                (1 - knownContinuationCaution * 0.82) *
                (
                    previousStructured ?
                        0.12 + (1 - stability.score) * 0.12 : 1
                )
        );
        const backspace =
            0.025 +
            unknownTailPenalty * options.tailBackspaceWeight *
                (1 + stability.score * 0.7 * recoveryMultiplier);
        const cancelComposition =
            unknownTailPenalty *
            options.tailCancelWeight *
            (0.35 + lengthPressure * 0.65) *
            (1 + stability.score * 0.9 * recoveryMultiplier);
        const sendExisting =
            unknownTailPenalty *
            options.tailSendExistingWeight *
            (0.5 + density.score * 0.5) *
            (1 + stability.score * 1.1 * recoveryMultiplier);

        return {
            exactHit: path.exactHit,
            prefixStrength: path.prefixStrength,
            strongPrefix: path.strongPrefix,
            unknownLength,
            previousStructured,
            structuredCount,
            informationDensity: density.score,
            unknownness,
            completionCaution,
            structuredStability: stability,
            stabilityPenalty,
            knownContinuationCaution,
            dynamicConfirmFloor,
            lengthPressure,
            unknownTailPenalty,
            hasCandidatePath,
            actionWeights: {
                continueFlick,
                confirmRaw,
                backspace,
                cancelComposition,
                sendExisting
            }
        };
    }

    function cancelCurrentComposition(
        session,
        reason,
        sendExisting
    ) {
        const abandoned = session.composition;
        session.composition = "";
        session.currentCandidates = [];
        session.candidateSession = null;
        session.cancelledCompositions++;
        session.languageState.desiredPos = null;

        recordAction(session, "cancel-composition", {
            abandoned,
            reason,
            confirmedText: session.text,
            sendExisting: Boolean(sendExisting)
        }, "backspace", Math.max(1, abandoned.length));

        transition(
            session,
            sendExisting ?
                STATES.READY_TO_SEND : STATES.CONFIRMED,
            sendExisting ?
                "unknown-tail-cancelled-for-send" :
                "unknown-tail-cancelled"
        );
    }

    function applyTailQualityDecision(
        session,
        tail,
        rawCandidate,
        options,
        actionBudget
    ) {
        const actions = [
            {
                action: "continue-flick",
                weight: tail.actionWeights.continueFlick
            },
            {
                action: "confirm-unknown",
                weight: tail.actionWeights.confirmRaw
            }
        ];

        if (
            session.corrections < options.maxCorrections &&
            actionBudget > 3
        ) {
            actions.push({
                action: "backspace",
                weight: tail.actionWeights.backspace
            });
        }

        if (actionBudget > 2) {
            actions.push(
                {
                    action: "cancel-composition",
                    weight: tail.actionWeights.cancelComposition
                },
                {
                    action: "send-existing",
                    weight: tail.actionWeights.sendExisting
                }
            );
        }

        const selected = randomWeightedItem(actions).action;

        pushLog(session, {
            type: "tail-decision",
            selected,
            actionWeights: tail.actionWeights,
            unknownTailPenalty: tail.unknownTailPenalty
        });

        if (selected === "backspace") {
            session.tailBackspaceDecisions++;
            beginCorrection(session, "composition");
        } else if (selected === "cancel-composition") {
            cancelCurrentComposition(
                session,
                "tail-quality-gate",
                false
            );
        } else if (selected === "send-existing") {
            session.tailSendExistingDecisions++;
            cancelCurrentComposition(
                session,
                "tail-quality-gate",
                true
            );
        } else if (selected === "confirm-unknown") {
            session.confirmedUnknownTails++;
            confirmComposition(session, rawCandidate);
        } else {
            appendFlick(session, options);
        }
    }

    // ============================================================
    // 是否继续输入
    //
    // 越接近 maxLength，
    // 停止概率越高。
    // ============================================================

    function shouldContinue(
        currentLength,
        options
    ) {
        if (
            currentLength <
            options.minLength
        ) {
            return true;
        }

        if (
            currentLength >=
            options.maxLength
        ) {
            return false;
        }

        const progress =
            currentLength /
            options.maxLength;

        const adjustedChance =
            options.continueChance *
            (1 - progress * 0.7);

        return (
            Math.random() <
            adjustedChance
        );
    }

    function clampUnit(value) {
        return Math.max(0, Math.min(1, value));
    }

    function segmentStructuralQuality(segment) {
        if (!segment) return 0;

        if (
            segment.source === "dictionary" ||
            segment.source === "prediction"
        ) {
            return Math.min(
                1,
                0.52 + (segment.candidateWeight || 0) * 0.42
            );
        }

        if (
            LEXICON &&
            segment.reading &&
            LEXICON.getExact(segment.reading).length
        ) {
            return 0.58;
        }

        return segment.source === "katakana" ? 0.18 : 0;
    }

    function isFunctionalSegment(segment) {
        if (!segment) return false;

        return [
            "particle",
            "fragment",
            "interjection",
            "adverb"
        ].includes(segment.pos) || [
            "particle",
            "fragment",
            "ending",
            "interjection",
            "chat-terminal"
        ].includes(segment.chatCategory);
    }

    function isFunctionalCandidate(candidate) {
        if (!candidate) return false;

        return [
            "particle",
            "ending",
            "fragment",
            "interjection"
        ].includes(candidate.pos) || [
            "particle",
            "fragment",
            "ending",
            "interjection",
            "chat-terminal"
        ].includes(candidate.chatCategory);
    }

    function evaluateSegmentCohesion(
        session,
        path,
        candidates,
        options
    ) {
        const typedPrefixLength = session.composition.length;
        const previousStructured =
            Boolean(session.text) && structuredSegmentCount(session) > 0;
        const exactCandidates = candidates.filter(function (candidate) {
            return candidate.source === "dictionary" &&
                candidate.reading === session.composition;
        });
        const predictionCandidates = candidates.filter(function (candidate) {
            return candidate.source === "prediction";
        });
        const functionalExact = candidates.some(function (candidate) {
            return candidate.reading === session.composition &&
                isFunctionalCandidate(candidate);
        });
        const positionValidFunctional = functionalExact &&
            (previousStructured || typedPrefixLength > 1);
        const highQualityExact = path.exactHit &&
            path.exactWeight >= 0.66 &&
            (!functionalExact || previousStructured);
        const terminalException =
            path.fragmentTerminal >= 0.62 ||
            ["chat-terminal", "interjection"].includes(
                path.chatCategory
            );
        const singleKanaRawRisk =
            typedPrefixLength === 1 &&
            !positionValidFunctional &&
            !terminalException;
        let boundaryRisk = 0;

        if (singleKanaRawRisk) {
            boundaryRisk += highQualityExact ? 0.55 : 0.76;
        }
        if (path.strongPrefix) {
            boundaryRisk += 0.28 + path.prefixStrength * 0.18;
        } else if (
            predictionCandidates.length &&
            typedPrefixLength <= 2
        ) {
            boundaryRisk += 0.12;
        }
        if (
            typedPrefixLength === 2 &&
            path.prefixStrength >= 0.42
        ) {
            boundaryRisk += 0.1;
        }
        if (highQualityExact) boundaryRisk -= 0.18;
        if (positionValidFunctional) boundaryRisk -= 0.38;
        if (terminalException) boundaryRisk -= 0.48;
        if (
            session.compositionCandidateBrowsed &&
            !singleKanaRawRisk &&
            !path.strongPrefix
        ) boundaryRisk -= 0.1;
        boundaryRisk = clampUnit(boundaryRisk);

        const confirmFloor = singleKanaRawRisk ?
            options.singleKanaRawConfirmFloor : 0.42;
        const confirmMultiplier = Math.max(
            confirmFloor,
            1 - boundaryRisk * options.segmentCohesionStrength
        );
        const openBoost = Math.min(
            options.cohesionCandidateOpenBoost,
            options.cohesionCandidateOpenBoost *
                (
                    path.strongPrefix ?
                        0.45 + path.prefixStrength * 0.55 :
                    singleKanaRawRisk ? 0.5 : 0
                )
        );
        const backspaceChance =
            options.cohesionBackspaceChance *
            boundaryRisk *
            (
                path.exactHit || path.prefixStrength >= 0.42 ?
                    0.35 : 1
            );
        const bestPrediction = predictionCandidates[0] || null;

        return {
            typedPrefixLength,
            exactHit: path.exactHit,
            exactCandidateCount: exactCandidates.length,
            prefixStrength: path.prefixStrength,
            strongPrefix: path.strongPrefix,
            predictionPath: predictionCandidates.length > 0,
            candidateBrowsed:
                Boolean(session.compositionCandidateBrowsed),
            previousStructured,
            functionalExact,
            positionValidFunctional,
            terminalException,
            highQualityExact,
            singleKanaRawRisk,
            boundaryRisk,
            confirmMultiplier,
            continueWeight:
                1 + boundaryRisk * options.segmentCohesionStrength,
            openBoost,
            backspaceChance,
            bestPredictionCompletionLength:
                bestPrediction ? bestPrediction.completionLength : null,
            bestPredictionSelectionWeight:
                bestPrediction ?
                    bestPrediction.predictionSelectionWeight : null
        };
    }

    function evaluateLanguageCohesion(session, candidates, options) {
        const desiredPos = session.languageState.desiredPos;
        if (
            !options.languageLayerEnabled ||
            !desiredPos ||
            !POS_TRANSITIONS ||
            !LEXICON ||
            typeof LEXICON.getGuidedNextKanaWeights !== "function"
        ) {
            return null;
        }

        const compatibleExact = candidates.some(function (candidate) {
            return candidate.reading === session.composition &&
                POS_TRANSITIONS.compatibility(
                    desiredPos,
                    candidate.pos
                ) > 0;
        });
        const guidedContinuation = LEXICON.getGuidedNextKanaWeights(
            session.composition,
            {
                desiredPos,
                previousPos: previousSegmentPos(session),
                posAttraction: options.posAttraction,
                localSegments: session.segments
            }
        );
        const completionPending =
            !compatibleExact && guidedContinuation.length > 0;

        return {
            desiredPos,
            compatibleExact,
            guidedContinuationCount: guidedContinuation.length,
            completionPending,
            confirmMultiplier: completionPending ? 0.22 : 1,
            openBoost: completionPending ? 0.14 : 0
        };
    }

    function calculateInformationDensity(session) {
        const segments = session.segments;
        const total = Math.max(1, segments.length);
        let structuralQuality = 0;
        let converted = 0;
        let functional = 0;
        let unknownRaw = 0;
        let terminal = 0;

        segments.forEach(function (segment) {
            structuralQuality +=
                segmentStructuralQuality(segment);
            if (
                segment.source === "dictionary" ||
                segment.source === "prediction"
            ) {
                converted++;
            }
            if (isFunctionalSegment(segment)) {
                functional++;
            }
            if (
                segment.source === "raw-kana" &&
                (
                    !LEXICON ||
                    !LEXICON.getExact(segment.reading).length
                )
            ) {
                unknownRaw++;
            }
            terminal = Math.max(
                terminal,
                segment.fragmentTerminal || 0
            );
        });

        const lengthScore =
            1 - Math.exp(-session.text.length / 8);
        const segmentScore = Math.min(
            1,
            segments.length / 3
        );
        const qualityRatio = structuralQuality / total;
        const convertedRatio = converted / total;
        const functionalRatio = functional / total;
        const unknownRatio = unknownRaw / total;
        const singleCharacterPenalty =
            session.text.length === 1 ? 0.12 : 0;
        const score = clampUnit(
            lengthScore * 0.4 +
            segmentScore * 0.15 +
            qualityRatio * 0.17 +
            convertedRatio * 0.12 +
            functionalRatio * 0.08 +
            terminal * 0.08 -
            unknownRatio * 0.18 -
            singleCharacterPenalty
        );

        return {
            score,
            lengthScore,
            segmentScore,
            qualityRatio,
            convertedRatio,
            functionalRatio,
            unknownRatio,
            singleCharacterPenalty
        };
    }

    const ENDING_COMPLETION = Object.freeze({
        "かな": 0.9,
        "かも": 0.86,
        "よね": 0.91,
        "だね": 0.88,
        "だよ": 0.86,
        "ね": 0.76,
        "よ": 0.72,
        "けど": 0.58,
        "んだけど": 0.52,
        "から": 0.46,
        "ので": 0.36,
        "の": 0.26,
        "んだ": 0.74
    });

    const FRAGMENT_COMPLETION = Object.freeze({
        "まあ": 0.72,
        "なんか": 0.34,
        "ちょっと": 0.52,
        "ほんと": 0.66,
        "そう": 0.7,
        "でも": 0.38,
        "もう": 0.42,
        "まだ": 0.38,
        "すぐ": 0.35
    });

    function completionKey(segment) {
        return String(
            segment && (segment.reading || segment.typedReading || "")
        );
    }

    function evaluateCompletionState(session) {
        const segment = session.segments[
            session.segments.length - 1
        ] || null;
        const pos = POS_TRANSITIONS && segment ?
            POS_TRANSITIONS.normalizePos(segment.pos) :
            (segment ? segment.pos : "unknown");
        const key = completionKey(segment);
        let score = {
            noun: 0.36,
            pronoun: 0.36,
            verb: 0.58,
            adjective: 0.6,
            adverb: 0.28,
            particle: 0.14,
            conjunction: 0.22,
            auxiliary: 0.46,
            ending: 0.58,
            fragment: 0.48,
            interjection: 0.66,
            unknown: 0.12
        }[pos] || 0.28;
        let boundary = pos || "unknown";

        if (segment) {
            if (segment.chatCategory === "chat-terminal") {
                score = Math.max(score, 0.9);
                boundary = "chat-terminal";
            }
            if (Object.prototype.hasOwnProperty.call(ENDING_COMPLETION, key)) {
                score = ENDING_COMPLETION[key];
                boundary = "ending:" + key;
            } else if (
                Object.prototype.hasOwnProperty.call(FRAGMENT_COMPLETION, key)
            ) {
                score = FRAGMENT_COMPLETION[key];
                boundary = "fragment:" + key;
            } else if (pos === "fragment") {
                score = Math.max(
                    score,
                    Math.min(0.72, segment.fragmentTerminal || 0)
                );
            }

            if (segment.inflectionType) {
                const continuationInflection = [
                    "te-form",
                    "te-continuation"
                ].includes(segment.inflectionType);
                score = continuationInflection ?
                    Math.min(score, 0.34) :
                    Math.max(score, 0.82);
                boundary = "inflection:" + segment.inflectionType;
            }
        }

        if (
            session.segments.length >= 2 &&
            structuredSegmentCount(session) >= 2 &&
            !["particle", "conjunction"].includes(pos)
        ) {
            score = Math.min(1, score + 0.08);
        }
        if (/[？！〜…]$/.test(session.text)) {
            score = Math.max(score, 0.92);
            boundary = "symbol";
        }

        const state = score >= 0.72 ? "HIGH" :
            score >= 0.4 ? "MEDIUM" : "LOW";
        return {
            state,
            score: clampUnit(score),
            boundary,
            pos: pos || "unknown",
            reading: key,
            inflectionType:
                segment && segment.inflectionType || null,
            structuredSegments: structuredSegmentCount(session)
        };
    }

    function evaluateLengthBalancedPostConfirm(
        session,
        options
    ) {
        const currentLength = session.text.length;
        const segment = session.segments[
            session.segments.length - 1
        ] || null;
        const resolved = segment && CHAT_OVERRIDES ?
            CHAT_OVERRIDES.resolve(
                segment.reading,
                segment.text,
                options
            ) :
            { weight: 0, terminal: 0, category: null, matched: false };
        const fragmentTerminal = Math.max(
            segment ? segment.fragmentTerminal || 0 : 0,
            resolved.terminal || 0
        );
        const structuralQuality =
            segmentStructuralQuality(segment);
        const symbolEnding = /[？！〜…]$/.test(session.text);
        const density = calculateInformationDensity(session);
        const completion = evaluateCompletionState(session);
        session.lastCompletionState = completion.state;
        const structuredStability =
            evaluateStructuredStability(session, options);
        session.lastStructuredStability = structuredStability;
        const curve = 0.03 + 0.95 / (
            1 + Math.exp(
                (
                    currentLength -
                    options.lengthCurveMidpoint
                ) / options.lengthCurveSlope
            )
        );
        const shortContinueBoost =
            options.shortMessageContinueBoost *
            Math.exp(-Math.max(0, currentLength - 1) / 2.2);
        const secondSegmentBoost =
            session.segments.length === 1 &&
            currentLength < 8 &&
            structuralQuality >= 0.5 ?
                options.secondSegmentAttraction *
                    (1 - currentLength / 10) *
                    (
                        options.segmentCohesionEnabled ?
                            options.cohesionSecondSegmentMultiplier : 1
                    ) :
                0;
        const shortTerminalFactor =
            currentLength === 1 ?
                1 - options.shortSegmentPenalty : 1;
        const terminalSendBoost =
            options.completeFragmentSendBoost *
            fragmentTerminal * shortTerminalFactor;
        const informationSendBoost =
            density.score *
            options.informationDensityInfluence;
        const segmentDecay =
            Math.max(0, session.segments.length - 2) *
            options.segmentContinuationDecay;
        const cohesionSegmentDecay =
            options.segmentCohesionEnabled ?
                Math.max(0, session.segments.length - 1) *
                    options.cohesionSegmentDecay *
                    (
                        0.55 +
                        Math.min(1, currentLength / 8) * 0.45
                    ) : 0;
        const lastTwoSegments = session.segments.slice(-2);
        const structuredPairSendBoost =
            lastTwoSegments.length === 2 &&
            lastTwoSegments.every(function (item) {
                return segmentStructuralQuality(item) >= 0.5;
            }) ?
                options.structuredPairSendBoost : 0;
        const structuredCount = structuredSegmentCount(session);
        const structuredMessageSendBoost =
            options.unknownTailControlEnabled &&
            (
                structuredCount >= 2 ||
                (
                    currentLength >= 5 &&
                    density.score >= 0.58
                )
            ) ?
                options.structuredMessageSendBoost *
                    Math.min(
                        1,
                        0.55 + density.score * 0.45
                    ) : 0;
        const symbolSendBoost = symbolEnding ? 0.22 : 0;
        const lastPos = POS_TRANSITIONS && segment ?
            POS_TRANSITIONS.normalizePos(segment.pos) :
            (segment ? segment.pos : null);
        const incompletePosFactor = {
            particle: 1,
            conjunction: 0.92,
            adverb: 0.72,
            auxiliary: 0.52
        }[lastPos] || 0;
        const structuralContinueBoost =
            options.languageLayerEnabled ?
                options.incompletePosContinueBoost *
                    incompletePosFactor : 0;
        const completionSendBoost =
            !options.completionAwareEnabled ? 0 :
            completion.state === "HIGH" ?
                options.highCompletionSendBoost * completion.score :
            completion.state === "MEDIUM" ?
                options.mediumCompletionSendBoost * completion.score : 0;
        const completionContinueBoost =
            options.completionAwareEnabled &&
            completion.state === "LOW" ?
                options.lowCompletionContinueBoost *
                    (1 - completion.score) : 0;
        const stabilitySendBoost =
            !options.structuredStabilityEnabled ? 0 :
            completion.state === "HIGH" ?
                options.highStabilitySendBoost *
                    structuredStability.score :
            completion.state === "MEDIUM" ?
                options.mediumStabilitySendBoost *
                    structuredStability.score : 0;
        const continueCeiling =
            currentLength === 1 ?
                0.96 - fragmentTerminal * 0.1 : 0.985;
        const finalContinueChance = Math.max(
            0.015,
            Math.min(
                continueCeiling,
                curve +
                    shortContinueBoost +
                    secondSegmentBoost +
                    structuralContinueBoost -
                    completionSendBoost +
                    completionContinueBoost -
                    stabilitySendBoost -
                    terminalSendBoost -
                    informationSendBoost -
                    structuredPairSendBoost -
                    structuredMessageSendBoost -
                    segmentDecay -
                    cohesionSegmentDecay -
                    symbolSendBoost
            )
        );
        const completeness = {
            fragmentTerminal,
            convertedQuality: structuralQuality,
            symbolEnding,
            totalLength: currentLength,
            segments: session.segments.length,
            score: clampUnit(
                fragmentTerminal * 0.42 +
                structuralQuality * 0.28 +
                density.score * 0.3
            ),
            completionState: completion.state,
            completionScore: completion.score,
            completionBoundary: completion.boundary,
            completionPos: completion.pos,
            completionReading: completion.reading,
            completionInflectionType:
                completion.inflectionType,
            structuredStabilityLevel:
                structuredStability.level,
            structuredStabilityScore:
                structuredStability.score,
            structuredStabilityLatestPos:
                structuredStability.latestPos,
            structuredStabilityIncomplete:
                structuredStability.incomplete
        };

        if (currentLength < options.minLength) {
            return {
                continueTyping: true,
                baseContinueChance: curve,
                sendBoost: 0,
                finalContinueChance: 1,
                roll: null,
                completeness,
                informationDensity: density,
                adjustments: {
                    shortContinueBoost,
                    secondSegmentBoost,
                    terminalSendBoost,
                    informationSendBoost,
                    structuredPairSendBoost,
                    structuredMessageSendBoost,
                    segmentDecay,
                    cohesionSegmentDecay,
                    symbolSendBoost,
                    structuralContinueBoost,
                    completionSendBoost,
                    completionContinueBoost,
                    stabilitySendBoost
                }
            };
        }

        if (currentLength >= options.maxLength) {
            return {
                continueTyping: false,
                baseContinueChance: curve,
                sendBoost: 1,
                finalContinueChance: 0,
                roll: null,
                completeness,
                informationDensity: density,
                adjustments: {
                    shortContinueBoost,
                    secondSegmentBoost,
                    terminalSendBoost,
                    informationSendBoost,
                    structuredPairSendBoost,
                    structuredMessageSendBoost,
                    segmentDecay,
                    cohesionSegmentDecay,
                    symbolSendBoost,
                    structuralContinueBoost,
                    completionSendBoost,
                    completionContinueBoost,
                    stabilitySendBoost
                }
            };
        }

        const roll = Math.random();
        return {
            continueTyping: roll < finalContinueChance,
            baseContinueChance: curve,
            sendBoost:
                terminalSendBoost +
                informationSendBoost +
                structuredPairSendBoost +
                structuredMessageSendBoost +
                segmentDecay + cohesionSegmentDecay +
                symbolSendBoost + completionSendBoost +
                stabilitySendBoost,
            finalContinueChance,
            roll,
            completeness,
            informationDensity: density,
            adjustments: {
                shortContinueBoost,
                secondSegmentBoost,
                terminalSendBoost,
                informationSendBoost,
                structuredPairSendBoost,
                structuredMessageSendBoost,
                segmentDecay,
                cohesionSegmentDecay,
                symbolSendBoost,
                structuralContinueBoost,
                completionSendBoost,
                completionContinueBoost,
                stabilitySendBoost
            }
        };
    }

    function evaluatePostConfirm(session, options) {
        const currentLength = session.text.length;

        if (!options.naturalnessEnabled) {
            return {
                continueTyping: shouldContinue(
                    currentLength,
                    options
                ),
                baseContinueChance: null,
                sendBoost: 0,
                finalContinueChance: null,
                roll: null,
                completeness: null
            };
        }

        if (options.lengthBalanceEnabled) {
            return evaluateLengthBalancedPostConfirm(
                session,
                options
            );
        }

        const segment = session.segments[
            session.segments.length - 1
        ] || null;
        const resolved = segment && CHAT_OVERRIDES ?
            CHAT_OVERRIDES.resolve(
                segment.reading,
                segment.text,
                options
            ) :
            { weight: 0, terminal: 0, category: null, matched: false };
        const fragmentTerminal = Math.max(
            segment ? segment.fragmentTerminal || 0 : 0,
            resolved.terminal || 0
        );
        const convertedQuality = segment &&
            (
                segment.source === "dictionary" ||
                segment.source === "prediction"
            ) ?
            Math.min(1, 0.45 + (segment.candidateWeight || 0) * 0.45) :
            0;
        const symbolEnding = /[？！〜…]$/.test(session.text);
        const completeness = Math.min(
            1,
            fragmentTerminal * 0.68 +
                convertedQuality * 0.32
        );
        const progress = currentLength / options.maxLength;
        const baseContinueChance =
            options.postConfirmContinueChance *
            (1 - progress * 0.7);
        const sendBoost =
            options.completeFragmentSendBoost *
                fragmentTerminal +
            options.fragmentTerminalWeight *
                convertedQuality * 0.45 +
            (symbolEnding ? 0.22 : 0) +
            Math.max(0, session.segments.length - 1) * 0.025;
        const finalContinueChance = Math.max(
            0.02,
            baseContinueChance - sendBoost
        );

        if (currentLength < options.minLength) {
            return {
                continueTyping: true,
                baseContinueChance,
                sendBoost,
                finalContinueChance: 1,
                roll: null,
                completeness: {
                    fragmentTerminal,
                    convertedQuality,
                    symbolEnding,
                    totalLength: currentLength,
                    segments: session.segments.length,
                    score: completeness
                }
            };
        }

        if (currentLength >= options.maxLength) {
            return {
                continueTyping: false,
                baseContinueChance,
                sendBoost,
                finalContinueChance: 0,
                roll: null,
                completeness: {
                    fragmentTerminal,
                    convertedQuality,
                    symbolEnding,
                    totalLength: currentLength,
                    segments: session.segments.length,
                    score: completeness
                }
            };
        }

        const roll = Math.random();
        return {
            continueTyping: roll < finalContinueChance,
            baseContinueChance,
            sendBoost,
            finalContinueChance,
            roll,
            completeness: {
                fragmentTerminal,
                convertedQuality,
                symbolEnding,
                totalLength: currentLength,
                segments: session.segments.length,
                score: completeness
            }
        };
    }

    function maybeAppendEndingSymbol(session, options) {
        session.endingSymbolConsidered = true;

        if (
            !options.naturalnessEnabled ||
            session.text.length < options.minLength ||
            session.text.length >= options.maxLength ||
            /[？！〜…]$/.test(session.text) ||
            Math.random() >= options.symbolEndingChance
        ) {
            return false;
        }

        const symbol = randomItem(["？", "！", "〜", "…"]);
        session.text += symbol;
        session.symbolEndings++;
        recordAction(session, "symbol-ending", {
            symbol,
            text: session.text,
            semanticInput: false
        }, "flick", 1);
        return true;
    }

    // ============================================================
    // 主生成器
    // ============================================================

    function generate(options) {
        const config =
            mergeOptions(options);

        const session = {
            state: STATES.IDLE,
            text: "",
            composition: "",
            currentCandidates: [],
            candidateSession: null,
            compositionCandidateBrowsed: false,
            forceFlickAfterPredictionReject: false,
            correctionTarget: null,
            duration: 0,
            actions: 0,
            keystrokes: 0,
            confirmations: 0,
            corrections: 0,
            candidateSessions: 0,
            candidateMoves: 0,
            languageGuidedFlicks: 0,
            freeFlicks: 0,
            predictionBiasedFlicks: 0,
            transitionBiasedFlicks: 0,
            startBiasedFlicks: 0,
            segmentAttractedFlicks: 0,
            symbolInputs: 0,
            symbolEndings: 0,
            exactHitConfirmBoosts: 0,
            strongPrefixBoosts: 0,
            chatOverrideHits: 0,
            postConfirmSendBoosts: 0,
            earlyEndings: 0,
            secondSegmentAttractions: 0,
            shortSegmentContinues: 0,
            cancelledCompositions: 0,
            tailBackspaceDecisions: 0,
            tailSendExistingDecisions: 0,
            confirmedUnknownTails: 0,
            singleKanaRawContinues: 0,
            singleKanaRawRiskConfirms: 0,
            predictionSelectionAccepts: 0,
            predictionSelectionRejects: 0,
            incompatibleCandidateAccepts: 0,
            incompatibleCandidateRejects: 0,
            invalidGrammarAccepts: 0,
            invalidGrammarRejects: 0,
            invalidLikeSequences: 0,
            particleTransitionCounts: Object.create(null),
            typedPrefixTotal: 0,
            typedPrefixSamples: 0,
            posTransitionUses: 0,
            posTransitionMatches: 0,
            posTransitionDeviations: 0,
            posTransitionCounts: Object.create(null),
            languagePathContinues: 0,
            inflectionUses: 0,
            inflectionCounts: Object.create(null),
            particleContinuations: 0,
            endingContinuations: 0,
            lastCompletionState: "LOW",
            lastStructuredStability: {
                score: 0,
                level: "LOW",
                structuredCount: 0,
                totalSegments: 0,
                latestPos: null,
                incomplete: false
            },
            completionDecisions: {
                HIGH: { send: 0, continue: 0 },
                MEDIUM: { send: 0, continue: 0 },
                LOW: { send: 0, continue: 0 }
            },
            completionBoundaryDecisions: Object.create(null),
            inflectionCompletionDecisions: Object.create(null),
            languageState: {
                previousPos: null,
                recentPos: [],
                desiredPos: null
            },
            endingSymbolConsidered: false,
            confirmationSources: {
                dictionary: 0,
                prediction: 0,
                "raw-kana": 0,
                katakana: 0
            },
            segments: [],
            log: []
        };

        pushLog(session, {
            type: "session-start",
            version: VERSION,
            options: {
                minLength: config.minLength,
                maxLength: config.maxLength,
                maxSteps: config.maxSteps,
                maxCandidateMoves:
                    config.maxCandidateMoves,
                maxCorrections:
                    config.maxCorrections,
                naturalnessEnabled:
                    config.naturalnessEnabled,
                lengthBalanceEnabled:
                    config.lengthBalanceEnabled,
                unknownTailControlEnabled:
                    config.unknownTailControlEnabled,
                segmentCohesionEnabled:
                    config.segmentCohesionEnabled,
                structuredStabilityEnabled:
                    config.structuredStabilityEnabled,
                localPathStickiness:
                    config.localPathStickiness,
                baseFreeFlickWeight:
                    config.baseFreeFlickWeight,
                languageLayerEnabled:
                    config.languageLayerEnabled,
                languageGuidanceInfluence:
                    config.languageGuidanceInfluence,
                posAttraction: config.posAttraction
            }
        });

        transition(
            session,
            STATES.COMPOSING,
            "session-started"
        );

        while (
            session.state !== STATES.SENT &&
            session.actions < config.maxSteps
        ) {
            const actionBudget =
                config.maxSteps - session.actions;

            switch (session.state) {
                case STATES.COMPOSING: {
                    const totalLength =
                        session.text.length +
                        session.composition.length;

                    if (!session.composition) {
                        if (
                            session.text &&
                            (
                                session.text.length >=
                                    config.maxLength ||
                                actionBudget <= 1
                            )
                        ) {
                            transition(
                                session,
                                STATES.READY_TO_SEND,
                                "send-budget-reserved"
                            );
                            break;
                        }

                        appendFlick(session, config);
                        break;
                    }

                    // 始终为 confirm 与 send 各保留一个动作。
                    if (
                        actionBudget <= 2 ||
                        totalLength >= config.maxLength ||
                        session.composition.length >=
                            config.maxCompositionLength
                    ) {
                        const forcedPath = analyzeLocalPath(
                            session,
                            config
                        );
                        if (
                            session.text &&
                            structuredSegmentCount(session) > 0 &&
                            !forcedPath.exactHit
                        ) {
                            cancelCurrentComposition(
                                session,
                                "structured-tail-budget-gate",
                                true
                            );
                        } else {
                            const exactCandidate =
                                session.currentCandidates.find(
                                    function (candidate) {
                                        return candidate.reading ===
                                            session.composition &&
                                            ["dictionary", "prediction"]
                                                .includes(candidate.source);
                                    }
                                );
                            confirmComposition(
                                session,
                                exactCandidate || {
                                    text: session.composition,
                                    source: "raw-kana"
                                }
                            );
                        }
                        break;
                    }

                    if (session.forceFlickAfterPredictionReject) {
                        session.forceFlickAfterPredictionReject = false;
                        pushLog(session, {
                            type: "prediction-rejection-continue-flick",
                            reading: session.composition
                        });
                        appendFlick(session, config);
                        break;
                    }

                    if (
                        session.corrections <
                            config.maxCorrections &&
                        actionBudget > 3 &&
                        Math.random() <
                            config.backspaceChance
                    ) {
                        beginCorrection(
                            session,
                            "composition"
                        );
                        break;
                    }

                    const candidates =
                        session.currentCandidates.length ?
                            session.currentCandidates :
                            updateCandidateSnapshot(
                                session,
                                config
                            );
                    const hasDictionaryCandidate =
                        candidates.some(
                            function (candidate) {
                                return candidate.source ===
                                    "dictionary";
                            }
                        );
                    const hasPredictionCandidate =
                        candidates.some(
                            function (candidate) {
                                return candidate.source ===
                                    "prediction";
                            }
                        );
                    const baseOpenChance =
                        hasDictionaryCandidate ?
                            config.candidateChance :
                            hasPredictionCandidate ?
                                config.predictionCandidateChance :
                                config.fallbackCandidateChance;
                    const decisionPath =
                        config.naturalnessEnabled ?
                            analyzeLocalPath(session, config) : null;
                    const tailQuality =
                        config.unknownTailControlEnabled &&
                        decisionPath ?
                            evaluateTailQuality(
                                session,
                                decisionPath,
                                config
                            ) : null;
                    const segmentCohesion =
                        config.segmentCohesionEnabled &&
                        decisionPath ?
                            evaluateSegmentCohesion(
                                session,
                                decisionPath,
                                candidates,
                                config
                            ) : null;
                    const languageCohesion =
                        evaluateLanguageCohesion(
                            session,
                            candidates,
                            config
                        );
                    const openChance = decisionPath ?
                        Math.min(
                            0.9,
                            baseOpenChance +
                                decisionPath.quality * 0.08 +
                                (
                                    config.lengthBalanceEnabled &&
                                    decisionPath.strongPrefix &&
                                    session.composition.length <= 2 ?
                                        config.shortPrefixCandidateBoost : 0
                                ) +
                                (
                                    tailQuality &&
                                    tailQuality.previousStructured &&
                                    tailQuality.hasCandidatePath ?
                                        config.tailCandidateOpenBoost *
                                            (1 - tailQuality.unknownTailPenalty) : 0
                                ) +
                                (
                                    segmentCohesion ?
                                        segmentCohesion.openBoost : 0
                                ) +
                                (
                                    languageCohesion ?
                                        languageCohesion.openBoost : 0
                                )
                        ) :
                        baseOpenChance;
                    const baseConfirmChance = Math.min(
                        0.92,
                        config.baseConfirmChance +
                            session.composition.length *
                            config.confirmGrowthPerKana
                    );
                    const shortSegmentFactor =
                        !config.lengthBalanceEnabled ? 1 :
                        session.composition.length === 1 ?
                            1 - config.shortSegmentPenalty :
                        session.composition.length === 2 ?
                            1 - config.shortSegmentPenalty * 0.45 : 1;
                    const exactBoost = decisionPath &&
                        decisionPath.exactHit ?
                        config.exactHitConfirmBoost *
                            (0.45 + decisionPath.exactWeight * 0.55) *
                            shortSegmentFactor :
                        0;
                    const prefixBoost = decisionPath &&
                        decisionPath.strongPrefix ?
                        config.strongPrefixConfirmBoost *
                            decisionPath.prefixStrength *
                            shortSegmentFactor :
                        0;
                    const chatBoost = decisionPath ?
                        Math.max(0, decisionPath.chatWeight) *
                            config.chatWeightInfluence *
                            shortSegmentFactor :
                        0;
                    const confirmChance = Math.min(
                        0.94,
                        baseConfirmChance +
                            exactBoost + prefixBoost + chatBoost
                    ) * (
                        segmentCohesion ?
                            segmentCohesion.confirmMultiplier : 1
                    ) * (
                        languageCohesion ?
                            languageCohesion.confirmMultiplier : 1
                    );

                    if (decisionPath) {
                        if (exactBoost > 0) {
                            session.exactHitConfirmBoosts++;
                        }
                        if (prefixBoost > 0) {
                            session.strongPrefixBoosts++;
                        }
                        if (decisionPath.chatMatched) {
                            session.chatOverrideHits++;
                        }
                        pushLog(session, {
                            type: "composition-decision-weights",
                            reading: session.composition,
                            exactHit: decisionPath.exactHit,
                            strongPrefix: decisionPath.strongPrefix,
                            prefixStrength:
                                decisionPath.prefixStrength,
                            chatWeight: decisionPath.chatWeight,
                            pathQuality: decisionPath.quality,
                            baseOpenChance,
                            openChance,
                            baseConfirmChance,
                            shortSegmentFactor,
                            exactConfirmBoost: exactBoost,
                            strongPrefixConfirmBoost: prefixBoost,
                            chatConfirmBoost: chatBoost,
                            confirmChance,
                            segmentCohesionMultiplier:
                                segmentCohesion ?
                                    segmentCohesion.confirmMultiplier : 1
                        });
                    }

                    if (segmentCohesion) {
                        pushLog(session, Object.assign({
                            type: "segment-cohesion"
                        }, segmentCohesion));
                    }

                    if (languageCohesion) {
                        pushLog(session, Object.assign({
                            type: "language-cohesion"
                        }, languageCohesion));
                        if (languageCohesion.completionPending) {
                            session.languagePathContinues++;
                        }
                    }

                    if (tailQuality) {
                        pushLog(session, {
                            type: "tail-quality",
                            exactHit: tailQuality.exactHit,
                            prefixStrength:
                                tailQuality.prefixStrength,
                            strongPrefix: tailQuality.strongPrefix,
                            unknownLength:
                                tailQuality.unknownLength,
                            previousStructured:
                                tailQuality.previousStructured,
                            structuredCount:
                                tailQuality.structuredCount,
                            informationDensity:
                                tailQuality.informationDensity,
                            unknownness:
                                tailQuality.unknownness,
                            lengthPressure:
                                tailQuality.lengthPressure,
                            unknownTailPenalty:
                                tailQuality.unknownTailPenalty,
                            structuredStability:
                                tailQuality.structuredStability,
                            stabilityPenalty:
                                tailQuality.stabilityPenalty,
                            knownContinuationCaution:
                                tailQuality.knownContinuationCaution,
                            dynamicConfirmFloor:
                                tailQuality.dynamicConfirmFloor,
                            hasCandidatePath:
                                tailQuality.hasCandidatePath,
                            actionWeights:
                                tailQuality.actionWeights
                        });
                    }

                    if (
                        segmentCohesion &&
                        segmentCohesion.backspaceChance > 0 &&
                        session.corrections < config.maxCorrections &&
                        actionBudget > 3 &&
                        Math.random() <
                            segmentCohesion.backspaceChance
                    ) {
                        pushLog(session, {
                            type: "segment-cohesion-decision",
                            selected: "backspace",
                            typedPrefixLength:
                                segmentCohesion.typedPrefixLength,
                            boundaryRisk:
                                segmentCohesion.boundaryRisk
                        });
                        beginCorrection(session, "composition");
                        break;
                    }

                    if (
                        candidates.length > 1 &&
                        Math.random() < openChance
                    ) {
                        if (segmentCohesion) {
                            pushLog(session, {
                                type: "segment-cohesion-decision",
                                selected: "open-candidates",
                                typedPrefixLength:
                                    segmentCohesion.typedPrefixLength,
                                boundaryRisk:
                                    segmentCohesion.boundaryRisk
                            });
                        }
                        openCandidates(session, config);
                        break;
                    }

                    const rawCandidate = candidates.find(
                        function (candidate) {
                            return candidate.source ===
                                "raw-kana";
                        }
                    ) || {
                        reading: session.composition,
                        text: session.composition,
                        source: "raw-kana",
                        pos: "unknown",
                        typedPrefixLength:
                            session.composition.length,
                        completionLength: 0,
                        predictionSelectionWeight: 1
                    };

                    if (
                        tailQuality &&
                        tailQuality.previousStructured &&
                        !tailQuality.exactHit &&
                        (
                            tailQuality.unknownTailPenalty >= 0.04 ||
                            tailQuality.knownContinuationCaution > 0
                        )
                    ) {
                        applyTailQualityDecision(
                            session,
                            tailQuality,
                            rawCandidate,
                            config,
                            actionBudget
                        );
                        break;
                    }

                    const confirmRoll = Math.random();
                    if (confirmRoll < confirmChance) {
                        const katakanaCandidate =
                            candidates.find(
                                function (candidate) {
                                    return candidate.source ===
                                        "katakana";
                                }
                            );
                        const chosen =
                            katakanaCandidate &&
                            Math.random() <
                                config.katakanaChance ?
                                katakanaCandidate :
                                rawCandidate;

                        if (segmentCohesion) {
                            pushLog(session, {
                                type: "segment-cohesion-decision",
                                selected: "confirm",
                                typedPrefixLength:
                                    segmentCohesion.typedPrefixLength,
                                boundaryRisk:
                                    segmentCohesion.boundaryRisk,
                                confirmChance,
                                roll: confirmRoll
                            });
                            if (
                                segmentCohesion.singleKanaRawRisk &&
                                chosen.source === "raw-kana"
                            ) {
                                session.singleKanaRawRiskConfirms++;
                            }
                        }

                        confirmComposition(
                            session,
                            chosen
                        );
                        break;
                    }

                    if (segmentCohesion) {
                        pushLog(session, {
                            type: "segment-cohesion-decision",
                            selected: "continue-flick",
                            typedPrefixLength:
                                segmentCohesion.typedPrefixLength,
                            boundaryRisk:
                                segmentCohesion.boundaryRisk,
                            confirmChance,
                            roll: confirmRoll
                        });
                        if (segmentCohesion.singleKanaRawRisk) {
                            session.singleKanaRawContinues++;
                        }
                    }

                    appendFlick(session, config);
                    break;
                }

                case STATES.CANDIDATE_SELECT: {
                    const candidateSession =
                        session.candidateSession;

                    if (!candidateSession) {
                        transition(
                            session,
                            STATES.COMPOSING,
                            "missing-candidate-session"
                        );
                        break;
                    }

                    if (actionBudget <= 2) {
                        if (
                            config.completionAwareEnabled &&
                            session.text &&
                            structuredSegmentCount(session) >= 1 &&
                            ["HIGH", "MEDIUM"].includes(
                                session.lastCompletionState
                            )
                        ) {
                            cancelCurrentComposition(
                                session,
                                "completion-budget-tail-gate",
                                true
                            );
                            break;
                        }
                        confirmComposition(
                            session,
                            candidateSession.candidates[
                                candidateSession.index
                            ]
                        );
                        break;
                    }

                    if (
                        candidateSession.moves <
                            config.maxCandidateMoves &&
                        candidateSession.candidates.length > 1 &&
                        Math.random() <
                            config.candidateBrowseChance
                    ) {
                        moveCandidate(
                            session,
                            Math.random() < 0.22 ?
                                "previous" : "next"
                        );
                        break;
                    }

                    if (
                        Math.random() <
                            config.chooseCandidateChance
                    ) {
                        const selected =
                            candidateSession.candidates[
                                candidateSession.index
                            ];

                        if (
                            config.completionAwareEnabled &&
                            ["raw-kana", "katakana"].includes(
                                selected.source
                            ) &&
                            session.text &&
                            structuredSegmentCount(session) >= 1 &&
                            ["HIGH", "MEDIUM"].includes(
                                session.lastCompletionState
                            )
                        ) {
                            const candidateTailPath =
                                analyzeLocalPath(session, config);
                            const candidateTail = evaluateTailQuality(
                                session,
                                candidateTailPath,
                                config
                            );
                            if (!candidateTail.exactHit) {
                                applyTailQualityDecision(
                                    session,
                                    candidateTail,
                                    {
                                        text: session.composition,
                                        reading: session.composition,
                                        source: "raw-kana",
                                        pos: "unknown"
                                    },
                                    config,
                                    actionBudget
                                );
                                break;
                            }
                        }

                        if (
                            config.localGrammarEnabled &&
                            selected.localGrammarInvalidLike
                        ) {
                            const grammarRoll = Math.random();
                            const grammarAccepted = grammarRoll <
                                config.invalidGrammarAcceptance;
                            pushLog(session, {
                                type: "local-grammar-balance",
                                text: selected.text,
                                pos: selected.pos,
                                reasons:
                                    selected.localGrammarReasons || [],
                                multiplier:
                                    selected.localGrammarMultiplier || 1,
                                acceptanceChance:
                                    config.invalidGrammarAcceptance,
                                roll: grammarRoll,
                                accepted: grammarAccepted
                            });
                            if (!grammarAccepted) {
                                session.invalidGrammarRejects++;
                                closeCandidates(session);
                                break;
                            }
                            session.invalidGrammarAccepts++;
                        }

                        if (
                            config.languageLayerEnabled &&
                            POS_TRANSITIONS &&
                            session.languageState.desiredPos &&
                            POS_TRANSITIONS.compatibility(
                                session.languageState.desiredPos,
                                selected.pos
                            ) === 0
                        ) {
                            const acceptanceRoll = Math.random();
                            const accepted = acceptanceRoll <
                                config.incompatibleCandidateAcceptance;
                            pushLog(session, {
                                type: "candidate-pos-balance",
                                desiredPos:
                                    session.languageState.desiredPos,
                                candidatePos: selected.pos,
                                text: selected.text,
                                acceptanceChance:
                                    config.incompatibleCandidateAcceptance,
                                roll: acceptanceRoll,
                                accepted
                            });
                            if (!accepted) {
                                session.incompatibleCandidateRejects++;
                                closeCandidates(session);
                                break;
                            }
                            session.incompatibleCandidateAccepts++;
                        }

                        if (
                            config.segmentCohesionEnabled &&
                            selected.source === "prediction"
                        ) {
                            const selectionWeight =
                                selected.predictionSelectionWeight ||
                                config.predictionSelectionFloor;
                            const selectionRoll = Math.random();
                            const accepted =
                                selectionRoll < selectionWeight;

                            pushLog(session, {
                                type: "prediction-selection-balance",
                                text: selected.text,
                                typedPrefixLength:
                                    selected.typedPrefixLength ||
                                    session.composition.length,
                                completionLength:
                                    selected.completionLength || 0,
                                predictionSelectionWeight:
                                    selectionWeight,
                                roll: selectionRoll,
                                accepted
                            });

                            if (!accepted) {
                                session.predictionSelectionRejects++;
                                session.forceFlickAfterPredictionReject = true;
                                closeCandidates(session);
                                break;
                            }

                            session.predictionSelectionAccepts++;
                        }

                        pushLog(session, {
                            type: "select-candidate",
                            index: candidateSession.index,
                            text: selected.text,
                            source: selected.source
                        });
                        confirmComposition(
                            session,
                            selected
                        );
                    } else {
                        closeCandidates(session);
                    }
                    break;
                }

                case STATES.CONFIRMED: {
                    if (
                        session.text.length >=
                            config.maxLength ||
                        actionBudget <= 1
                    ) {
                        transition(
                            session,
                            STATES.READY_TO_SEND,
                            "ready-after-confirm"
                        );
                        break;
                    }

                    if (
                        !session.endingSymbolConsidered &&
                        actionBudget > 2 &&
                        maybeAppendEndingSymbol(
                            session,
                            config
                        )
                    ) {
                        break;
                    }

                    if (
                        session.text.length > 0 &&
                        session.corrections <
                            config.maxCorrections &&
                        actionBudget > 3 &&
                        Math.random() <
                            config.backspaceChance * 0.45
                    ) {
                        beginCorrection(
                            session,
                            "confirmed-text"
                        );
                        break;
                    }

                    const postConfirm =
                        evaluatePostConfirm(
                            session,
                            config
                        );
                    const continueTyping =
                        postConfirm.continueTyping;

                    if (
                        postConfirm.completeness &&
                        postConfirm.completeness.completionState
                    ) {
                        const completionState =
                            postConfirm.completeness.completionState;
                        const outcome = continueTyping ?
                            "continue" : "send";
                        session.completionDecisions[
                            completionState
                        ][outcome]++;
                        const boundary =
                            postConfirm.completeness
                                .completionBoundary || "unknown";
                        if (!session.completionBoundaryDecisions[boundary]) {
                            session.completionBoundaryDecisions[boundary] = {
                                send: 0,
                                continue: 0
                            };
                        }
                        session.completionBoundaryDecisions[
                            boundary
                        ][outcome]++;
                        const inflectionType =
                            postConfirm.completeness
                                .completionInflectionType;
                        if (inflectionType) {
                            if (!session.inflectionCompletionDecisions[
                                inflectionType
                            ]) {
                                session.inflectionCompletionDecisions[
                                    inflectionType
                                ] = { send: 0, continue: 0 };
                            }
                            session.inflectionCompletionDecisions[
                                inflectionType
                            ][outcome]++;
                        }
                    }

                    if (postConfirm.completeness) {
                        pushLog(session, Object.assign({
                            type: "message-completeness"
                        }, postConfirm.completeness));
                        pushLog(session, {
                            type: "post-confirm-decision",
                            baseContinueChance:
                                postConfirm.baseContinueChance,
                            sendBoost: postConfirm.sendBoost,
                            finalContinueChance:
                                postConfirm.finalContinueChance,
                            roll: postConfirm.roll,
                            result: continueTyping
                        });
                        if (postConfirm.informationDensity) {
                            pushLog(session, Object.assign({
                                type: "information-density"
                            }, postConfirm.informationDensity));
                        }
                        if (postConfirm.adjustments) {
                            pushLog(session, Object.assign({
                                type: "continuation-adjustments"
                            }, postConfirm.adjustments));
                            if (
                                postConfirm.adjustments
                                    .secondSegmentBoost > 0
                            ) {
                                session.secondSegmentAttractions++;
                            }
                            if (
                                continueTyping &&
                                session.text.length === 1
                            ) {
                                session.shortSegmentContinues++;
                            }
                        }
                        if (postConfirm.sendBoost > 0) {
                            session.postConfirmSendBoosts++;
                        }
                        if (
                            !continueTyping &&
                            session.text.length <
                                config.maxLength * 0.5
                        ) {
                            session.earlyEndings++;
                        }
                    }

                    recordAction(
                        session,
                        "continue-check",
                        {
                            result: continueTyping,
                            confirmedText: session.text,
                            baseContinueChance:
                                postConfirm.baseContinueChance,
                            sendBoost: postConfirm.sendBoost,
                            finalContinueChance:
                                postConfirm.finalContinueChance,
                            roll: postConfirm.roll
                        },
                        continueTyping ?
                            "continue" :
                            "ready-to-send",
                        0
                    );

                    transition(
                        session,
                        continueTyping ?
                            STATES.COMPOSING :
                            STATES.READY_TO_SEND,
                        continueTyping ?
                            "continue-composing" :
                            "stop-composing"
                    );
                    break;
                }

                case STATES.CORRECTING:
                    performCorrection(
                        session,
                        config
                    );
                    break;

                case STATES.READY_TO_SEND:
                    recordAction(session, "send", {
                        text: session.text
                    }, "send", 1);
                    transition(
                        session,
                        STATES.SENT,
                        "message-sent"
                    );
                    break;

                default:
                    transition(
                        session,
                        STATES.READY_TO_SEND,
                        "invalid-state-recovery"
                    );
                    break;
            }
        }

        // 正常路径会在 maxSteps 内保留 send 动作。这个兜底只处理
        // 非预期的外部配置或未来状态扩展，仍不生成目标句。
        if (session.state !== STATES.SENT) {
            if (!session.text && session.composition) {
                session.text = session.composition.slice(
                    0,
                    config.maxLength
                );
                session.composition = "";
            }

            if (!session.text) {
                session.text = "あ";
            }

            pushLog(session, {
                type: "safety-finalize",
                text: session.text
            });
            session.state = STATES.SENT;
        }

        const result = {
            text: session.text,
            duration: session.duration,
            keystrokes: session.keystrokes,
            actions: session.actions,
            steps: session.actions,
            confirmations: session.confirmations,
            corrections: session.corrections,
            candidateSessions: session.candidateSessions,
            candidateMoves: session.candidateMoves,
            languageGuidedFlicks:
                session.languageGuidedFlicks,
            freeFlicks: session.freeFlicks,
            predictionBiasedFlicks:
                session.predictionBiasedFlicks,
            transitionBiasedFlicks:
                session.transitionBiasedFlicks,
            startBiasedFlicks:
                session.startBiasedFlicks,
            segmentAttractedFlicks:
                session.segmentAttractedFlicks,
            symbolInputs: session.symbolInputs,
            symbolEndings: session.symbolEndings,
            exactHitConfirmBoosts:
                session.exactHitConfirmBoosts,
            strongPrefixBoosts:
                session.strongPrefixBoosts,
            chatOverrideHits:
                session.chatOverrideHits,
            postConfirmSendBoosts:
                session.postConfirmSendBoosts,
            earlyEndings: session.earlyEndings,
            secondSegmentAttractions:
                session.secondSegmentAttractions,
            shortSegmentContinues:
                session.shortSegmentContinues,
            cancelledCompositions:
                session.cancelledCompositions,
            tailBackspaceDecisions:
                session.tailBackspaceDecisions,
            tailSendExistingDecisions:
                session.tailSendExistingDecisions,
            confirmedUnknownTails:
                session.confirmedUnknownTails,
            singleKanaRawContinues:
                session.singleKanaRawContinues,
            singleKanaRawRiskConfirms:
                session.singleKanaRawRiskConfirms,
            predictionSelectionAccepts:
                session.predictionSelectionAccepts,
            predictionSelectionRejects:
                session.predictionSelectionRejects,
            incompatibleCandidateAccepts:
                session.incompatibleCandidateAccepts,
            incompatibleCandidateRejects:
                session.incompatibleCandidateRejects,
            invalidGrammarAccepts:
                session.invalidGrammarAccepts,
            invalidGrammarRejects:
                session.invalidGrammarRejects,
            invalidLikeSequences:
                session.invalidLikeSequences,
            particleTransitionCounts: Object.assign(
                {},
                session.particleTransitionCounts
            ),
            averageTypedPrefixLength:
                session.typedPrefixSamples ?
                    session.typedPrefixTotal /
                        session.typedPrefixSamples : 0,
            posTransitionUses: session.posTransitionUses,
            posTransitionMatches: session.posTransitionMatches,
            posTransitionDeviations:
                session.posTransitionDeviations,
            posTransitionCounts: Object.assign(
                {},
                session.posTransitionCounts
            ),
            languagePathContinues:
                session.languagePathContinues,
            inflectionUses: session.inflectionUses,
            inflectionCounts: Object.assign(
                {},
                session.inflectionCounts
            ),
            particleContinuations:
                session.particleContinuations,
            endingContinuations:
                session.endingContinuations,
            completionState: session.lastCompletionState,
            structuredStability: Object.assign(
                {},
                session.lastStructuredStability
            ),
            completionDecisions: JSON.parse(JSON.stringify(
                session.completionDecisions
            )),
            completionBoundaryDecisions: JSON.parse(JSON.stringify(
                session.completionBoundaryDecisions
            )),
            inflectionCompletionDecisions: JSON.parse(JSON.stringify(
                session.inflectionCompletionDecisions
            )),
            languageState: {
                previousPos:
                    session.languageState.previousPos,
                recentPos:
                    session.languageState.recentPos.slice(),
                desiredPos:
                    session.languageState.desiredPos
            },
            confirmationSources: Object.assign(
                {},
                session.confirmationSources
            ),
            segments: session.segments,
            finalState: session.state,
            log: session.log
        };

        if (config.debug) {
            printDebug(result);
        }

        return result;
    }

    // ============================================================
    // Console 调试输出
    // ============================================================

    function printDebug(result) {
        console.group(
            "[RandomIME] Flick Session"
        );

        result.log.forEach(
            function (event) {
                const position =
                    "[#" + event.step +
                    " +" + event.elapsed + "ms]";

                switch (event.type) {
                    case "session-start":
                        console.log(
                            position,
                            "SESSION START",
                            event.version
                        );
                        break;

                    case "state-change":
                        console.log(
                            position,
                            "STATE →",
                            event.to,
                            "(" + event.reason + ")"
                        );
                        break;

                    case "touch":
                        console.log(
                            position,
                            "TOUCH",
                            event.key
                        );
                        break;

                    case "pos-transition":
                        console.log(
                            position,
                            "POS TRANSITION →",
                            event.previousPos,
                            "→",
                            event.desiredPos,
                            "(probabilistic attraction; no target word)"
                        );
                        break;

                    case "language-guided-flick":
                        console.log(
                            position,
                            "LANGUAGE-GUIDED FLICK →",
                            event.desiredPos,
                            event.prefix || "∅",
                            "→",
                            event.suggestedKana
                        );
                        break;

                    case "prediction-influence":
                        console.log(
                            position,
                            "PREDICTION INFLUENCE",
                            event.prefix || "∅",
                            "→",
                            event.suggestedKana
                        );
                        break;

                    case "start-kana-bias":
                        console.log(
                            position,
                            "START KANA BIAS →",
                            event.suggestedKana,
                            "(no target word)"
                        );
                        break;

                    case "segment-pos-influence":
                        console.log(
                            position,
                            "SEGMENT POS INFLUENCE →",
                            event.previousPos,
                            "→",
                            event.suggestedKana,
                            "(no grammar slot)"
                        );
                        break;

                    case "path-quality":
                        console.log(
                            position,
                            "PATH QUALITY →",
                            {
                                reading: event.reading || "∅",
                                exactHit: event.exactHit,
                                prefixStrength:
                                    event.prefixStrength,
                                chatWeight: event.chatWeight,
                                fragmentTerminal:
                                    event.fragmentTerminal,
                                quality: event.quality
                            }
                        );
                        break;

                    case "dynamic-weights":
                        console.log(
                            position,
                            "DYNAMIC WEIGHTS →",
                            {
                                free: event.free,
                                prediction: event.prediction,
                                transition: event.transition,
                                start: event.start
                            }
                        );
                        break;

                    case "composition-decision-weights":
                        console.log(
                            position,
                            "COMPOSITION DECISION →",
                            {
                                reading: event.reading,
                                pathQuality: event.pathQuality,
                                open: event.openChance,
                                confirm: event.confirmChance,
                                exactBoost:
                                    event.exactConfirmBoost,
                                prefixBoost:
                                    event.strongPrefixConfirmBoost,
                                chatBoost:
                                    event.chatConfirmBoost
                            }
                        );
                        break;

                    case "tail-quality":
                        console.log(
                            position,
                            "TAIL QUALITY →",
                            {
                                exactHit: event.exactHit,
                                prefixStrength:
                                    event.prefixStrength,
                                unknownLength:
                                    event.unknownLength,
                                previousStructured:
                                    event.previousStructured,
                                structuredCount:
                                    event.structuredCount,
                                unknownTailPenalty:
                                    event.unknownTailPenalty,
                                actionWeights:
                                    event.actionWeights
                            }
                        );
                        break;

                    case "tail-decision":
                        console.log(
                            position,
                            "TAIL DECISION →",
                            event.selected,
                            event.actionWeights
                        );
                        break;

                    case "segment-cohesion":
                        console.log(
                            position,
                            "SEGMENT COHESION",
                            {
                                typedPrefixLength:
                                    event.typedPrefixLength,
                                strongPrefix: event.strongPrefix,
                                functionalExact:
                                    event.functionalExact,
                                singleKanaRawRisk:
                                    event.singleKanaRawRisk,
                                boundaryRisk: event.boundaryRisk,
                                confirmMultiplier:
                                    event.confirmMultiplier,
                                continueWeight:
                                    event.continueWeight,
                                completionLength:
                                    event.bestPredictionCompletionLength,
                                predictionSelectionWeight:
                                    event.bestPredictionSelectionWeight
                            }
                        );
                        break;

                    case "segment-cohesion-decision":
                        console.log(
                            position,
                            "SEGMENT COHESION DECISION",
                            event.selected,
                            {
                                typedPrefixLength:
                                    event.typedPrefixLength,
                                boundaryRisk: event.boundaryRisk,
                                confirmChance: event.confirmChance,
                                roll: event.roll
                            }
                        );
                        break;

                    case "prediction-selection-balance":
                        console.log(
                            position,
                            "PREDICTION SELECTION BALANCE",
                            event.text,
                            {
                                typedPrefixLength:
                                    event.typedPrefixLength,
                                completionLength:
                                    event.completionLength,
                                weight:
                                    event.predictionSelectionWeight,
                                roll: event.roll,
                                accepted: event.accepted
                            }
                        );
                        break;

                    case "kana-transition-influence":
                        console.log(
                            position,
                            "KANA TRANSITION INFLUENCE",
                            event.previousKana,
                            "→",
                            event.suggestedKana
                        );
                        break;

                    case "flick":
                        console.log(
                            position,
                            "FLICK",
                            event.key,
                            "→",
                            event.direction,
                            "→",
                            event.baseOutput,
                            "[" + event.inputSource + "]"
                        );
                        break;

                    case "symbol-input":
                        console.log(
                            position,
                            "SYMBOL INPUT",
                            event.key,
                            "→",
                            event.direction,
                            "→",
                            event.baseOutput
                        );
                        break;

                    case "kana-variant":
                        console.log(
                            position,
                            "KANA VARIANT",
                            event.from,
                            "→",
                            event.to
                        );
                        break;

                    case "output":
                        console.log(
                            position,
                            "OUTPUT →",
                            event.output
                        );
                        break;

                    case "composition":
                        console.log(
                            position,
                            "COMPOSITION →",
                            event.reading
                        );
                        break;

                    case "candidate-list":
                        console.log(
                            position,
                            "CANDIDATES →",
                            event.candidateDetails.map(
                                function (candidate) {
                                    return (
                                        candidate.text +
                                        " [" +
                                        candidate.source +
                                        "]"
                                    );
                                }
                            ).join(" / ")
                        );
                        break;

                    case "open-candidates":
                        console.log(
                            position,
                            "OPEN CANDIDATES →",
                            event.text,
                            "[" + event.index + "]"
                        );
                        break;

                    case "candidate-next":
                        console.log(
                            position,
                            "CANDIDATE NEXT →",
                            event.text,
                            "[" + event.index + "]"
                        );
                        break;

                    case "candidate-previous":
                        console.log(
                            position,
                            "CANDIDATE PREVIOUS →",
                            event.text,
                            "[" + event.index + "]"
                        );
                        break;

                    case "candidate-cancel":
                        console.log(
                            position,
                            "CANDIDATE CANCEL"
                        );
                        break;

                    case "select-candidate":
                        console.log(
                            position,
                            "SELECT →",
                            event.text
                        );
                        break;

                    case "confirm":
                        console.log(
                            position,
                            "CONFIRM →",
                            event.text,
                            "(" + event.source +
                                ", " + event.pos + ")"
                        );
                        break;

                    case "inflection-confirm":
                        console.log(
                            position,
                            "INFLECTION →",
                            event.lemmaText,
                            "→",
                            event.text,
                            "[" + event.inflectionType + "]"
                        );
                        break;

                    case "backspace":
                        console.log(
                            position,
                            "BACKSPACE →",
                            event.removed,
                            "| confirmed:",
                            event.confirmedText,
                            "| composition:",
                            event.composition
                        );
                        break;

                    case "cancel-composition":
                        console.log(
                            position,
                            "CANCEL COMPOSITION →",
                            event.abandoned,
                            "| keep:",
                            event.confirmedText,
                            "| send:",
                            event.sendExisting
                        );
                        break;

                    case "symbol-ending":
                        console.log(
                            position,
                            "SYMBOL ENDING →",
                            event.symbol
                        );
                        break;

                    case "message-completeness":
                        console.log(
                            position,
                            "MESSAGE COMPLETENESS →",
                            {
                                fragmentTerminal:
                                    event.fragmentTerminal,
                                convertedQuality:
                                    event.convertedQuality,
                                symbolEnding:
                                    event.symbolEnding,
                                totalLength:
                                    event.totalLength,
                                segments: event.segments,
                                score: event.score
                            }
                        );
                        break;

                    case "post-confirm-decision":
                        console.log(
                            position,
                            "POST-CONFIRM →",
                            {
                                baseContinue:
                                    event.baseContinueChance,
                                sendBoost: event.sendBoost,
                                finalContinue:
                                    event.finalContinueChance,
                                roll: event.roll,
                                result: event.result
                            }
                        );
                        break;

                    case "information-density":
                        console.log(
                            position,
                            "INFORMATION DENSITY →",
                            {
                                score: event.score,
                                length: event.lengthScore,
                                segments: event.segmentScore,
                                structural:
                                    event.qualityRatio,
                                converted:
                                    event.convertedRatio,
                                functional:
                                    event.functionalRatio,
                                unknown: event.unknownRatio
                            }
                        );
                        break;

                    case "continuation-adjustments":
                        console.log(
                            position,
                            "CONTINUATION ADJUSTMENTS →",
                            {
                                short:
                                    event.shortContinueBoost,
                                secondSegment:
                                    event.secondSegmentBoost,
                                terminalSend:
                                    event.terminalSendBoost,
                                informationSend:
                                    event.informationSendBoost,
                                structuredPairSend:
                                    event.structuredPairSendBoost,
                                structuredMessageSend:
                                    event.structuredMessageSendBoost,
                                segmentDecay:
                                    event.segmentDecay,
                                cohesionSegmentDecay:
                                    event.cohesionSegmentDecay,
                                symbolSend:
                                    event.symbolSendBoost
                            }
                        );
                        break;

                    case "continue-check":
                        console.log(
                            position,
                            "CONTINUE →",
                            event.result
                        );
                        break;

                    case "send":
                        console.log(
                            position,
                            "SEND →",
                            event.text
                        );
                        break;

                    case "safety-finalize":
                        console.warn(
                            position,
                            "SAFETY FINALIZE →",
                            event.text
                        );
                        break;
                }
            }
        );

        console.log("FINAL →", result.text);
        console.log("DURATION →", result.duration + "ms");
        console.log("KEYSTROKES →", result.keystrokes);
        console.log("ACTIONS →", result.actions);
        console.log(
            "FLICK SOURCES →",
            {
                languageGuided:
                    result.languageGuidedFlicks,
                free: result.freeFlicks,
                prediction:
                    result.predictionBiasedFlicks,
                transition:
                    result.transitionBiasedFlicks,
                start: result.startBiasedFlicks,
                segmentAttracted:
                    result.segmentAttractedFlicks,
                symbol: result.symbolInputs
            }
        );
        console.log(
            "CONFIRM SOURCES →",
            result.confirmationSources
        );
        console.groupEnd();
    }

// ============================================================
// 对外 API
// ============================================================

window.RandomIME = {
    version: VERSION,

    generate,

    getCandidates,

    randomFlick,

    hiraganaToKatakana,

    dictionary: IME_DICTIONARY,

    lexicon: LEXICON,

    chatOverrides: CHAT_OVERRIDES,

    posTransitions: POS_TRANSITIONS,

    localGrammar: LOCAL_GRAMMAR,

    customLexicon: window.RandomIMECustomLexicon || null,

    flickKeys: FLICK_KEYS,

    flickPaths: Object.freeze(
        Array.from(
            FLICK_PATH_BY_OUTPUT.keys()
        )
    ),

    states: STATES,

    defaultOptions: Object.assign({}, DEFAULT_OPTIONS)
};

// ============================================================
// 测试函数
//
// Console:
//
// testRandomIME()
//
// 或：
//
// testRandomIME({
//     minLength: 4,
//     maxLength: 12
// })
// ============================================================

window.testRandomIME =
    function (options) {
        return window.RandomIME.generate(
            Object.assign({ debug: true }, options || {})
        );
    };

console.log(
    "[RandomIME] Flick IME 核心已加载，版本",
    VERSION
);

})();
