import { useMemo } from "react";
import { ViewportPortal, useViewport } from "@xyflow/react";
import { rowY } from "../model/layout";
import { Paths, sketch } from "./sketch/rough";

const NAMES = [
  "问题",
  "第一层",
  "第二层",
  "第三层",
  "第四层",
  "第五层",
  "第六层",
];
export const levelName = (l: number) => NAMES[l] ?? `第 ${l} 层`;

/** Notebook rules above each level row, following the canvas pan/zoom. */
export function LevelGuides({
  levels,
  left,
  right,
}: {
  levels: number;
  left: number;
  right: number;
}) {
  const x1 = left - 2400,
    x2 = right + 2400;
  const { y: vy, zoom } = useViewport();
  const paths = useMemo(
    () =>
      Array.from({ length: levels }, (_, l) =>
        sketch.line(
          x1,
          rowY(l) - 22,
          x2,
          rowY(l) - 21,
          500 + l,
          { stroke: "var(--pencil)", width: 0.8 },
          { roughness: 0.8, bowing: 0.3 },
        ),
      ).flat(),
    [levels, x1, x2],
  );
  const top = -40,
    bottom = rowY(levels) + 40;
  return (
    <>
      <ViewportPortal>
        <svg
          className="level-guides"
          style={{ position: "absolute", left: x1, top, overflow: "visible" }}
          width={x2 - x1}
          height={bottom - top}
          viewBox={`${x1} ${top} ${x2 - x1} ${bottom - top}`}
          aria-hidden="true"
        >
          <Paths sketch={paths} />
        </svg>
      </ViewportPortal>
      {/* Labels stay pinned to the left margin, like a notebook's ruled lines. */}
      {Array.from({ length: levels }, (_, l) => (
        <div
          key={l}
          className="lvl-label"
          style={{ left: 22, top: (rowY(l) - 16) * zoom + vy }}
        >
          <b>L{l}</b>
          {levelName(l)}
        </div>
      ))}
    </>
  );
}
