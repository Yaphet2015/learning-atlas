import type { Board, CardReview, ConceptNode, Point } from "../shared/types";
import { fnv1a } from "../shared/hash";
import { childrenGroups } from "../shared/tree";
import type { TreeLayout } from "./layout";
import { CARD_H, ROOT_H } from "./layout";

export const OVERVIEW_START = 0.3;
export const OVERVIEW_SECOND = 0.2;
export const OVERVIEW_THIRD = 0.12;
export const OVERVIEW_MAX_DEPTH = 3;

export function subtreeNodes(board: Board, id: string): ConceptNode[] {
  const children = childrenGroups(board.nodes);
  const root = board.nodes.find((node) => node.id === id);
  const stack = root ? [root] : [];
  const seen = new Set<string>();
  const result: ConceptNode[] = [];
  while (stack.length) {
    const node = stack.pop()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    result.push(node);
    stack.push(...(children.get(node.id) ?? []).slice().reverse());
  }
  return result;
}

function content(
  node: Pick<
    ConceptNode,
    "id" | "parentId" | "order" | "title" | "body" | "visual"
  >,
): unknown[] {
  return [
    node.id,
    node.parentId,
    node.order,
    node.title,
    node.body,
    node.visual ?? null,
  ];
}

export function overviewSignature(board: Board, id: string): string {
  const source = JSON.stringify([
    board.topic,
    subtreeNodes(board, id).map(content),
  ]);
  // A second, independent hash halves the chance of a stale summary matching.
  let second = 5381;
  for (let i = 0; i < source.length; i++)
    second = Math.imul(second, 33) ^ source.charCodeAt(i);
  return `overview-v1:${fnv1a(source).toString(16)}:${(second >>> 0).toString(16)}`;
}

export function overviewSummary(board: Board, id: string): string {
  const nodes = subtreeNodes(board, id);
  const root = nodes[0];
  if (!root) return "";
  if (root.overview?.sig === overviewSignature(board, id))
    return root.overview.summary;
  const sentence = root.body
    .trim()
    .split(/(?<=[。！？!?\n])/)[0]
    ?.trim();
  const children = nodes.filter((node) => node.parentId === id).slice(0, 3);
  const local =
    sentence ||
    (children.length
      ? `包括：${children.map((node) => node.title).join("、")}`
      : root.title);
  return local.length > 100 ? `${local.slice(0, 99)}…` : local;
}

/** Only cache summaries whose complete source is present and still matches the request. */
export function applyOverviews(
  board: Board,
  previous: Board,
  summaries: { id: string; summary: string }[] | undefined,
  ids: Map<string, string>,
  review?: CardReview,
): Board {
  if (!summaries?.length) return board;
  const old = new Map(previous.nodes.map((node) => [node.id, node]));
  const reviewed = new Map(review?.nodes.map((node) => [node.id, node]));
  // Any edited, removed or moved source makes the returned summaries stale.
  if (
    review?.nodes.some((source) => {
      const current = old.get(source.id);
      return (
        !current ||
        (!source.bodyExcluded &&
          JSON.stringify(content(current)) !== JSON.stringify(content(source)))
      );
    })
  )
    return board;
  const cached = new Map<string, { summary: string; sig: string }>();
  for (const item of summaries) {
    const id = ids.get(item.id);
    if (!id || cached.has(id)) continue;
    const nodes = subtreeNodes(board, id);
    if (!nodes.length) continue;
    const complete = nodes.every((node) => {
      if (!old.has(node.id) || !review) return true;
      const source = reviewed.get(node.id);
      return !!source && !source.bodyExcluded;
    });
    if (complete)
      cached.set(id, {
        summary: item.summary,
        sig: overviewSignature(board, id),
      });
  }
  if (!cached.size) return board;
  return {
    ...board,
    nodes: board.nodes.map((node) =>
      cached.has(node.id) ? { ...node, overview: cached.get(node.id)! } : node,
    ),
  };
}

export interface OverviewRegion {
  id: string;
  title: string;
  summary: string;
  depth: number;
  color: number;
  members: string[];
  children: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  outline: string;
}

/** Rounded convex envelope of the actual cards, with a small outward bow on each side. */
export function overviewOutline(
  boxes: { x: number; y: number; w: number; h: number }[],
): string {
  const points = boxes
    .flatMap(({ x, y, w, h }) => [
      { x: x - 12, y: y - 12 },
      { x: x + w / 2, y: y - 18 },
      { x: x + w + 12, y: y - 12 },
      { x: x + w + 18, y: y + h / 2 },
      { x: x + w + 12, y: y + h + 12 },
      { x: x + w / 2, y: y + h + 18 },
      { x: x - 12, y: y + h + 12 },
      { x: x - 18, y: y + h / 2 },
    ])
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (!points.length) return "";
  function cross(a: Point, b: Point, c: Point): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }
  function half(items: Point[]): Point[] {
    const result: Point[] = [];
    for (const point of items) {
      while (
        result.length > 1 &&
        cross(result[result.length - 2], result[result.length - 1], point) <= 0
      )
        result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  }
  const hull = [...half(points), ...half([...points].reverse())];
  const rounded = hull.map((point, i) => {
    function toward(other: Point): Point {
      const distance = Math.hypot(other.x - point.x, other.y - point.y);
      const t = Math.min(0.2, 14 / distance);
      return {
        x: point.x + (other.x - point.x) * t,
        y: point.y + (other.y - point.y) * t,
      };
    }
    return {
      point,
      enter: toward(hull[(i + hull.length - 1) % hull.length]),
      leave: toward(hull[(i + 1) % hull.length]),
    };
  });
  return (
    rounded
      .map(
        ({ point, enter, leave }, i) =>
          `${i ? "L" : "M"}${enter.x},${enter.y} Q${point.x},${point.y} ${leave.x},${leave.y}`,
      )
      .join(" ") + " Z"
  );
}

/** Preview depth is capped independently of the knowledge tree's depth. */
export function overviewRegions(
  board: Board,
  layout: TreeLayout,
  heights: Map<string, number>,
): OverviewRegion[] {
  const regions: OverviewRegion[] = [];
  function visit(id: string, depth: number, color: number): void {
    const members = subtreeNodes(board, id);
    const placed = members.flatMap((node) => {
      const at = layout.positions.get(node.id);
      return at
        ? [
            {
              ...at,
              h: heights.get(node.id) ?? (at.level === 0 ? ROOT_H : CARD_H),
            },
          ]
        : [];
    });
    if (!placed.length) return;
    const x = Math.min(...placed.map((p) => p.x)) - 20;
    const y = Math.min(...placed.map((p) => p.y)) - 20;
    const children = layout.children.get(id) ?? [];
    regions.push({
      id,
      title: members[0].title,
      summary: overviewSummary(board, id),
      depth,
      color,
      members: members.map((node) => node.id),
      children:
        depth < OVERVIEW_MAX_DEPTH && children.length > 1 ? children : [],
      x,
      y,
      width: Math.max(...placed.map((p) => p.x + p.w)) - x + 20,
      height: Math.max(...placed.map((p) => p.y + p.h)) - y + 20,
      outline: overviewOutline(
        placed.map((p) => ({ ...p, x: p.x - x, y: p.y - y })),
      ),
    });
    if (depth < OVERVIEW_MAX_DEPTH && children.length > 1)
      children.forEach((child) => visit(child, depth + 1, color));
  }
  for (const root of layout.rootIds) {
    for (const child of layout.children.get(root) ?? []) {
      const hash = fnv1a(child);
      visit(child, 1, ((hash ^ (hash >>> 16)) >>> 0) % 6);
    }
  }
  return regions;
}

export function overviewOpacity(zoom: number): number {
  return zoom <= OVERVIEW_START ? 1 : 0;
}

/** Keep floating introductions above the cards and apart from one another. */
export function overviewLabels(
  regions: OverviewRegion[],
  visible: Set<string>,
  zoom: number,
  layout: TreeLayout,
  heights: Map<string, number>,
): Map<string, { x: number; y: number; width: number }> {
  const occupied = [...layout.positions].map(([id, p]) => ({
    x: p.x,
    y: p.y,
    w: p.w,
    h: heights.get(id) ?? (p.level === 0 ? ROOT_H : CARD_H),
  }));
  const labels = new Map<string, { x: number; y: number; width: number }>();
  const gap = 10 / zoom;
  for (const region of regions) {
    if (!visible.has(region.id)) continue;
    const width = Math.max(120, Math.min(240, region.width * zoom));
    const x = region.x + region.width / 2;
    const box = {
      x: x - width / zoom / 2,
      y: 0,
      w: width / zoom,
      h: 104 / zoom,
    };
    let bottom = region.y - gap;
    while (true) {
      box.y = bottom - box.h;
      const collisions = occupied.filter(
        (other) =>
          box.x < other.x + other.w + gap &&
          box.x + box.w + gap > other.x &&
          box.y < other.y + other.h + gap &&
          box.y + box.h + gap > other.y,
      );
      if (!collisions.length) break;
      // Leave an extra unit so fractional zoom cannot re-hit the same edge.
      bottom = Math.min(...collisions.map((other) => other.y)) - gap - 1;
    }
    occupied.push(box);
    labels.set(region.id, { x, y: bottom, width });
  }
  return labels;
}

/** Hysteresis uses the previous frontier; panning cannot change it. */
export function overviewFrontier(
  regions: OverviewRegion[],
  zoom: number,
  canvasWidth: number,
  previous = new Set<string>(),
): { visible: Set<string>; split: Set<string> } {
  const byId = new Map(regions.map((region) => [region.id, region]));
  const visible = new Set<string>();
  const split = new Set<string>();
  if (zoom > OVERVIEW_START) return { visible, split };
  let maximumDepth = 1;
  if (zoom > OVERVIEW_THIRD) maximumDepth = 2;
  if (zoom > OVERVIEW_SECOND) maximumDepth = 3;
  function visit(region: OverviewRegion): void {
    const children = region.children.map((id) => byId.get(id)!);
    const wide = region.width * OVERVIEW_START > canvasWidth * 0.8;
    const minimum = previous.has(region.id) ? 220 : 244;
    if (
      wide &&
      region.depth < maximumDepth &&
      children.length > 1 &&
      children.every((child) => child.width * zoom >= minimum)
    ) {
      split.add(region.id);
      children.forEach(visit);
    } else visible.add(region.id);
  }
  regions.filter((region) => region.depth === 1).forEach(visit);
  return { visible, split };
}
