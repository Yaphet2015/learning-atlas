import { useInternalNode, type Edge, type EdgeProps } from "@xyflow/react";

type Box = { x: number; y: number; w: number; h: number };
export function useBox(id: string): Box | null {
  const n = useInternalNode(id);
  if (!n?.measured.width || !n.measured.height) return null;
  const p = n.internals.positionAbsolute;
  return { x: p.x, y: p.y, w: n.measured.width, h: n.measured.height };
}

/** A 7×8 filled arrowhead whose tip sits at (x, y), pointing along `angle`. */
export function arrowHead(x: number, y: number, angle: number) {
  const L = 7,
    W = 4,
    c = Math.cos(angle),
    s = Math.sin(angle),
    bx = x - L * c,
    by = y - L * s;
  return `M${x} ${y} L${bx - W * s} ${by + W * c} L${bx + W * s} ${by - W * c} Z`;
}

export type TreeEdgeData = {
  [key: string]: unknown;
  offset: number;
  unseen: boolean;
};
export type TreeEdgeType = Edge<TreeEdgeData, "tree">;

/** Parent bottom → child top: one clean cubic bezier; dashed into an unseen child. */
export function TreeEdge({ source, target, data }: EdgeProps<TreeEdgeType>) {
  const a = useBox(source),
    b = useBox(target);
  if (!a || !b) return null;
  const x1 = a.x + a.w / 2 + (data?.offset ?? 0),
    y1 = a.y + a.h,
    x2 = b.x + b.w / 2,
    y2 = b.y - 3,
    k = (y2 - y1) * 0.55;
  const color = data?.unseen ? "var(--dash)" : "var(--edge)";
  return (
    <g className={`tree-edge ${data?.unseen ? "unseen" : ""}`}>
      <path
        d={`M${x1} ${y1} C${x1} ${y1 + k},${x2} ${y2 - k},${x2} ${y2 - 6}`}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeDasharray={data?.unseen ? "4 4" : undefined}
      />
      <path d={arrowHead(x2, y2, Math.PI / 2)} fill={color} />
    </g>
  );
}

export type SeqEdgeType = Edge<{ [key: string]: unknown }, "seq">;

/** 先→后 tick between adjacent siblings: at most 28px, always ending at the later card. */
export function SeqEdge({ source, target }: EdgeProps<SeqEdgeType>) {
  const a = useBox(source),
    b = useBox(target);
  if (!a || !b) return null;
  const gap = b.x - (a.x + a.w);
  if (gap < 18) return null;
  const y = a.y + 28,
    x2 = b.x - 6,
    x1 = Math.max(a.x + a.w + 6, x2 - 28);
  return (
    <g className="seq-edge">
      <path
        d={`M${x1} ${y} H${x2 - 6}`}
        fill="none"
        stroke="var(--ink-3)"
        strokeWidth={1.25}
        strokeLinecap="round"
      />
      <path d={arrowHead(x2, y, 0)} fill="var(--ink-3)" />
    </g>
  );
}
