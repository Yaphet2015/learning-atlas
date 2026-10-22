/**
 * Bisection 摸底 (§4.6): a 4–6 level depth ladder for the topic, probed from the middle.
 * Correct → go deeper; partial / wrong / 不知道 → go shallower. About 3 questions converge.
 * Pure functions; App.tsx only stores ProbeState on the board and asks the AI.
 */
import type { Board, ConceptNode, LadderLevel, ProbeAnswer, ProbeState, ProbeVerdict } from "../shared/types";
import { routeOf } from "./route";

export const MAX_PROBES = 4;

/** The prompt that drafts the ladder (§4.6 Prompt). */
export function ladderPrompt(topic: string): string {
  return `为学习问题「${topic.slice(0, 300)}」拟一条 6 级理解深度阶梯 L0–L5：L0 是日常直觉，L5 是专家才会注意的细节。主题太窄时可以只给 4–5 级。
每级给：desc（≤20 字）、keyPoints（判定答对必须提到的 1–2 个要点）、probe（一道探测题）。
探测题要求：考理解而非记忆；优先用具体情境；选择题给 3 个选项，错误选项必须是常见误解；不要出是非题，不要出“你了解 X 吗？”这种自评题；不要在题干里泄露答案。
不要编造具体费率、条款编号或金额；需要数字时写明“示例”。
只输出 JSON：{"ladder":[{"level":0,"desc":"…","keyPoints":["…"],"probe":{"type":"explain","q":"一句话：…"}},{"level":2,"desc":"…","keyPoints":["…"],"probe":{"type":"choice","q":"…","options":["…","…","…"],"answer":1}}]}`;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Parse the ladder reply; null unless it has 4–6 usable levels. Levels are renumbered 0..n-1. */
export function parseLadder(reply: string): LadderLevel[] | null {
  let j: any;
  try {
    j = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
  const raw: any[] = Array.isArray(j?.ladder) ? j.ladder : [];
  const levels = raw
    .map((l, i) => {
      const p = l?.probe ?? {};
      const q = text(p.q, 200);
      const desc = text(l?.desc, 40);
      if (!q || !desc) return null;
      const options: string[] = Array.isArray(p.options) ? p.options.map((o: unknown) => text(o, 80)).filter(Boolean).slice(0, 4) : [];
      const choice = options.length >= 2 && Number.isInteger(p.answer) && p.answer >= 0 && p.answer < options.length;
      const keyPoints: string[] = Array.isArray(l?.keyPoints) ? l.keyPoints.map((k: unknown) => text(k, 60)).filter(Boolean).slice(0, 3) : [];
      return {
        at: Number.isFinite(l?.level) ? Number(l.level) : i,
        level: {
          level: 0,
          desc,
          keyPoints: keyPoints.length ? keyPoints : [desc],
          probe: choice ? { type: "choice" as const, q, options, answer: p.answer as number } : { type: "explain" as const, q },
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.at - b.at)
    .slice(0, 6)
    .map((x, i) => ({ ...x.level, level: i }));
  return levels.length >= 4 ? levels : null;
}

/** Grading one probe answer: one short call with the level's key points (§4.6 判分). */
export function gradePrompt(l: LadderLevel, answer: string): string {
  return `探测题：${l.probe.q}
这一级（${l.desc}）答对必须说到的要点：${JSON.stringify(l.keyPoints)}
学习者的回答：${JSON.stringify(answer.slice(0, 600))}
判定：说中全部要点 = correct；只说中一部分或选对但理由不对 = partial；没说中 = wrong；说不知道 = unsure。只输出 JSON：{"verdict":"correct","missing":"漏掉的要点，≤20 字"}`;
}
export function parseGrade(reply: string): { verdict: ProbeVerdict; missing: string } | null {
  try {
    const j = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1));
    if (!["correct", "partial", "wrong", "unsure"].includes(j.verdict)) return null;
    return { verdict: j.verdict, missing: String(j.missing ?? "").slice(0, 40) };
  } catch {
    return null;
  }
}
/**
 * Grade without a call when possible: 不知道 is unsure, a wrong option is wrong,
 * a right option with no reason is correct. Null: the AI must grade (free text, or a reason).
 */
export function localGrade(l: LadderLevel, choice: number | null, reason: string): ProbeVerdict | null {
  if (choice === -1) return "unsure";
  if (l.probe.type !== "choice" || choice === null) return null;
  if (choice !== l.probe.answer) return "wrong";
  return reason.trim() ? null : "correct";
}

export function newProbe(ladder: LadderLevel[]): ProbeState {
  return { status: "asking", ladder, answers: [] };
}

/** Latest verdict per level (a recheck overrides the first answer). */
function verdicts(answers: ProbeAnswer[]): Map<number, ProbeVerdict> {
  const m = new Map<number, ProbeVerdict>();
  for (const a of answers) m.set(a.level, a.verdict);
  return m;
}
/** hi = the lowest level not answered correctly; lo = the highest correct level below it. */
export function bounds(state: ProbeState): { lo: number; hi: number } {
  const v = verdicts(state.answers);
  let hi = state.ladder.length;
  for (const [level, verdict] of v) if (verdict !== "correct") hi = Math.min(hi, level);
  let lo = -1;
  for (const [level, verdict] of v) if (verdict === "correct" && level < hi) lo = Math.max(lo, level);
  return { lo, hi };
}

export type ProbeStep =
  | { done: false; level: number; recheck: boolean }
  | { done: true; frontier: number };

/** The bisection step (§4.6 算法), with the monotonicity recheck and the stop rules. */
export function nextProbe(state: ProbeState): ProbeStep {
  if (state.status === "skipped") return { done: true, frontier: 0 };
  const { lo, hi } = bounds(state);
  const asked = state.answers.length;
  const last2 = state.answers.slice(-2);
  const v = verdicts(state.answers);
  // Not monotonic: a deeper level was answered correctly above a failed one. One recheck of the failed level.
  const inconsistent = [...v].some(([level, verdict]) => verdict === "correct" && level > hi);
  const rechecked = state.answers.some((a) => a.recheck);
  if (inconsistent && !rechecked && asked < MAX_PROBES && hi < state.ladder.length)
    return { done: false, level: hi, recheck: true };
  if (
    hi - lo <= 1 ||
    asked >= MAX_PROBES ||
    (last2.length === 2 && last2.every((a) => a.verdict === "unsure"))
  )
    return { done: true, frontier: lo + 1 };
  return { done: false, level: Math.ceil((lo + hi) / 2), recheck: false };
}

/** Record one answer; converge when the step says so. */
export function answerProbe(state: ProbeState, answer: ProbeAnswer): ProbeState {
  const next: ProbeState = { ...state, answers: [...state.answers, answer] };
  const step = nextProbe(next);
  return step.done ? { ...next, status: "done", frontier: step.frontier } : next;
}
export function skipProbe(state: ProbeState | undefined): ProbeState {
  return { status: "skipped", ladder: state?.ladder ?? [], answers: state?.answers ?? [], frontier: 0 };
}

export type LevelState = "asking" | "correct" | "partial" | "wrong" | "unsure" | "inferred" | "unasked";
/** What the ladder row shows: 正在问 / ✓ / ✗ / 推断 ✓ / 先不问. */
export function levelState(state: ProbeState, level: number): LevelState {
  const step = nextProbe(state);
  if (state.status === "asking" && !step.done && step.level === level) return "asking";
  const v = verdicts(state.answers).get(level);
  if (v) return v;
  const { lo } = bounds(state);
  return level <= lo ? "inferred" : "unasked";
}

/** §4.6 文案 for the converged result. */
export function probeResult(state: ProbeState, stations: number): string {
  const f = state.frontier ?? 0;
  const n = state.ladder.length;
  if (state.status === "skipped") return "跳过也没关系，我会从最基础的开始排。";
  if (f <= 0) return "我们从最直观的地方开始。";
  if (f >= n) return "你已经很熟了。路线只留最深的专家细节，然后直接合起来讲。";
  return `你已经懂「${state.ladder[f - 1].desc}」了。所以我们从「${state.ladder[f].desc}」开始${stations ? `，共 ${stations} 站` : ""}。`;
}

/** The learner profile the plan and first level are written for. */
export function probeLearner(state: ProbeState): string {
  const f = state.frontier ?? 0;
  if (state.status === "skipped" || !state.ladder.length) return "学习者跳过了摸底，按初学者处理，从最基础的开始。";
  const known = f > 0 ? `已经懂到 L${f - 1}「${state.ladder[f - 1].desc}」` : "还没有确认会的层级";
  const start = f < state.ladder.length ? `，路线从 L${f}「${state.ladder[f].desc}」开始` : "，只需要专家细节";
  return `二分摸底结果：学习者${known}${start}。`;
}

/**
 * The ladder level of each station: the card's own level when the map gave one, otherwise
 * spread over the ladder by route position (the route runs shallow → deep).
 */
export function stationLevels(board: Board): Map<string, number> {
  const route = routeOf(board).map((c) => c.id);
  const n = board.probe?.ladder.length ?? 6;
  const out = new Map<string, number>();
  route.forEach((id, i) => {
    const card = board.nodes.find((c) => c.id === id);
    const own = card?.meta?.level;
    out.set(id, own !== undefined ? Math.min(n - 1, Math.max(0, own)) : route.length <= 1 ? 0 : Math.round((i * (n - 1)) / (route.length - 1)));
  });
  return out;
}

/**
 * Light A seals below the frontier (§4.6 路线映射). Re-probing recomputes them: earlier probe seals
 * are cleared first; seals earned by 测 are never touched.
 */
export function applyFrontier(board: Board): Board {
  const probe = board.probe;
  if (!probe || probe.status === "asking") return board;
  const f = probe.frontier ?? 0;
  const levels = stationLevels(board);
  const nodes = board.nodes.map((n): ConceptNode => {
    if (n.seal === "test") return n;
    const level = levels.get(n.id);
    const below = level !== undefined && level < f;
    if (below) return { ...n, seal: "probe", status: "explained", beat: "done" };
    if (n.seal === "probe") {
      const { seal: _s, ...rest } = n;
      return { ...rest, status: "exploring", beat: "test" };
    }
    return n;
  });
  return { ...board, nodes };
}

/** A light-sealed card failed its recheck: drop the seal and move it right after the current stop. */
export function failRecheck(board: Board, id: string, currentId?: string): Board {
  const nodes = board.nodes.map((n): ConceptNode => {
    if (n.id !== id) return n;
    const { seal: _s, ...rest } = n;
    return { ...rest, status: "exploring", beat: "learn", fails: 0 };
  });
  const route = routeOf(board).map((c) => c.id).filter((r) => r !== id);
  const at = currentId ? route.indexOf(currentId) : -1;
  route.splice(at + 1, 0, id);
  return { ...board, nodes, route };
}
