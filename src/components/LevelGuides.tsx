import { ViewportPortal, useViewport } from "@xyflow/react";

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

/**
 * Faint 1px rules above each level row (none above the root), following the
 * canvas pan/zoom. `rows[l]` is the top of level l in flow coordinates.
 */
export function LevelGuides({
  rows,
  left,
  right,
}: {
  rows: number[];
  left: number;
  right: number;
}) {
  const x1 = left - 2400,
    x2 = right + 2400;
  const { y: vy, zoom } = useViewport();
  const top = -40,
    bottom = (rows.at(-1) ?? 0) + 40;
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
          {rows.map((y, l) =>
            l === 0 ? null : (
              <line
                key={l}
                x1={x1}
                x2={x2}
                y1={y - 28.5}
                y2={y - 28.5}
                stroke="var(--rule)"
                strokeWidth={1}
              />
            ),
          )}
        </svg>
      </ViewportPortal>
      {/* Labels stay pinned to the left margin, like a notebook's ruled lines. */}
      {rows.map((y, l) => (
        <div
          key={l}
          className="lvl-label"
          style={{ left: 22, top: (y - 22) * zoom + vy }}
        >
          <b>L{l}</b>
          {levelName(l)}
        </div>
      ))}
    </>
  );
}
