import type { Board, CardHints, ConceptNode } from "../shared/types";
import { fnv1a } from "../shared/hash";
import { ANGLE_LABEL, DIG_ANGLES, isAngle, type DigAngle } from "./angles";

/** Where a ghost hint sits: under the card (child), to its right (sibling / another root), above (a broader root). */
export type HintSide = "below" | "right" | "above";
export const HINT_MAX = 18;
/** How long a card is hovered or selected before its hints are asked for. */
export const HINT_DELAY = 600;

const boardSignatures = new WeakMap<Board, string>();

/** Immutable board snapshots share one content hash across all their card hints. */
export function hintSignature(board: Board, id: string): string {
  if (!board.nodes.some((n) => n.id === id)) return "";
  let signature = boardSignatures.get(board);
  if (!signature) {
    const contents = JSON.stringify([
      board.topic,
      board.nodes.map((n) => [
        n.id,
        n.parentId,
        n.order,
        n.title,
        n.body,
        n.visual,
      ]),
      board.relations,
    ]);
    signature = `review-v1:${fnv1a(contents).toString(16)}`;
    boardSignatures.set(board, signature);
  }
  return `${id}|${signature}`;
}

/** The card's cached hints if they still fit the card, else undefined (time to ask). */
export function cachedHints(board: Board, id: string): CardHints | undefined {
  const n = board.nodes.find((x) => x.id === id);
  return n?.hints && n.hints.sig === hintSignature(board, id)
    ? n.hints
    : undefined;
}

/** Which directions a card can grow in: roots also grow up and sideways. */
export function hintSides(n: Pick<ConceptNode, "parentId">): HintSide[] {
  return n.parentId === null ? ["below", "right", "above"] : ["below", "right"];
}

export function hintPrompt(board: Board, id: string): string {
  const n = board.nodes.find((x) => x.id === id)!;
  const root = n.parentId === null;
  return (
    root
    ? `为起点卡片「${n.title}」各给一个下一步提示：below 是它下面最值得先拆的一个子问题；right 是可以并列放在它旁边的另一个起点问题；above 是能把它包含进去的一个更大的问题。`
    : `为卡片「${n.title}」各给一个下一步提示：below 是它下面最值得先拆的一个子问题；right 是与它并列、放在它右边的一个兄弟概念或问题。`) + ANGLE_ASK;
}

const ANGLE_ASK = `
每个提示都标出它往哪个角度挖：angles 里给每个方向写一个角度，取值只能是 ${DIG_ANGLES.map((a) => `${a}（${ANGLE_LABEL[a]}）`).join("、")}。再在 more 里给 below 方向补 1–2 个换角度的子问题（角度互不相同，也不同于 angles.below）。每条提示不超过 ${HINT_MAX} 个字。
格式：{"below":"…","right":"…","angles":{"below":"why","right":"compare"},"more":[{"angle":"example","text":"…"}]}`;

const clip = (s: string) =>
  [...s].length <= HINT_MAX ? s : `${[...s].slice(0, HINT_MAX - 1).join("")}…`;

/**
 * Read the model's JSON ({"below":…,"right":…,"above":…}). Tolerates a code fence or text
 * around it; drops empty, overlong-after-trim, or already-on-the-board titles. Returns null
 * when nothing usable came back.
 */
export function parseHints(
  text: string,
  board: Board,
  id: string,
): CardHints | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const n = board.nodes.find((x) => x.id === id);
  if (!n) return null;
  const taken = new Set(board.nodes.map((x) => x.title.trim()));
  const out: CardHints = { sig: hintSignature(board, id) };
  for (const side of hintSides(n)) {
    const v = (raw as Record<string, unknown>)[side];
    if (typeof v !== "string") continue;
    const t = v
      .replace(/\s+/g, " ")
      .replace(/^[“"「]|[”"」]$/g, "")
      .trim();
    if (!t || taken.has(t)) continue;
    out[side] = clip(t);
  }
  const r = raw as Record<string, unknown>;
  const angles = r.angles as Record<string, unknown> | undefined;
  if (angles && typeof angles === "object") {
    for (const side of hintSides(n)) {
      const a = angles[side];
      if (out[side] && isAngle(a)) (out.angles ??= {})[side] = a;
    }
  }
  if (out.below && Array.isArray(r.more)) {
    const used = new Set<DigAngle | string>([out.angles?.below ?? ""]);
    const texts = new Set([out.below, out.right, out.above]);
    for (const m of r.more as unknown[]) {
      if (!m || typeof m !== "object") continue;
      const { angle, text } = m as Record<string, unknown>;
      if (!isAngle(angle) || used.has(angle) || typeof text !== "string") continue;
      const t = text.replace(/\s+/g, " ").replace(/^[“"「]|[”"」]$/g, "").trim();
      if (!t || taken.has(t) || texts.has(clip(t))) continue;
      used.add(angle);
      texts.add(clip(t));
      (out.more ??= []).push({ angle, text: clip(t) });
      if (out.more.length >= 2) break;
    }
  }
  return out.below || out.right || out.above ? out : null;
}

/** Store hints on the card (not an undoable edit; they are a cache). */
export function withHints(board: Board, id: string, hints: CardHints): Board {
  return {
    ...board,
    nodes: board.nodes.map((n) => (n.id === id ? { ...n, hints } : n)),
  };
}
