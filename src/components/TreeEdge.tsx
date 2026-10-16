import { useMemo } from "react";
import { useInternalNode, type Edge, type EdgeProps } from "@xyflow/react";
import { arrowHead, Paths, seedOf, sketch, type Sketch } from "./sketch/rough";

type Box = { x: number; y: number; w: number; h: number };
export function useBox(id: string): Box | null {
  const n = useInternalNode(id);
  if (!n?.measured.width || !n.measured.height) return null;
  const p = n.internals.positionAbsolute;
  return { x: p.x, y: p.y, w: n.measured.width, h: n.measured.height };
}

export type TreeEdgeData = {
  [key: string]: unknown;
  offset: number;
  unseen: boolean;
};
export type TreeEdgeType = Edge<TreeEdgeData, "tree">;

/** Parent bottom → child top. Fan-out ±24px on the parent; pencil dots to unseen children. */
export function TreeEdge({
  id,
  source,
  target,
  data,
}: EdgeProps<TreeEdgeType>) {
  const a = useBox(source),
    b = useBox(target);
  const key =
    a && b ? [a.x, a.y, a.w, a.h, b.x, b.y, b.w].map(Math.round).join() : "";
  const paths = useMemo<Sketch>(() => {
    if (!a || !b) return [];
    const x1 = a.x + a.w / 2 + (data?.offset ?? 0),
      y1 = a.y + a.h + 4,
      x2 = b.x + b.w / 2,
      y2 = b.y - 8,
      m = (y2 - y1) * 0.55;
    const s = data?.unseen
      ? { stroke: "var(--pencil)", width: 1.4, dash: [3, 5] }
      : { stroke: "var(--ink-2)", width: 1.15 };
    const seed = seedOf(id);
    return [
      ...sketch.path(
        `M${x1} ${y1} C${x1} ${y1 + m},${x2} ${y2 - m},${x2} ${y2}`,
        seed,
        s,
        { roughness: 0.5, bowing: 0.3 },
      ),
      ...arrowHead(
        x2,
        y2 + 0.5,
        Math.PI / 2,
        seed + 1,
        { ...s, width: 1.3 },
        8,
      ),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, id, data?.offset, data?.unseen]);
  return (
    <g className="tree-edge">
      <Paths sketch={paths} />
    </g>
  );
}

export type SeqEdgeType = Edge<{ [key: string]: unknown }, "seq">;

/**
 * 先→后 tick between adjacent siblings. In wide gaps a faint pencil leader runs
 * from the earlier card so the arrow never floats on its own.
 */
export function SeqEdge({ id, source, target }: EdgeProps<SeqEdgeType>) {
  const a = useBox(source),
    b = useBox(target);
  const key = a && b ? [a.x, a.y, a.w, b.x].map(Math.round).join() : "";
  const paths = useMemo<Sketch>(() => {
    if (!a || !b) return [];
    const gap = b.x - (a.x + a.w);
    if (gap < 12) return [];
    const y = a.y + 22,
      seed = seedOf(id),
      ink = { stroke: "var(--ink-3)", width: 1 };
    if (gap <= 80) {
      const mid = a.x + a.w + gap / 2,
        half = Math.min(16, gap / 2 - 5);
      return [
        ...sketch.line(mid - half, y, mid + half, y, seed, ink, {
          roughness: 0.6,
        }),
        ...arrowHead(
          mid + half + 0.5,
          y,
          0,
          seed + 1,
          { ...ink, width: 1.1 },
          6,
        ),
      ];
    }
    const x2 = b.x - 6,
      x1 = x2 - 32;
    return [
      ...sketch.line(
        a.x + a.w + 6,
        y,
        x1,
        y,
        seed + 2,
        { stroke: "var(--pencil)", width: 0.9, dash: [2, 5] },
        { roughness: 0.4 },
      ),
      ...sketch.line(x1, y, x2, y, seed, ink, { roughness: 0.6 }),
      ...arrowHead(x2 + 0.5, y, 0, seed + 1, { ...ink, width: 1.1 }, 6),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, id]);
  return (
    <g className="seq-edge">
      <Paths sketch={paths} />
    </g>
  );
}
