/**
 * 合起来讲 (06-wrap): with every stop sealed, the learner answers the root question in about five
 * sentences without the cards. One short call says which stations the answer reached; those light up.
 */
import type { Board } from "../shared/types";
import { routeOf } from "./route";

export function wrapPrompt(board: Board, text: string): string {
  const stations = routeOf(board).map((n, i) => ({
    id: `s${i + 1}`,
    card: n.title,
    point: n.meta?.gate?.newIdea ?? n.title,
  }));
  return `起点问题：${board.topic.slice(0, 300)}
路线上的站：${JSON.stringify(stations)}
学习者不看卡片，合起来讲：${JSON.stringify(text.slice(0, 1500))}
找出回答里讲到了（意思对即可）的站；超过一半的站讲到了，并且确实在回答起点问题，算通过。只输出 JSON：{"lit":["s1"],"pass":true,"missing":"最该补上的一点，≤20 字，通过时留空"}`;
}
export function parseWrap(board: Board, reply: string): { lit: string[]; pass: boolean; missing: string } | null {
  const route = routeOf(board);
  try {
    const j = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1));
    if (typeof j.pass !== "boolean" || !Array.isArray(j.lit)) return null;
    const lit = j.lit
      .map((s: unknown) => (typeof s === "string" ? route[Number(s.replace(/^s/, "")) - 1]?.id : undefined))
      .filter((id: string | undefined): id is string => !!id);
    return { lit: [...new Set<string>(lit)], pass: j.pass, missing: String(j.missing ?? "").slice(0, 40) };
  } catch {
    return null;
  }
}
/** Sentences in the answer (the mockup asks for about five). */
export const sentences = (text: string) => text.split(/[。！？!?\n]+/).filter((s) => s.trim().length >= 4).length;
