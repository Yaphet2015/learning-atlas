import type { Edge, EdgeProps } from "@xyflow/react";
import { arrowHead, useBox } from "./TreeEdge";

export type CrossEdgeType = Edge<
  { [key: string]: unknown; label: string },
  "cross"
>;

/** Light dotted bezier arc between branches, labelled “~ label” at its midpoint. Never affects layout. */
export function CrossEdge({
  source,
  target,
  data,
  selected,
}: EdgeProps<CrossEdgeType>) {
  const a = useBox(source),
    b = useBox(target);
  if (!a || !b) return null;
  const ltr = a.x <= b.x;
  const x1 = a.x + a.w * (ltr ? 0.7 : 0.3),
    y1 = a.y + a.h + 2,
    x2 = b.x + b.w * (ltr ? 0.3 : 0.7),
    y2 = b.y + b.h + 8,
    my = Math.max(y1, y2) + 60;
  const d = `M${x1} ${y1} C${x1} ${my},${x2} ${my},${x2} ${y2}`;
  // Cubic midpoint (t = .5): the label sits on the curve, not below it.
  const lx = (x1 + 3 * x1 + 3 * x2 + x2) / 8,
    ly = (y1 + 6 * my + y2) / 8;
  const color = selected ? "var(--accent)" : "var(--ink-3)";
  return (
    <g className={`cross-edge ${selected ? "selected" : ""}`}>
      <path
        d={d}
        className="react-flow__edge-interaction"
        fill="none"
        stroke="transparent"
        strokeWidth={16}
      />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeDasharray="0 5"
      />
      <path d={arrowHead(x2, y2 - 2, -Math.PI / 2)} fill={color} />
      {data?.label && (
        <text x={lx} y={ly + 4} className="cross-label">
          ~ {data.label}
        </text>
      )}
    </g>
  );
}
