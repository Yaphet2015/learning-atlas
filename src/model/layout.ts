import type { ConceptNode } from "../shared/types";

/** Fixed notebook rows: L0 100, L1 350, L2 610, then +260 per level. */
export const ROW_Y = [100, 350, 610];
export const rowY = (level: number) =>
  level < ROW_Y.length
    ? ROW_Y[level]
    : ROW_Y[ROW_Y.length - 1] + 260 * (level - ROW_Y.length + 1);
export const CARD_W = 176;
export const ROOT_W = 470;
export const GAP_IN = 22;
export const GAP_GROUP = 46;
/** Assumed card height when the DOM height is not known yet. */
export const CARD_H = 120;

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
 * Tidy tree with fixed row heights (simplified Reingold–Tilford).
 * Width of a subtree: max(own card, Σ children + gaps). A parent is centred
 * over its subtree; the whole tree is centred on x = 0. Pure and O(n).
 */
export function layoutTree<T extends TreeNode>(nodes: T[]): TreeLayout {
  const positions = new Map<string, Placement>();
  const children = childrenOf(nodes);
  const root = nodes.find((n) => n.parentId === null);
  if (!root) return { rootId: null, positions, children };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const own = (id: string, level: number) =>
    level === 0 || byId.get(id)?.kind === "scene" ? ROOT_W : CARD_W;
  const widths = new Map<string, number>();
  const levels = new Map<string, number>();
  const gap = (level: number) => (level >= 1 ? GAP_IN : GAP_GROUP);
  // Iterative post-order so deep trees cannot overflow the stack.
  const order: string[] = [];
  const stack: [string, number][] = [[root.id, 0]];
  while (stack.length) {
    const [id, level] = stack.pop()!;
    if (levels.has(id)) continue; // defensive: ignore cycles
    levels.set(id, level);
    order.push(id);
    for (const c of children.get(id) ?? []) stack.push([c, level + 1]);
  }
  for (const id of [...order].reverse()) {
    const level = levels.get(id)!;
    const kids = children.get(id)!.filter((c) => levels.has(c));
    const sum =
      kids.reduce((a, c) => a + widths.get(c)!, 0) +
      gap(level) * Math.max(0, kids.length - 1);
    widths.set(id, Math.max(own(id, level), sum));
  }
  const place = (id: string, left: number) => {
    const level = levels.get(id)!;
    const w = own(id, level);
    const total = widths.get(id)!;
    positions.set(id, { x: left + (total - w) / 2, y: rowY(level), w, level });
    const kids = children.get(id)!;
    const span =
      kids.reduce((a, c) => a + widths.get(c)!, 0) +
      gap(level) * Math.max(0, kids.length - 1);
    let cursor = left + (total - span) / 2;
    for (const c of kids) {
      place(c, cursor);
      cursor += widths.get(c)! + gap(level);
    }
  };
  place(root.id, -widths.get(root.id)! / 2);
  return { rootId: root.id, positions, children };
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
