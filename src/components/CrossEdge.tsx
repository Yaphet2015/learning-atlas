import { useMemo } from "react";
import type { Edge, EdgeProps } from "@xyflow/react";
import { arrowHead, Paths, seedOf, sketch, type Sketch } from "./sketch/rough";
import { useBox } from "./TreeEdge";

export type CrossEdgeType = Edge<
  { [key: string]: unknown; label: string },
  "cross"
>;

/** Light dotted arc between branches, labelled “~ label”. Never affects layout. */
export function CrossEdge({
  id,
  source,
  target,
  data,
  selected,
}: EdgeProps<CrossEdgeType>) {
  const a = useBox(source),
    b = useBox(target);
  const geo = useMemo(() => {
    if (!a || !b) return null;
    const ltr = a.x <= b.x;
    const x1 = a.x + a.w * (ltr ? 0.7 : 0.3),
      y1 = a.y + a.h + 4,
      x2 = b.x + b.w * (ltr ? 0.3 : 0.7),
      y2 = b.y + b.h + 4,
      dx = ltr ? 20 : -20,
      d = `M${x1} ${y1} C${x1 + dx} ${y1 + 70},${x2 - dx} ${y2 + 70},${x2} ${y2 + 6}`;
    // Label sits on the curve's midpoint (cubic at t = 0.5).
    const ly = (y1 + 3 * (y1 + 70) + 3 * (y2 + 70) + y2 + 6) / 8;
    return { d, lx: (x1 + x2) / 2, ly, x2, y2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.x, a?.y, a?.w, a?.h, b?.x, b?.y, b?.w, b?.h]);
  const paths = useMemo<Sketch>(() => {
    if (!geo) return [];
    const s = {
      stroke: selected ? "var(--accent)" : "var(--pencil)",
      width: selected ? 1.3 : 1,
      dash: [2, 5],
    };
    const seed = seedOf(id);
    return [
      ...sketch.path(geo.d, seed, s, { roughness: 0.6 }),
      ...arrowHead(geo.x2, geo.y2 + 5, -Math.PI / 2, seed + 1, s, 7),
    ];
  }, [geo, id, selected]);
  if (!geo) return null;
  return (
    <g className={`cross-edge ${selected ? "selected" : ""}`}>
      <path
        d={geo.d}
        className="react-flow__edge-interaction"
        fill="none"
        stroke="transparent"
        strokeWidth={16}
      />
      <Paths sketch={paths} />
      {data?.label && (
        <text x={geo.lx} y={geo.ly} className="cross-label">
          ~ {data.label}
        </text>
      )}
    </g>
  );
}
