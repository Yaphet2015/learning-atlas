// Compare eval runs: node evals/compare.mjs --a base1.json,base2.json --b new1.json,new2.json [--out file.md]
// Optional --topics id,id or --exclude id,id restricts the comparison.
// Each file is a summary.json. Reports means per dimension, per question type, per topic,
// and the run-to-run spread inside each group as a noise estimate.
import { readFileSync, writeFileSync } from "node:fs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const only = arg("topics")?.split(",");
const exclude = arg("exclude")?.split(",");
const keep = (t) => (!only || only.includes(t.id)) && !exclude?.includes(t.id);
const load = (list) =>
  (list ?? "")
    .split(",")
    .filter(Boolean)
    .map((f) => JSON.parse(readFileSync(f, "utf8")))
    .map((r) => ({ ...r, byTopic: r.byTopic.filter(keep) }));
const A = load(arg("a"));
const B = load(arg("b"));
if (!A.length || !B.length) {
  console.error(
    "usage: node evals/compare.mjs --a s1.json[,s2.json] --b s3.json[,s4.json] [--out file.md]",
  );
  process.exit(1);
}
const DIMS = [
  ["goalFit", "贴题"],
  ["coverage", "覆盖"],
  ["checklistCoverage", "清单覆盖率"],
  ["depth", "深度"],
  ["nonRedundancy", "不重复"],
];
const EXTRA = [
  ["l2", "L2 新信息率", (t) => t.newInfo?.[2]],
  ["l3", "L3 新信息率", (t) => t.newInfo?.[3]],
  ["cards", "卡片数", (t) => t.cards],
  [
    "body",
    "平均正文字数",
    (t) => {
      const v = Object.values(t.avgBody ?? {});
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
    },
  ],
];
const metrics = [
  ...DIMS.map(([k, label]) => [k, label, (t) => t[k]]),
  ...EXTRA,
];
const mean = (xs) => {
  const v = xs.filter((x) => typeof x === "number" && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
};
const f = (x, d = 2) => (Number.isNaN(x) ? "–" : x.toFixed(d));
const sign = (x, d = 2) =>
  Number.isNaN(x) ? "–" : `${x >= 0 ? "+" : ""}${x.toFixed(d)}`;
const topics = (runs) => runs.flatMap((r) => r.byTopic);
const groupMean = (runs, pick, filter = () => true) =>
  mean(topics(runs).filter(filter).map(pick));
/** Run-to-run spread: mean over topics of |run i − run j| for the same topic (needs ≥2 runs). */
const spread = (runs, pick) => {
  if (runs.length < 2) return NaN;
  const ids = runs[0].byTopic.map((t) => t.id);
  const diffs = [];
  for (const id of ids) {
    const vals = runs
      .map((r) => pick(r.byTopic.find((t) => t.id === id) ?? {}))
      .filter((x) => typeof x === "number");
    for (let i = 0; i < vals.length; i++)
      for (let j = i + 1; j < vals.length; j++)
        diffs.push(Math.abs(vals[i] - vals[j]));
  }
  return mean(diffs);
};
/** Spread of the whole-run mean between runs of one group (the noise on an overall number). */
const runMeanSpread = (runs, pick) => {
  if (runs.length < 2) return NaN;
  const means = runs.map((r) => mean(r.byTopic.map(pick)));
  return Math.max(...means) - Math.min(...means);
};
const lines = [];
lines.push(
  `A：${A.map((r) => r.stamp).join("、")}（${A.length} 次）；B：${B.map((r) => r.stamp).join("、")}（${B.length} 次）。模型 ${A[0].model} / ${B[0].model}。`,
  "",
);
lines.push(
  "## 总体",
  "",
  "| 指标 | A | B | Δ (B−A) | A 两次均值差 | B 两次均值差 | A 单题平均波动 | B 单题平均波动 |",
  "|---|---|---|---|---|---|---|---|",
);
for (const [, label, pick] of metrics) {
  const a = groupMean(A, pick),
    b = groupMean(B, pick);
  lines.push(
    `| ${label} | ${f(a)} | ${f(b)} | ${sign(b - a)} | ${f(runMeanSpread(A, pick))} | ${f(runMeanSpread(B, pick))} | ${f(spread(A, pick))} | ${f(spread(B, pick))} |`,
  );
}
const types = [...new Set(A[0].byTopic.map((t) => t.type))];
lines.push(
  "",
  "## 按问题类型（Δ = B − A，各类 2 题 × 运行次数取均值）",
  "",
  `| 类型 | ${DIMS.map(([, l]) => `${l} A→B`).join(" | ")} |`,
  `|---|${DIMS.map(() => "---").join("|")}|`,
);
for (const ty of types) {
  const cells = DIMS.map(([k]) => {
    const a = groupMean(
        A,
        (t) => t[k],
        (t) => t.type === ty,
      ),
      b = groupMean(
        B,
        (t) => t[k],
        (t) => t.type === ty,
      );
    return `${f(a)}→${f(b)} (${sign(b - a)})`;
  });
  lines.push(`| ${ty} | ${cells.join(" | ")} |`);
}
lines.push(
  "",
  "## 按主题",
  "",
  `| 主题 | 类型 | ${DIMS.map(([, l]) => `${l} A→B`).join(" | ")} |`,
  `|---|---|${DIMS.map(() => "---").join("|")}|`,
);
for (const { id, type } of A[0].byTopic) {
  const cells = DIMS.map(([k]) => {
    const a = groupMean(
        A,
        (t) => t[k],
        (t) => t.id === id,
      ),
      b = groupMean(
        B,
        (t) => t[k],
        (t) => t.id === id,
      );
    return `${f(a)}→${f(b)}`;
  });
  lines.push(`| ${id} | ${type} | ${cells.join(" | ")} |`);
}
const usage = (runs) =>
  runs.map(
    (r) =>
      `${r.stamp}: ${Math.round(r.wallMs / 1000)}s，${r.usage.calls} 次调用（失败 ${r.usage.failures}），输入 ${r.usage.prompt}（缓存 ${r.usage.cached}）/ 输出 ${r.usage.completion}（推理 ${r.usage.reasoning}）`,
  );
lines.push(
  "",
  "## 用量",
  "",
  ...usage(A).map((u) => `- A ${u}`),
  ...usage(B).map((u) => `- B ${u}`),
);
const md = lines.join("\n");
const out = arg("out");
if (out) writeFileSync(out, md + "\n");
console.log(md);
