#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..", "..", "..");
const outputs = path.join(projectRoot, "outputs");
const stage6 = JSON.parse(fs.readFileSync(path.join(outputs, "randomime-stage6-evaluation.json"), "utf8"));
const stage61 = JSON.parse(fs.readFileSync(path.join(outputs, "randomime-stage61-evaluation.json"), "utf8"));

function pct(value) {
    return (Number(value || 0) * 100).toFixed(1) + "%";
}

function metric(label, getter) {
    return `| ${label} | ${getter(stage6)} | ${getter(stage61)} |`;
}

const comparison = [
    "| 指标 | Stage 6 | Stage 6.1 |",
    "|---|---:|---:|",
    metric("A（结构代理）", j => pct(j.sampleMetrics.qualityClassification.A.rate)),
    metric("B（结构代理）", j => pct(j.sampleMetrics.qualityClassification.B.rate)),
    metric("C（结构代理）", j => pct(j.sampleMetrics.qualityClassification.C.rate)),
    metric("平均长度", j => j.sampleMetrics.averages.length.toFixed(3)),
    metric("平均 segment", j => j.sampleMetrics.averages.segments.toFixed(3)),
    metric("POS match", j => pct(j.sampleMetrics.posTransitions.matchRate)),
    metric("inflection / message", j => j.sampleMetrics.inflections.ratePerMessage.toFixed(3)),
    metric("prediction selected", j => pct(j.sampleMetrics.rates.predictionSelected)),
    metric("free Flick", j => pct(j.sampleMetrics.rates.freeFlick)),
    metric("pure unknown", j => pct(j.sampleMetrics.rates.pureUnknownMessage)),
    metric("garbage tail", j => pct(j.sampleMetrics.rates.structuredGarbageTail)),
    metric("unique ratio", j => pct(j.sampleMetrics.diversity.uniqueRatio))
].join("\n");

const s = stage61.sampleMetrics;
const first100 = stage61.continuousFirst100.map((text, index) => `${index + 1}. ${text}`).join("\n");
const report = `# RandomIME Stage 6.1 + Custom Lexicon Result

固定 seed ${stage61.seed}。每条输出只生成一个 session，没有重生成、择优或生成后修复。

## 1–8. 文件、语言层与词典路线

- 新增 ime-local-grammar.js、ime-custom-lexicon.js、ime-custom-lexicon-ui.js，以及对应自动测试工具；更新 random-ime.js、ime-lexicon.js、index.html、styles.css 和评估工具。
- Local Grammar 每确认一个 segment 后重新计算，只观察 RandomIME 自己的 POS、局部 token 和 inflectionType。
- noun/pronoun 后提高常用 particle；particle 后提高 noun/verb/adjective/adverb，并降低连续 particle；verb/adjective 后按局部形态区分 ending 与 clause particle。
- 连续 ending、连续同词、活用后重复 たい/ない/てる/てた 会被强烈降权，但仍以 ${stage61.options.invalidGrammarAcceptance || 0.14} 的非零概率保持可达。
- prediction 短前缀接受率降低；被拒绝后强制继续一次真实 Flick。平均 typed prefix 为 ${s.localGrammar.averageTypedPrefixLength}，prediction selected 降至 ${pct(s.rates.predictionSelected)}。
- 活用候选改为随较长 Flick prefix 增强，而不是强制选取；本轮使用 ${s.inflections.uses} 次。
- 仍然 Semantic-Blind：没有用户消息、历史、sender、词义、AI、LLM 或完整句型模板。
- 基础词典 ${stage61.lexicon.runtimeEntries} 条，运行时虚拟活用 ${stage61.lexicon.runtimeInflectedEntries} 条。后续应按日常领域分包构建 15k–30k 核心词典，并保留 base/anime/chat/custom 分层和构建时许可证记录。

## 9–16. User Custom Lexicon

- 独立 localForage 存储键：CHAT_APP_V3_imeCustomLexicon；不属于角色或会话，所有角色共用。
- UI 入口：设置 → 高级功能 → IME 自定义词库。
- 结构：id、reading、text、pos、weight、enabled、createdAt、updatedAt。
- reading 自动把片假名转成平假名；空读音或非假名读音拒绝，不猜读音。
- 支持添加、编辑、删除、启用/禁用、text/reading 本地搜索、同音不同词和完全重复拒绝。
- JSON 带 version；非法 JSON 不改变当前数据，部分非法项跳过并返回计数。
- 保存后内存 exact/prefix/next-kana index 立即重建；RandomIME.getCandidates() 无需重建 JMdict 即可看到新词。
- 自动测试覆盖 3,000 条自定义词：导入约 100.93ms，2,000 次 exact/prefix 查询约 37.68ms（本机 Node 测试，仅作量级参考）。

## 17. 10,000 次安全测试

${Object.entries(stage61.stress.safety).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## 18. Stage 6 vs Stage 6.1

${comparison}

## 19–20. 1,000 条 A/B/C 与目标差距

分类为一次性语义盲结构代理，不是 AI 或母语者语义评审。

- A：${s.qualityClassification.A.count}/1000（${pct(s.qualityClassification.A.rate)}），距 70% 低 ${(70 - s.qualityClassification.A.rate * 100).toFixed(1)} 点。
- B：${s.qualityClassification.B.count}/1000（${pct(s.qualityClassification.B.rate)}），距 25% 高 ${(s.qualityClassification.B.rate * 100 - 25).toFixed(1)} 点。
- C：${s.qualityClassification.C.count}/1000（${pct(s.qualityClassification.C.rate)}），距 5% 高 ${(s.qualityClassification.C.rate * 100 - 5).toFixed(1)} 点。

## 21–25. 路径统计

- inflection：${s.inflections.uses} 次；${JSON.stringify(s.inflections.byType)}。
- POS transition：${s.posTransitions.uses} 次，match ${s.posTransitions.matches}，deviation ${s.posTransitions.deviations}，match ${pct(s.posTransitions.matchRate)}。
- particle confirmations：${s.totals.particleContinuations}；ending/auxiliary confirmations：${s.totals.endingContinuations}；invalid-like candidate 拒绝 ${s.localGrammar.rejectedCandidates}、接受 ${s.localGrammar.acceptedCandidates}，最终确认 invalid-like ${s.localGrammar.invalidLikeSequences}。
- prediction selected：${pct(s.rates.predictionSelected)}；free Flick：${pct(s.rates.freeFlick)}；pure unknown：${pct(s.rates.pureUnknownMessage)}；garbage tail：${pct(s.rates.structuredGarbageTail)}。
- 平均长度 ${s.averages.length}；平均 segment ${s.averages.segments}；unique ratio ${pct(s.diversity.uniqueRatio)}。

## 26. 连续前 100 条（未挑选、未排序）

${first100}

## 27. 浏览器实际 UI 测试

本地 HTTP 页面和新增入口 HTML/CSS 能渲染，所有本地脚本 URL 均返回 200。但当前 Codex in-app Browser 会话没有执行该页面的任何项目脚本（包括原有 showModal 和 RandomIME），因此设置按钮无事件响应，无法诚实完成真实 CRUD/刷新操作。该项记为“环境受阻”，不是通过。数据层 CRUD/持久化/导入导出已由独立 localForage 模拟测试通过。

## 28. 下一步建议

Stage 6.1 把 A 结构代理从 ${pct(stage6.sampleMetrics.qualityClassification.A.rate)} 提升到 ${pct(s.qualityClassification.A.rate)}，prediction 降低且 typed prefix/inflection 改善；但 C 仍为 ${pct(s.qualityClassification.C.rate)}，garbage tail 为 ${pct(s.rates.structuredGarbageTail)}。当前适合开发分支试玩，不适合宣告 70/25/5 完成。下一步应先继续细化 fragment 边界与 unknown-tail/local grammar 的协作，再扩充按日常领域筛选的基础 lexicon；不要只扩大词量。
`;

fs.writeFileSync(path.join(outputs, "randomime-stage61-report.md"), report, "utf8");
console.log("Stage 6.1 report rendered.");
