import rough from "roughjs";
import type { Options } from "roughjs/bin/core";

const gen = rough.generator();

/** Fixed seed per object: the same card always draws the same wobble. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2147483646) + 1;
}

export type Stroke = {
  /** Any CSS colour, including var(--token); applied via style so themes switch for free. */
  stroke: string;
  width: number;
  dash?: number[];
};
export type Sketch = { d: string; s: Stroke }[];

function toSketch(drawable: ReturnType<typeof gen.line>, s: Stroke): Sketch {
  return gen.toPaths(drawable).map((p) => ({ d: p.d, s }));
}
const opts = (seed: number, s: Stroke, o: Options): Options => ({
  seed,
  stroke: "#000",
  strokeWidth: s.width,
  ...o,
});

export const sketch = {
  rect: (
    x: number,
    y: number,
    w: number,
    h: number,
    seed: number,
    s: Stroke,
    o: Options = {},
  ) => toSketch(gen.rectangle(x, y, w, h, opts(seed, s, o)), s),
  line: (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    seed: number,
    s: Stroke,
    o: Options = {},
  ) =>
    toSketch(
      gen.line(
        x1,
        y1,
        x2,
        y2,
        opts(seed, s, { disableMultiStroke: true, ...o }),
      ),
      s,
    ),
  path: (d: string, seed: number, s: Stroke, o: Options = {}) =>
    toSketch(gen.path(d, opts(seed, s, { disableMultiStroke: true, ...o })), s),
  poly: (pts: [number, number][], seed: number, s: Stroke, o: Options = {}) =>
    toSketch(
      gen.linearPath(pts, opts(seed, s, { disableMultiStroke: true, ...o })),
      s,
    ),
  curve: (pts: [number, number][], seed: number, s: Stroke, o: Options = {}) =>
    toSketch(gen.curve(pts, opts(seed, s, o)), s),
};

/** Open pen arrowhead: two strokes, 9px long, ±0.45 rad. */
export function arrowHead(
  x: number,
  y: number,
  angle: number,
  seed: number,
  s: Stroke,
  len = 9,
): Sketch {
  const a1 = angle + Math.PI - 0.45,
    a2 = angle + Math.PI + 0.45;
  return sketch.poly(
    [
      [x + len * Math.cos(a1), y + len * Math.sin(a1)],
      [x, y],
      [x + len * Math.cos(a2), y + len * Math.sin(a2)],
    ],
    seed,
    { ...s, dash: undefined },
    { roughness: 0.4 },
  );
}

export function Paths({ sketch: list }: { sketch: Sketch }) {
  return (
    <>
      {list.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          strokeLinecap="round"
          style={{
            stroke: p.s.stroke,
            strokeWidth: p.s.width,
            strokeDasharray: p.s.dash?.join(" "),
          }}
        />
      ))}
    </>
  );
}
