#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..", "..");
const outputs = path.join(root, "outputs");
const stage4 = JSON.parse(fs.readFileSync(
    path.join(outputs, "randomime-stage4a8-evaluation.json"),
    "utf8"
));
const stage6 = JSON.parse(fs.readFileSync(
    path.join(outputs, "randomime-stage6-evaluation.json"),
    "utf8"
));

function percent(value) {
    return (Number(value || 0) * 100).toFixed(1) + "%";
}

function row(label, getter) {
    return `| ${label} | ${getter(stage4)} | ${getter(stage6)} |`;
}

const comparison = [
    "| 指标 | Stage 4A.8 | Stage 6 |",
    "|---|---:|---:|",
    row("A（结构代理分类）", j => percent(j.sampleMetrics.qualityClassification.A.rate)),
    row("B（结构代理分类）", j => percent(j.sampleMetrics.qualityClassification.B.rate)),
    row("C（结构代理分类）", j => percent(j.sampleMetrics.qualityClassification.C.rate)),
    row("平均长度", j => j.sampleMetrics.averages.length.toFixed(3)),
    row("平均 segment", j => j.sampleMetrics.averages.segments.toFixed(3)),
    row("free Flick", j => percent(j.sampleMetrics.rates.freeFlick)),
    row("prediction selected", j => percent(j.sampleMetrics.rates.predictionSelected)),
    row("dictionary selected", j => percent(j.sampleMetrics.rates.exactConversion)),
    row("pure unknown", j => percent(j.sampleMetrics.rates.pureUnknownMessage)),
    row("garbage tail", j => percent(j.sampleMetrics.rates.structuredGarbageTail)),
    row("unique ratio", j => percent(j.sampleMetrics.diversity.uniqueRatio)),
    row("平均模拟时长(ms)", j => j.sampleMetrics.averages.duration.toFixed(1))
].join("\n");

const representativeMap = [
    ["noun → particle → verb", "nounParticleVerb"],
    ["verb + ending", "verbEnding"],
    ["adjective + ending", "adjectiveEnding"],
    ["interjection / fragment", "interjectionOrFragment"],
    ["动词活用", "verbInflection"],
    ["形容词活用", "adjectiveInflection"],
    ["Anime 专有名词进入句子", "animeInSentence"],
    ["free Flick 偏离但仍可理解（结构代理）", "freeFlickDeviation"],
    ["pure unknown", "pureUnknown"],
    ["明显随机路径（结构代理）", "obviousRandom"]
];

const logs = representativeMap.map(([label, key], index) => {
    const result = stage6.representatives[key];
    if (!result) return `### ${index + 1}. ${label}\n\n正式样本中未观察到。`;
    return [
        `### ${index + 1}. ${label}`,
        "",
        `最终文本：${result.text}`,
        "",
        "确认 segments：",
        "",
        "```json",
        JSON.stringify(result.segments, null, 2),
        "```",
        "",
        "完整 action log：",
        "",
        "```json",
        JSON.stringify(result.log, null, 2),
        "```"
    ].join("\n");
}).join("\n\n");

const first100 = stage6.continuousFirst100
    .map((text, index) => `${index + 1}. ${text}`)
    .join("\n");

const s = stage6.sampleMetrics;
const safety = stage6.stress.safety;
const report = `# RandomIME Stage 6 Infinite Card Language Layer 结果

固定种子：${stage6.seed}。正式评估只执行一次；每个 reply 结果只运行一个 session，没有重生成、拒绝采样或择优。

## 1–9. 实现摘要

- 新增独立 POS transition 与 inflection 模块；RandomIME session 只依据自己已确认 segment 的 POS 更新 languageState。
- POS transition 每一步加权随机，并只吸引下一段的假名前缀和候选 POS；不会直接抽取最终词或句子。
- 动词支持 dictionary/past/negative/te/tai/progressive/past-progressive，い形容词支持 base/past/negative/te-continuation。
- 实际结果仍经 Flick → composition → 动态候选 → 浏览/选择 → confirm → 独立 send 形成。
- 没有完整句模板、target sentence、AI、LLM、聊天上下文、用户消息或历史输入。
- free Flick 保持非零；Stage 6 质量样本占 ${percent(s.rates.freeFlick)}，作为误输入/新词/库外路径。
- Anime 条目继续以普通 noun-like candidate 参与 exact/prefix/prediction；没有剧情或语义关联。

## 10. 10,000 次安全测试

| 检查 | 结果 |
|---|---:|
| 空输出 | ${safety.emptyOutputs} |
| 超过 maxLength | ${safety.overMaxLength} |
| 超过 maxSteps | ${safety.overMaxSteps} |
| 最终状态非 SENT | ${safety.nonSentFinalState} |
| candidate 无法退出 | ${safety.candidateExitFailures} |
| confirm/send 冲突 | ${safety.confirmSendCollision} |
| 异常 | ${safety.exceptions} |

## 11. Stage 4A.8 vs Stage 6

${comparison}

## 12–13. 1,000 条 A/B/C 与目标差距

本报告的 A/B/C 是一次性的、确定性“结构代理分类”：根据 unknown segment、POS transition 兼容性、fragmentation 和 garbage tail 标记，不读取词义，也不使用 AI。它不能代替日语母语者的主观自然度评审。

- A：${s.qualityClassification.A.count} / 1000（${percent(s.qualityClassification.A.rate)}），比 70% 目标低 ${(70 - s.qualityClassification.A.rate * 100).toFixed(1)} 个百分点。
- B：${s.qualityClassification.B.count} / 1000（${percent(s.qualityClassification.B.rate)}），比 25% 目标高 ${(s.qualityClassification.B.rate * 100 - 25).toFixed(1)} 个百分点。
- C：${s.qualityClassification.C.count} / 1000（${percent(s.qualityClassification.C.rate)}），比 5% 目标高 ${(s.qualityClassification.C.rate * 100 - 5).toFixed(1)} 个百分点。

A 仍低于 50%，说明语言层虽明显减少纯乱码，却尚未真正形成以自然短句为主体的路径；主要缺口是 POS 兼容只约束词类，不理解助词形态位置，且短 prefix prediction 仍容易跳入长词或不协调片段。

## 14–21. 分布与路径统计

- 平均长度：${s.averages.length.toFixed(3)}；2–5：${percent(s.targetLengthDistribution.twoToFive.rate)}，6–18：${percent(s.targetLengthDistribution.sixToEighteen.rate)}，19–24：${percent(s.targetLengthDistribution.nineteenToTwentyFour.rate)}，其他：${percent(s.targetLengthDistribution.other.rate)}。
- segment：1=${percent(s.segmentDistribution.one.rate)}，2=${percent(s.segmentDistribution.two.rate)}，3=${percent(s.segmentDistribution.three.rate)}，4=${percent(s.segmentDistribution.four.rate)}，5+=${percent(s.segmentDistribution.fivePlus.rate)}。
- pure unknown：${percent(s.rates.pureUnknownMessage)}；garbage tail：${percent(s.rates.structuredGarbageTail)}。
- unique ratio：${percent(s.diversity.uniqueRatio)}（${s.diversity.uniqueTexts}/1000）。
- prediction concentration：${s.predictionDiversity.totalSelections} 次选择，${s.predictionDiversity.uniqueTexts} 种文本，选择内 unique ratio ${percent(s.predictionDiversity.uniqueRatio)}，entropy ${s.predictionDiversity.entropyBits} bits；最高项“${s.predictionDiversity.top30[0].text}”占 ${percent(s.predictionDiversity.top30[0].rate)}。
- inflection：${s.inflections.uses} 次（每消息 ${s.inflections.ratePerMessage.toFixed(3)}）；${JSON.stringify(s.inflections.byType)}。
- POS transition：${s.posTransitions.uses} 次，匹配 ${s.posTransitions.matches}，偏离 ${s.posTransitions.deviations}，匹配率 ${percent(s.posTransitions.matchRate)}。
- 路径：language-guided Flick ${percent(s.rates.languageGuidedFlick)}，prediction Flick ${percent(s.rates.predictionBiasedFlick)}，free Flick ${percent(s.rates.freeFlick)}，dictionary selected ${percent(s.rates.exactConversion)}，prediction selected ${percent(s.rates.predictionSelected)}。

## 22. 连续前 100 条（未挑选、未排序）

${first100}

## 23. 10 个完整生成日志

这些日志从固定种子的正式 10,000 次结果中按预先声明的结构条件取首次最短 action 代表；文本未修改。日志内只有逐步 POS attraction、Flick、composition、candidate、confirm 和 send，不含 target sentence。

${logs}

## 24–25. 模板感与重复集中

- 没有完整句模板；所有句子由同一概率状态机形成。但高频 ending/prediction 会产生局部短语重复感，这是候选集中而非句库模板。
- 1000 条中 unique ratio 为 ${percent(s.diversity.uniqueRatio)}，没有严重整句重复集中；prediction 内部集中度较高（unique ratio ${percent(s.predictionDiversity.uniqueRatio)}），应继续观察高频候选对体验的影响。

## 26. 下一步建议

不建议只调参数，也不建议现在单纯扩大 lexicon。A 的结构代理仅 ${percent(s.qualityClassification.A.rate)}，但 C 已从 Stage 4A.8 的 ${percent(stage4.sampleMetrics.qualityClassification.C.rate)} 降至 ${percent(s.qualityClassification.C.rate)}：方向有效、结构粒度仍不足。下一步优先完善 inflection 与局部语法边界（尤其助词可接位置、活用后的 ending/auxiliary、较长 typedPrefix 门槛），保持语义盲；随后再扩大 lexicon。当前版本适合开发分支试玩，不建议作为自然度目标已完成的正式版本。
`;

fs.writeFileSync(
    path.join(outputs, "randomime-stage6-report.md"),
    report,
    "utf8"
);
console.log("Stage 6 report rendered.");
