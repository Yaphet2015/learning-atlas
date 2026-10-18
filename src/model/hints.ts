import type { Board, CardHints, ConceptNode } from "../shared/types";

/** Where a ghost hint sits: under the card (child), to its right (sibling / another root), above (a broader root). */
export type HintSide = "below" | "right" | "above";
export const HINT_MAX = 18;
/** How long a card is hovered or selected before its hints are asked for. */
export const HINT_DELAY = 600;

/**
 * What a card's hints depend on. A cached hint is reused while this is unchanged: its own
 * title, its parent's title, and how many children and siblings it has.
 */
export function hintSignature(board: Board, id: string): string {
  const n = board.nodes.find((x) => x.id === id);
  if (!n) return "";
  const parent = n.parentId
    ? board.nodes.find((x) => x.id === n.parentId)
    : undefined;
  const kids = board.nodes.filter((x) => x.parentId === id).length;
  const sibs = board.nodes.filter((x) => x.parentId === n.parentId).length;
  return [n.title, parent?.title ?? "", kids, sibs].join("|");
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
  return root
    ? `为起点卡片「${n.title}」各给一个下一步提示：below 是它下面最值得先拆的一个子问题；right 是可以并列放在它旁边的另一个起点问题；above 是能把它包含进去的一个更大的问题。`
    : `为卡片「${n.title}」各给一个下一步提示：below 是它下面最值得先拆的一个子问题；right 是与它并列、放在它右边的一个兄弟概念或问题。`;
}

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
  return out.below || out.right || out.above ? out : null;
}

/** Store hints on the card (not an undoable edit; they are a cache). */
export function withHints(board: Board, id: string, hints: CardHints): Board {
  return {
    ...board,
    nodes: board.nodes.map((n) => (n.id === id ? { ...n, hints } : n)),
  };
}
