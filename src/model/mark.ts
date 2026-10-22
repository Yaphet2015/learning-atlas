/** Check marking: one short call per answer, sending only the question, key points and the answer. */
import type { ConceptNode } from "../shared/types";

export interface Mark {
  pass: boolean;
  missing: string;
}
export const UNSURE = "不知道";

export function markPrompt(q: string, keyPoints: string[], answer: string): string {
  return `题目：${q}
答对必须说到的要点：${JSON.stringify(keyPoints)}
学习者的回答：${JSON.stringify(answer.slice(0, 600))}
判断回答是否说中了要点（意思对即可，不要求原词；只复述题目或说“不知道”算没说中）。只输出 JSON：{"pass":true,"missing":"没说中的要点，≤20 字，答对时留空"}`;
}
export function parseMark(text: string): Mark | null {
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (typeof j.pass !== "boolean") return null;
    return { pass: j.pass, missing: String(j.missing ?? "").slice(0, 40) };
  } catch {
    return null;
  }
}
/** Key points for marking 讲: the card's new idea and claims; for 测: the check's own key points. */
export function explainPoints(n: ConceptNode): string[] {
  const g = n.meta?.gate;
  const pts = [g?.newIdea, ...(g?.claims ?? [])].filter((s): s is string => !!s?.trim());
  return pts.length ? pts.slice(0, 3) : [n.title];
}
export function testPoints(n: ConceptNode): string[] {
  const pts = n.meta?.check?.keyPoints ?? [];
  return pts.length ? pts : explainPoints(n);
}
/**
 * A choice answer is marked locally when the right option is known: a wrong pick fails with no call.
 * Returns null when the LLM must mark (free text, or a right pick whose reason needs checking).
 */
export function localMark(n: ConceptNode, choice: number | null, reason: string): Mark | null {
  const options = n.check?.options;
  const answer = n.meta?.check?.answer;
  if (choice === -1) return { pass: false, missing: "选了不知道" };
  if (!options?.length || choice === null || answer === undefined) return null;
  if (choice !== answer) return { pass: false, missing: "选项不对" };
  return reason.trim() ? null : { pass: false, missing: "还差一句理由" };
}
