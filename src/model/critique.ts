import { z } from "zod";
import type { Board, ConceptNode } from "../shared/types";
import { idSchema } from "../shared/validation";
import { renderPlan, topBlocks } from "./plan";

/**
 * Critique pass after an expansion: a short, cheap request that checks the new cards against the
 * root question, the plan and what the board already says, then keeps, revises or drops each one.
 */
const line = (n: ConceptNode) =>
  `[id:${n.id}] ${n.title}｜${n.summary ?? n.body.slice(0, 60)}${n.keyPoints?.length ? `｜要点：${n.keyPoints.join("；")}` : ""}`;

export function critiquePrompt(
  board: Board,
  anchorId: string,
  newIds: string[],
): string {
  const fresh = new Set(newIds);
  const byId = new Map(board.nodes.map((n) => [n.id, n]));
  const cards = newIds.map((id) => byId.get(id)).filter((n) => !!n);
  // What the board already says near the anchor: its path, siblings and children (not the new cards).
  const near = new Set<string>();
  for (let n = byId.get(anchorId); n; n = n.parentId ? byId.get(n.parentId) : undefined)
    near.add(n.id);
  for (const n of board.nodes)
    if (!fresh.has(n.id) && (near.has(n.parentId ?? "") || n.parentId === byId.get(anchorId)?.parentId))
      near.add(n.id);
  const existing = board.nodes
    .filter((n) => near.has(n.id) && !fresh.has(n.id) && n.parentId !== null)
    .slice(0, 24);
  const plan = renderPlan(board, anchorId);
  const goal = board.plan ? `学习目标：${board.plan.goal}（问题类型 ${board.plan.intent}）` : "";
  const uncovered =
    board.plan && plan
      ? topBlocks(board.plan).length
        ? plan.split("\n").find((l) => l.startsWith("整张画布尚未覆盖")) ?? ""
        : ""
      : "";
  return `起点问题：「${board.topic}」${goal ? `\n${goal}` : ""}${uncovered ? `\n${uncovered}` : ""}
当前卡片：${byId.get(anchorId) ? line(byId.get(anchorId)!) : "起点"}
画布上已有（不要和它们重复）：
${existing.map((n) => `- ${line(n)}`).join("\n") || "（无）"}
刚生成、待审的新卡片：
${cards.map((n) => `- ${line(n)}`).join("\n")}
逐张审：①是否直接服务起点问题和学习目标（不是泛泛的领域介绍，learning-path 要讲怎么学而不是学科知识本身）；②summary 和 keyPoints 是否与已有卡片或其他新卡片重复；③是否有新的事实、机制、例子或判断标准。
对每张新卡片给出 action：keep（合格）、revise（改写偏题或重复的部分：给出新的 title/summary/keyPoints，keyPoints 只保留新信息，2–4 条）、drop（偏题、重复或没有新信息）。不要新增卡片。
只输出 JSON：{"cards":[{"id":"新卡片id","action":"keep|revise|drop","title":"可选","summary":"可选","keyPoints":["可选"],"reason":"不超过 20 字"}]}`;
}

const critiqueSchema = z
  .object({
    cards: z
      .array(
        z
          .object({
            id: idSchema,
            action: z.enum(["keep", "revise", "drop"]),
            title: z.string().min(1).max(40).optional().catch(undefined),
            summary: z.string().min(1).max(160).optional().catch(undefined),
            keyPoints: z
              .array(z.string().min(1).max(160))
              .min(1)
              .max(4)
              .optional()
              .catch(undefined),
            reason: z.string().max(120).optional().catch(undefined),
          })
          .strip(),
      )
      .max(12),
  })
  .strip();

const safe = (s: string) => !/<\/?[a-z][^>]*>/i.test(s) && !/```/.test(s);

export interface CritiqueResult {
  board: Board;
  dropped: string[];
  revised: string[];
}

/**
 * Apply a critique reply to the listed new cards only. A dropped card goes with its new children;
 * cards the learner already edited, and anything malformed, are left alone.
 */
export function applyCritique(
  text: string,
  board: Board,
  newIds: string[],
  generated?: Board,
): CritiqueResult {
  const none = { board, dropped: [], revised: [] };
  let raw = text.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(raw);
  if (fenced) raw = fenced[1].trim();
  let parsed: z.infer<typeof critiqueSchema>;
  try {
    const r = critiqueSchema.safeParse(
      JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)),
    );
    if (!r.success) return none;
    parsed = r.data;
  } catch {
    return none;
  }
  const allowed = new Set(newIds);
  const original = new Map((generated ?? board).nodes.map((n) => [n.id, n]));
  const untouched = (n: ConceptNode) => {
    const o = original.get(n.id);
    return !o || (o.title === n.title && o.body === n.body);
  };
  const drop = new Set<string>();
  const patch = new Map<string, Partial<ConceptNode>>();
  for (const c of parsed.cards) {
    const n = board.nodes.find((x) => x.id === c.id);
    if (!n || !allowed.has(c.id) || !untouched(n)) continue;
    if (c.action === "drop") drop.add(c.id);
    if (c.action === "revise") {
      const p: Partial<ConceptNode> = {};
      if (c.title && safe(c.title)) p.title = c.title;
      if (c.summary && safe(c.summary)) p.summary = c.summary;
      if (c.keyPoints?.every(safe)) p.keyPoints = c.keyPoints;
      if (Object.keys(p).length) patch.set(c.id, p);
    }
  }
  // Never drop every new card: a critique that rejects the whole batch keeps the best-ranked first one.
  if (drop.size && newIds.every((id) => drop.has(id))) drop.delete(newIds[0]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of board.nodes)
      if (n.parentId && drop.has(n.parentId) && allowed.has(n.id) && !drop.has(n.id)) {
        drop.add(n.id);
        grew = true;
      }
  }
  if (!drop.size && !patch.size) return none;
  const kept = board.nodes.filter((n) => !drop.has(n.id));
  // Keep sibling order contiguous after drops.
  const order = new Map<string | null, number>();
  const nodes = [...kept]
    .sort((a, b) => a.order - b.order)
    .map((n) => {
      const i = order.get(n.parentId) ?? 0;
      order.set(n.parentId, i + 1);
      return { ...n, ...patch.get(n.id), order: i };
    });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return {
    board: {
      ...board,
      nodes: kept.map((n) => byId.get(n.id)!),
      relations: board.relations.filter(
        (r) => !drop.has(r.source) && !drop.has(r.target),
      ),
    },
    dropped: [...drop],
    revised: [...patch.keys()],
  };
}
