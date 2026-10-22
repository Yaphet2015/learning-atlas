/** The stuck exits (§4.4 / 05-stuck): two wrong 测 answers offer 往下拆 / 换个类比 / 稍后. */
import type { Board, ConceptNode } from "../shared/types";
import { routeOf } from "./route";

export const STUCK_AFTER = 2;
export const isStuck = (n: ConceptNode) => (n.fails ?? 0) >= STUCK_AFTER && n.status !== "explained";

/** Appended to the expand prompt: exactly two smaller, more basic sub-questions under the stuck card. */
export function splitNote(n: ConceptNode): string {
  const missed = n.meta?.missed ? `（漏掉的要点：${n.meta.missed}）` : "";
  return `
学习者两次没答上这张卡的检查题${missed}。只拆出 2 个更小、更基础的子问题，都以 anchor 为 parent，帮他跨过这一步；每张仍要有父卡里没有的新知识点和自己的检查题。`;
}

/** 换个类比: one short call; the analogy is shown in 学 and the learner goes round again. */
export function analogyPrompt(n: ConceptNode): string {
  const missed = n.meta?.missed ? `学习者卡在：${n.meta.missed}。` : "";
  return `卡片「${n.title}」：${(n.body ?? "").slice(0, 400)}
${missed}学习者两次没答上检查题。换一个日常生活里的类比，把这张卡的核心讲清楚：2–3 句自然的话，先说类比，再点回卡片里的机制；不要列表，不要重复原文。只输出 JSON：{"analogy":"…"}`;
}
export function parseAnalogy(reply: string): string | null {
  try {
    const j = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1));
    const a = typeof j.analogy === "string" ? j.analogy.trim() : "";
    return a ? a.slice(0, 600) : null;
  } catch {
    return null;
  }
}

/** 稍后: back to 探索中, put off to the end of the route; the next step moves on. */
export function putOff(board: Board, id: string): Board {
  const route = routeOf(board).map((n) => n.id);
  const nextRoute = route.includes(id) ? [...route.filter((r) => r !== id), id] : route;
  return {
    ...board,
    route: board.route ? nextRoute : board.route,
    nodes: board.nodes.map((n) =>
      n.id === id ? { ...n, status: "exploring", fails: 0, beat: "test", meta: { ...n.meta, later: true } } : n,
    ),
  };
}

/**
 * After a split child is sealed: when every split child of the parent is sealed, the parent goes
 * back to 测 with a clean slate (fails 0), so the stuck exits do not show again.
 */
export function afterChildSealed(board: Board, childId: string): Board {
  const child = board.nodes.find((n) => n.id === childId);
  if (!child?.meta?.split || !child.parentId) return board;
  const siblings = board.nodes.filter((n) => n.parentId === child.parentId && n.meta?.split);
  if (!siblings.every((n) => n.status === "explained")) return board;
  return {
    ...board,
    nodes: board.nodes.map((n) => (n.id === child.parentId ? { ...n, fails: 0, beat: "test" } : n)),
  };
}
