/**
 * Generation eval harness. Runs the app's REAL prompt builders (tutorInstructions,
 * renderScopedContext, contextForNote, firstLevelPrompt, expandPrompt) and parser
 * (buildMapFromAI) against an OpenAI-compatible model from env, then scores the trees.
 *
 * Env (required): LLM_TEST_API_KEY, LLM_TEST_BASE_URL, LLM_TEST_MODEL.
 * Optional: EVAL_TOPICS=id,id  EVAL_CONCURRENCY=3  EVAL_ROUND2=first|all  EVAL_OUT=dir
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  canvasBundle,
  canvasTutorInstructions,
  maxOutputTokens,
  modeTemperature,
  renderScopedContext,
  tutorInstructions,
} from "../electron/prompts";
import { buildMapFromAI, createEmptyBoard, newNote } from "../src/model/boards";
import { contextForNote } from "../src/model/context";
import {
  firstLevelPrompt,
  kickoffNote,
  kickoffPrompt,
  kickoffSkeleton,
  learnerAnswers,
} from "../src/model/kickoff";
import { expandPrompt } from "../src/model/expand";
import type { Board, ContextBundle, StickyNote } from "../src/shared/types";
import { TOPICS, type EvalTopic } from "./topics";
import { treeMetrics, type EvalNode } from "./metrics";

const KEY = process.env.LLM_TEST_API_KEY;
const BASE = (process.env.LLM_TEST_BASE_URL ?? "").replace(/\/$/, "");
const MODEL = process.env.LLM_TEST_MODEL ?? "";
if (!KEY || !BASE || !MODEL) {
  console.log(
    "eval:generation skipped: set LLM_TEST_API_KEY, LLM_TEST_BASE_URL, LLM_TEST_MODEL.",
  );
  process.exit(0);
}
// Same output budget as the app gives this model (electron/prompts.ts maxOutputTokens).
const MAX_TOKENS = maxOutputTokens(MODEL);
const CONCURRENCY = Math.max(1, Number(process.env.EVAL_CONCURRENCY ?? 3));

interface Usage {
  prompt: number;
  completion: number;
  reasoning: number;
  cached: number;
}
const totals: Usage & { calls: number; failures: number } = {
  prompt: 0,
  completion: 0,
  reasoning: 0,
  cached: 0,
  calls: 0,
  failures: 0,
};

type Msg = { role: "system" | "user" | "assistant"; content: string };
async function chat(
  system: string,
  user: string | Msg[],
  opts: { temperature?: number } = {},
  tries = 3,
) {
  const turns: Msg[] =
    typeof user === "string" ? [{ role: "user", content: user }] : user;
  let last = "";
  for (let i = 0; i < tries; i++) {
    const started = Date.now();
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          ...(opts.temperature !== undefined
            ? { temperature: opts.temperature }
            : {}),
          messages: [{ role: "system", content: system }, ...turns],
        }),
        signal: AbortSignal.timeout(300_000),
      });
      const json: any = await res.json().catch(() => ({}));
      totals.calls++;
      if (!res.ok) {
        last = `HTTP ${res.status}: ${String(json?.error?.message ?? "").slice(0, 200)}`;
      } else {
        const msg = json.choices?.[0]?.message ?? {};
        const u = json.usage ?? {};
        totals.prompt += u.prompt_tokens ?? 0;
        totals.completion += u.completion_tokens ?? 0;
        totals.reasoning += u.completion_tokens_details?.reasoning_tokens ?? 0;
        totals.cached +=
          u.prompt_cache_hit_tokens ??
          u.prompt_tokens_details?.cached_tokens ??
          0;
        const content: string = msg.content ?? "";
        const finish = json.choices?.[0]?.finish_reason;
        if (content.trim())
          return {
            content,
            reasoningChars: (msg.reasoning_content ?? "").length,
            finish,
            usage: u,
            ms: Date.now() - started,
          };
        last = `empty content (finish_reason=${finish})`;
      }
    } catch (e) {
      last = String((e as Error).message ?? e).slice(0, 200);
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  totals.failures++;
  throw new Error(last);
}

interface Step {
  kind: "map" | "expand" | "kickoff";
  round: number;
  anchor: string;
  anchorTitle: string;
  systemChars: number;
  prompt: string;
  raw?: string;
  reasoningChars?: number;
  finish?: string;
  ms?: number;
  usage?: unknown;
  added: number;
  error?: string;
}

/** One generation exactly as App.tsx builds it: a virtual note on the anchor, full review context. */
async function generate(
  board: Board,
  anchorId: string,
  mode: "map" | "expand",
  prompt: string,
  round: number,
  steps: Step[],
) {
  const virtual = newNote(
    board,
    { x: 0, y: 0 },
    { kind: "node", id: anchorId },
  );
  const context: ContextBundle = contextForNote(
    { ...board, notes: [...board.notes, virtual] },
    virtual.id,
  );
  const system = `${tutorInstructions(mode)}\n\n${renderScopedContext(context)}`;
  const anchor = board.nodes.find((n) => n.id === anchorId)!;
  const step: Step = {
    kind: mode,
    round,
    anchor: anchorId,
    anchorTitle: anchor.title,
    systemChars: system.length,
    prompt,
    added: 0,
  };
  steps.push(step);
  try {
    const r = await chat(system, prompt, {
      temperature: modeTemperature(mode),
    });
    Object.assign(step, {
      raw: r.content,
      reasoningChars: r.reasoningChars,
      finish: r.finish,
      ms: r.ms,
      usage: r.usage,
    });
    const next = buildMapFromAI(r.content, board, anchorId, mode, context);
    step.added = next.nodes.length - board.nodes.length;
    return next;
  } catch (e) {
    step.error = String((e as Error).message ?? e);
    return board;
  }
}

function levels(board: Board): EvalNode[] {
  const byId = new Map(board.nodes.map((n) => [n.id, n]));
  const depth = (id: string): number => {
    let d = 0,
      p = byId.get(id)?.parentId ?? null;
    while (p) {
      d++;
      p = byId.get(p)?.parentId ?? null;
    }
    return d;
  };
  return board.nodes.map((n) => ({
    id: n.id,
    parentId: n.parentId,
    title: n.title,
    body: n.body,
    level: depth(n.id),
  }));
}

function outlineText(nodes: EvalNode[]): string {
  const kids = new Map<string | null, EvalNode[]>();
  for (const n of nodes)
    kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
  const lines: string[] = [];
  const walk = (n: EvalNode) => {
    lines.push(
      `${"  ".repeat(n.level)}- [L${n.level}] ${n.title}${n.body ? `：${n.body}` : ""}`,
    );
    for (const k of kids.get(n.id) ?? []) walk(k);
  };
  for (const r of kids.get(null) ?? []) walk(r);
  return lines.join("\n");
}

const JUDGE_SYSTEM = `你是严格的学习内容评审。你会看到一个学习者的起点问题、问题类型、一份人工编写的"必须覆盖要点"清单，以及 AI 生成的学习画布（树形大纲，L0 是起点，L1 第一层，L2/L3 是继续深挖）。
按下面的标准打 1–5 分（整数），严格、有区分度，3 分表示"及格但平庸"：
- goalFit（贴题）：整棵树是否围绕起点问题的真实意图（例如"怎么选"要落到决策维度与取舍，"如何学"要落到学习路径与方法，"为什么"要回答原因），而不是泛泛介绍该领域。5=每层都直接服务问题意图；1=大量偏题或答非所问。
- coverage（覆盖）：对照清单逐条判断是否被画布实质覆盖（标题或正文明确讲到该要点，不是只出现关键词）。另外判断是否有清单外但重要的遗漏。
- depth（深度）：卡片内容是否超出定义和复述，给出机制/因果、具体例子或数字、误区、判断标准；深层（L2/L3）是否真的比上层更深。5=多数卡片有实质信息；1=多数是标题式空话。
- nonRedundancy（不重复）：卡片之间、上下层之间是否避免同义改写和重复；深挖是否带来新信息。5=几乎无重复；1=大量换说法重复。
只输出一个 JSON 对象，不要代码围栏：{"goalFit":n,"coverage":n,"depth":n,"nonRedundancy":n,"checklist":[{"item":"清单原文","covered":true或false,"where":"覆盖它的卡片标题或空"}],"missingImportant":["清单外的重要遗漏"],"redundantPairs":[["卡片A","卡片B"]],"shallowExamples":["最空泛的卡片标题：原因"],"verdict":"两三句总评"}`;

async function judge(t: EvalTopic, nodes: EvalNode[]) {
  const user = `起点问题：「${t.topic}」\n问题类型：${t.type}\n必须覆盖要点：\n${t.mustHave.map((m, i) => `${i + 1}. ${m}`).join("\n")}\n\n画布：\n${outlineText(nodes)}`;
  const r = await chat(JUDGE_SYSTEM, user);
  const s = r.content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const j = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
  const covered = (j.checklist ?? []).filter((c: any) => c.covered).length;
  return { ...j, checklistCoverage: +(covered / t.mustHave.length).toFixed(3) };
}

/**
 * 「让 AI 带我开始」 as the Electron app runs it: a drawer conversation on the root, answered by
 * the canvas-agent tutor with the request's references (App.tsx askNote → ai-runtime canvasBundle).
 * The harness has no tools, so the tutor answers from the provided context only.
 */
async function kickoff(
  board: Board,
  t: EvalTopic,
  steps: Step[],
): Promise<Board> {
  const root = board.nodes[0].id;
  const at = () => new Date().toISOString();
  const ask = async (n: StickyNote, text: string): Promise<StickyNote> => {
    const asked: StickyNote = {
      ...n,
      messages: [
        ...n.messages,
        { id: `u${n.messages.length}`, role: "user", text, createdAt: at() },
      ],
    };
    const context = contextForNote(
      { ...board, notes: [...board.notes, asked] },
      n.id,
      undefined,
      false,
      "references",
    );
    const system = `${canvasTutorInstructions()}\n\n${renderScopedContext(canvasBundle(context))}`;
    const step: Step = {
      kind: "kickoff",
      round: -1,
      anchor: root,
      anchorTitle: t.topic,
      systemChars: system.length,
      prompt: text,
      added: 0,
    };
    steps.push(step);
    const r = await chat(
      system,
      asked.messages.map((m) => ({ role: m.role, content: m.text })),
      answerOptions(),
    );
    Object.assign(step, {
      raw: r.content,
      reasoningChars: r.reasoningChars,
      finish: r.finish,
      ms: r.ms,
      usage: r.usage,
    });
    return {
      ...asked,
      messages: [
        ...asked.messages,
        {
          id: `a${asked.messages.length}`,
          role: "assistant",
          text: r.content,
          createdAt: at(),
        },
      ],
    };
  };
  const start: StickyNote = {
    ...newNote(board, { x: 0, y: 0 }, { kind: "node", id: root }),
    title: "AI 带我开始",
  };
  const first = await ask(start, kickoffPrompt(t.topic));
  const done = await ask(first, t.kickoff!);
  return { ...board, notes: [...board.notes, done] };
}
/** Request options of a drawer answer, as the app sends them. */
const answerOptions = () => ({ temperature: modeTemperature("answer") });

async function runTopic(t: EvalTopic, out: string) {
  const started = Date.now();
  const steps: Step[] = [];
  let board = createEmptyBoard(t.topic);
  const root = board.nodes[0].id;
  // Topics with a scripted learner reply go through the kickoff conversation first; the first
  // level is then built exactly as 「铺成第一层」 does (App.tsx proposeFirstLevel).
  if (t.kickoff && process.env.EVAL_KICKOFF !== "0") {
    try {
      board = await kickoff(board, t, steps);
    } catch (e) {
      steps.push({
        kind: "kickoff",
        round: -1,
        anchor: root,
        anchorTitle: t.topic,
        systemChars: 0,
        prompt: "",
        added: 0,
        error: String((e as Error).message ?? e),
      });
    }
  }
  const kick = kickoffNote(board);
  board = await generate(
    board,
    root,
    "map",
    firstLevelPrompt(t.topic, learnerAnswers(kick), kickoffSkeleton(kick)),
    0,
    steps,
  );
  const l1 = board.nodes.filter((n) => n.parentId === root).map((n) => n.id);
  // Round 1: expand every L1 card. Sequential, like the app (one non-answer request at a time).
  for (const id of l1)
    board = await generate(
      board,
      id,
      "expand",
      expandPrompt(board.nodes.find((n) => n.id === id)!.title),
      1,
      steps,
    );
  // Round 2: dig one more level under each L1 branch (its first child), or every L2 card with EVAL_ROUND2=all.
  const l2 = l1.flatMap((id) => {
    const kids = board.nodes
      .filter((n) => n.parentId === id)
      .sort((a, b) => a.order - b.order)
      .map((n) => n.id);
    return process.env.EVAL_ROUND2 === "all" ? kids : kids.slice(0, 1);
  });
  for (const id of l2)
    board = await generate(
      board,
      id,
      "expand",
      expandPrompt(board.nodes.find((n) => n.id === id)!.title),
      2,
      steps,
    );
  const nodes = levels(board);
  const metrics = treeMetrics(nodes);
  let judgement: any;
  try {
    judgement = await judge(t, nodes);
  } catch (e) {
    judgement = { error: String((e as Error).message) };
  }
  const result = {
    topic: t,
    model: MODEL,
    steps,
    nodes,
    relations: board.relations,
    metrics,
    judgement,
    outline: outlineText(nodes),
    ms: Date.now() - started,
  };
  await writeFile(join(out, `${t.id}.json`), JSON.stringify(result, null, 2));
  console.log(
    `✓ ${t.id} (${t.type}) ${metrics.nodes} cards, ${Math.round(result.ms / 1000)}s` +
      (judgement.error
        ? ` judge error: ${judgement.error}`
        : ` fit ${judgement.goalFit} cov ${judgement.coverage}/${judgement.checklistCoverage} depth ${judgement.depth} nonred ${judgement.nonRedundancy}`),
  );
  return result;
}

const mean = (xs: number[]) =>
  xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : NaN;

async function main() {
  const pick = process.env.EVAL_TOPICS?.split(",").map((s) => s.trim());
  const topics = pick ? TOPICS.filter((t) => pick.includes(t.id)) : TOPICS;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = process.env.EVAL_OUT ?? join("evals", "results", stamp);
  await mkdir(out, { recursive: true });
  const started = Date.now();
  console.log(
    `eval:generation → ${out} (${topics.length} topics, model ${MODEL}, concurrency ${CONCURRENCY})`,
  );
  const results: any[] = [];
  const queue = [...topics];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try {
          results.push(await runTopic(t, out));
        } catch (e) {
          console.log(`✗ ${t.id}: ${(e as Error).message}`);
        }
      }
    }),
  );
  results.sort((a, b) => TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic));
  const ok = results.filter((r) => !r.judgement.error);
  const dims = ["goalFit", "coverage", "depth", "nonRedundancy"] as const;
  const row = (rs: any[]) => ({
    n: rs.length,
    ...Object.fromEntries(
      dims.map((d) => [d, mean(rs.map((r) => r.judgement[d]))]),
    ),
    checklistCoverage: mean(rs.map((r) => r.judgement.checklistCoverage)),
    cards: mean(rs.map((r) => r.metrics.nodes)),
    textDupRate: mean(rs.map((r) => r.metrics.textPairs.dupRate)),
    newInfoL2: mean(
      rs.map((r) => r.metrics.newInfoRatio[2]).filter((x) => x != null),
    ),
    newInfoL3: mean(
      rs.map((r) => r.metrics.newInfoRatio[3]).filter((x) => x != null),
    ),
    bodyL1: mean(
      rs.map((r) => r.metrics.avgBodyChars[1]).filter((x) => x != null),
    ),
    bodyL3: mean(
      rs.map((r) => r.metrics.avgBodyChars[3]).filter((x) => x != null),
    ),
  });
  const types = [...new Set(TOPICS.map((t) => t.type))];
  const summary = {
    stamp,
    model: MODEL,
    topics: results.length,
    wallMs: Date.now() - started,
    usage: totals,
    overall: row(ok),
    byType: Object.fromEntries(
      types.map((ty) => [ty, row(ok.filter((r) => r.topic.type === ty))]),
    ),
    byTopic: results.map((r) => ({
      id: r.topic.id,
      type: r.topic.type,
      ...Object.fromEntries(dims.map((d) => [d, r.judgement[d]])),
      checklistCoverage: r.judgement.checklistCoverage,
      cards: r.metrics.nodes,
      byLevel: r.metrics.byLevel,
      textDupRate: r.metrics.textPairs.dupRate,
      newInfo: r.metrics.newInfoRatio,
      avgBody: r.metrics.avgBodyChars,
      failedSteps: r.steps.filter((s: Step) => s.error).length,
      emptyExpansions: r.steps.filter(
        (s: Step) => s.kind === "expand" && !s.error && s.added === 0,
      ).length,
      verdict: r.judgement.verdict,
    })),
  };
  await writeFile(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  const fmt = (r: any) =>
    dims
      .map((d) => r[d])
      .concat([
        r.checklistCoverage,
        r.cards,
        r.textDupRate,
        r.newInfoL2 ?? r.newInfo?.[2],
        r.newInfoL3 ?? r.newInfo?.[3],
      ])
      .join(" | ");
  const head =
    "| 项 | 贴题 | 覆盖 | 深度 | 不重复 | 清单覆盖率 | 卡片数 | 近重复对比例 | L2 新信息率 | L3 新信息率 |\n|---|---|---|---|---|---|---|---|---|---|";
  const md = [
    `# Generation eval ${stamp}`,
    `模型 ${MODEL}；${results.length} 个主题；用时 ${Math.round(summary.wallMs / 1000)}s；调用 ${totals.calls} 次（失败 ${totals.failures}）；tokens 输入 ${totals.prompt}（缓存命中 ${totals.cached}）/ 输出 ${totals.completion}（其中推理 ${totals.reasoning}）。`,
    "",
    "## 总体与按类型",
    head,
    `| 全部 | ${fmt(summary.overall)} |`,
    ...types.map((ty) => `| ${ty} | ${fmt(summary.byType[ty])} |`),
    "",
    "## 按主题",
    head,
    ...summary.byTopic.map((r) => `| ${r.id} | ${fmt(r)} |`),
    "",
    "## 评审总评",
    ...summary.byTopic.map(
      (r) => `- **${r.id}**：${r.verdict ?? "（评审失败）"}`,
    ),
  ].join("\n");
  await writeFile(join(out, "summary.md"), md);
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
