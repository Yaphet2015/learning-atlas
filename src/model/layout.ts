import type { ConceptNode } from "../shared/types";

/** Top of the root row; each next row starts below the tallest card above it. */
export const ROW0 = 100;
export const ROW_GAP = 96;
export const CARD_MIN = 240;
export const CARD_MAX = 320;
export const ROOT_W = 500;
export const GAP_IN = 28;
export const GAP_GROUP = 56;
/** Assumed heights before the DOM has measured a card. */
export const CARD_H = 130;
export const ROOT_H = 150;

export type TreeNode = Pick<ConceptNode, "id" | "parentId" | "order" | "kind">;
export interface Placement {
  x: number;
  y: number;
  w: number;
  level: number;
}
export interface TreeLayout {
  rootId: string | null;
  positions: Map<string, Placement>;
  children: Map<string, string[]>;
  /** rows[l] = top of level l, in flow coordinates. */
  rows: number[];
}
export interface LayoutOptions<T> {
  /** Measured card heights; unknown cards use CARD_H / ROOT_H. */
  heights?: Map<string, number>;
  /** Card width for a non-root node; defaults to CARD_MIN. */
  widthOf?: (node: T) => number;
}

let ctx: CanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();
/**
 * clamp(240, title width at 700 21px WenKai + 32 padding + 30 for the §no, 320).
 * Measured on an offscreen canvas once the font has loaded (main.tsx waits for
 * it); without a canvas (tests) a CJK ≈ 21px / Latin ≈ 11px estimate is used.
 */
export function cardWidth(title: string): number {
  const hit = widthCache.get(title);
  if (hit) return hit;
  if (ctx === undefined)
    ctx =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
  let text: number;
  if (ctx) {
    ctx.font = '700 21px "LXGW WenKai"';
    text = ctx.measureText(title).width;
  } else {
    text = [...title].reduce(
      (sum, ch) => sum + (/[\u0000-\u024f]/.test(ch) ? 11 : 21),
      0,
    );
  }
  const w = Math.min(CARD_MAX, Math.max(CARD_MIN, Math.ceil(text + 32 + 30)));
  if (widthCache.size > 2_000) widthCache.clear();
  widthCache.set(title, w);
  return w;
}

export function childrenOf<T extends TreeNode>(nodes: T[]) {
  const children = new Map<string, string[]>();
  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  for (const n of nodes) children.set(n.id, []);
  for (const n of sorted)
    if (n.parentId && children.has(n.parentId))
      children.get(n.parentId)!.push(n.id);
  return children;
}

/**
 * Tidy tree (simplified Reingold–Tilford). Width of a subtree: max(own card,
 * Σ children + gaps). A parent is centred over its subtree; the whole tree is
 * centred on x = 0. Neighbouring siblings sit GAP_IN apart, or GAP_GROUP when
 * either one fans out wider than its own card. Row tops follow the tallest
 * card of the row above, so a tall card never crosses the next level's rule.
 * Pure and O(n).
 */
export function layoutTree<T extends TreeNode>(
  nodes: T[],
  options: LayoutOptions<T> = {},
): TreeLayout {
  const positions = new Map<string, Placement>();
  const children = childrenOf(nodes);
  const root = nodes.find((n) => n.parentId === null);
  if (!root) return { rootId: null, positions, children, rows: [] };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const own = (id: string, level: number) => {
    const n = byId.get(id)!;
    if (level === 0 || n.kind === "scene") return ROOT_W;
    return options.widthOf?.(n) ?? CARD_MIN;
  };
  const widths = new Map<string, number>();
  const levels = new Map<string, number>();
  // Iterative pre-order so deep trees cannot overflow the stack.
  const order: string[] = [];
  const stack: [string, number][] = [[root.id, 0]];
  while (stack.length) {
    const [id, level] = stack.pop()!;
    if (levels.has(id)) continue; // defensive: ignore cycles
    levels.set(id, level);
    order.push(id);
    for (const c of children.get(id) ?? []) stack.push([c, level + 1]);
  }
  const fans = (id: string) => widths.get(id)! > own(id, levels.get(id)!);
  const span = (kids: string[]) =>
    kids.reduce(
      (a, c, i) =>
        a +
        widths.get(c)! +
        (i ? (fans(c) || fans(kids[i - 1]) ? GAP_GROUP : GAP_IN) : 0),
      0,
    );
  for (const id of [...order].reverse()) {
    const kids = children.get(id)!.filter((c) => levels.has(c));
    children.set(id, kids);
    widths.set(id, Math.max(own(id, levels.get(id)!), span(kids)));
  }
  // Row tops from measured heights.
  const depth = Math.max(...levels.values()) + 1;
  const tallest = new Array<number>(depth).fill(0);
  for (const [id, level] of levels)
    tallest[level] = Math.max(
      tallest[level],
      options.heights?.get(id) ?? (level === 0 ? ROOT_H : CARD_H),
    );
  const rows = [ROW0];
  for (let l = 1; l < depth; l++)
    rows.push(rows[l - 1] + tallest[l - 1] + ROW_GAP);
  // Iterative placement as well.
  const queue: [string, number][] = [[root.id, -widths.get(root.id)! / 2]];
  while (queue.length) {
    const [id, left] = queue.pop()!;
    const level = levels.get(id)!;
    const w = own(id, level);
    const total = widths.get(id)!;
    positions.set(id, { x: left + (total - w) / 2, y: rows[level], w, level });
    const kids = children.get(id)!;
    let cursor = left + (total - span(kids)) / 2;
    kids.forEach((c, i) => {
      if (i) cursor += fans(c) || fans(kids[i - 1]) ? GAP_GROUP : GAP_IN;
      queue.push([c, cursor]);
      cursor += widths.get(c)!;
    });
  }
  return { rootId: root.id, positions, children, rows };
}

export function isDescendant(
  children: Map<string, string[]>,
  ancestor: string,
  id: string,
): boolean {
  const stack = [...(children.get(ancestor) ?? [])];
  while (stack.length) {
    const c = stack.pop()!;
    if (c === id) return true;
    stack.push(...(children.get(c) ?? []));
  }
  return false;
}

export type Slot =
  | { kind: "reorder"; parentId: string; order: number }
  | { kind: "reparent"; parentId: string; order: number };

/**
 * Where would a dragged card snap? `point` is the dragged card's top-centre in
 * flow coordinates. Dropping within 40px below another card re-parents (never
 * under its own subtree); staying in the same row reorders among siblings.
 * Anything else returns null and the card springs back.
 */
export function insertSlot<T extends TreeNode>(
  dragId: string,
  point: { x: number; y: number },
  nodes: T[],
  layout: TreeLayout,
  heights: Map<string, number> = new Map(),
): Slot | null {
  const drag = nodes.find((n) => n.id === dragId);
  const at = layout.positions.get(dragId);
  if (!drag || !drag.parentId || !at) return null;
  for (const n of nodes) {
    if (n.id === dragId || isDescendant(layout.children, dragId, n.id))
      continue;
    const p = layout.positions.get(n.id);
    if (!p) continue;
    const bottom = p.y + (heights.get(n.id) ?? CARD_H);
    if (
      point.x >= p.x &&
      point.x <= p.x + p.w &&
      point.y >= bottom &&
      point.y <= bottom + 40
    ) {
      const kids = (layout.children.get(n.id) ?? []).filter(
        (c) => c !== dragId,
      );
      return n.id === drag.parentId
        ? null
        : { kind: "reparent", parentId: n.id, order: kids.length };
    }
  }
  if (Math.abs(point.y - at.y) <= 60) {
    const siblings = (layout.children.get(drag.parentId) ?? []).filter(
      (c) => c !== dragId,
    );
    const order = siblings.filter((c) => {
      const p = layout.positions.get(c)!;
      return p.x + p.w / 2 < point.x;
    }).length;
    return { kind: "reorder", parentId: drag.parentId, order };
  }
  return null;
}
