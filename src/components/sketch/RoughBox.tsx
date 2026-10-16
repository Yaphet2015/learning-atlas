import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Paths, seedOf, sketch, type Sketch } from "./rough";

export type BoxKind =
  | "dash" // 待探索: pencil dashed
  | "card" // 探索中: solid
  | "strong" // 我能解释: heavy ink
  | "origin" // root question
  | "ghost" // insertion preview
  | "soft"; // chrome

const O = 6; // the svg is inset −6px so strokes can wobble past the edge

function draw(kind: BoxKind, w: number, h: number, seed: number): Sketch {
  switch (kind) {
    case "dash":
      return sketch.rect(
        O,
        O,
        w,
        h,
        seed,
        { stroke: "var(--pencil)", width: 1.1, dash: [5, 5] },
        { roughness: 0.9, bowing: 0.5, disableMultiStroke: true },
      );
    case "card":
      return sketch.rect(
        O,
        O,
        w,
        h,
        seed,
        { stroke: "var(--stroke-card)", width: 1 },
        { roughness: 0.7, bowing: 0.6 },
      );
    case "strong":
      return sketch.rect(
        O,
        O,
        w,
        h,
        seed,
        { stroke: "var(--stroke)", width: 1.7 },
        { roughness: 0.6, bowing: 0.6 },
      );
    case "origin":
      return [
        ...sketch.rect(
          O,
          O,
          w,
          h,
          seed,
          { stroke: "var(--stroke-card)", width: 1.5 },
          { roughness: 0.7, bowing: 0.6 },
        ),
        ...sketch.rect(
          O - 4,
          O - 4,
          w + 8,
          h + 8,
          seed + 1,
          { stroke: "var(--stroke-soft)", width: 0.8 },
          { roughness: 0.6, bowing: 0.5, disableMultiStroke: true },
        ),
      ];
    case "ghost":
      return sketch.rect(
        O,
        O,
        w,
        h,
        seed,
        { stroke: "var(--accent)", width: 1.2, dash: [4, 5] },
        { roughness: 0.6, bowing: 0.5, disableMultiStroke: true },
      );
    case "soft":
      return sketch.rect(
        O,
        O,
        w,
        h,
        seed,
        { stroke: "var(--stroke-soft)", width: 0.9 },
        { roughness: 0.45, bowing: 0.5, disableMultiStroke: true },
      );
  }
}

/** A hand-drawn frame that redraws only when its size changes. */
export function RoughBox({
  kind,
  seedKey,
}: {
  kind: BoxKind;
  seedKey: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const w = Math.round(parent.offsetWidth),
        h = Math.round(parent.offsetHeight);
      setSize((s) => (s[0] === w && s[1] === h ? s : [w, h]));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);
  const paths = useMemo(
    () => (size[0] ? draw(kind, size[0], size[1], seedOf(seedKey)) : []),
    [kind, size, seedKey],
  );
  return (
    <svg ref={ref} className="rough-box" aria-hidden="true">
      <Paths sketch={paths} />
    </svg>
  );
}

/** Hand-drawn selection loop: a superellipse 21/19px outside the card, 1.1 turns. */
export function SelectRing({
  w,
  h,
  seedKey,
}: {
  w: number;
  h: number;
  seedKey: string;
}) {
  const paths = useMemo(() => {
    const cx = w / 2 + 27,
      cy = h / 2 + 25,
      rx = w / 2 + 21,
      ry = h / 2 + 19,
      e = 0.5,
      pts: [number, number][] = [];
    const steps = 44;
    for (let i = 0; i <= steps * 1.1; i++) {
      const t = (i / steps) * Math.PI * 2 - 2.2;
      const c = Math.cos(t),
        s = Math.sin(t);
      const drift = i > steps ? 4 : 0;
      pts.push([
        cx + rx * Math.sign(c) * Math.abs(c) ** e + drift,
        cy + ry * Math.sign(s) * Math.abs(s) ** e - drift * 0.75,
      ]);
    }
    return sketch.curve(
      pts,
      seedOf(seedKey),
      { stroke: "var(--accent)", width: 1.4 },
      { roughness: 0.7, bowing: 0.5, disableMultiStroke: true },
    );
  }, [w, h, seedKey]);
  return (
    <svg
      className="select-ring"
      width={w + 54}
      height={h + 50}
      aria-hidden="true"
    >
      <Paths sketch={paths} />
    </svg>
  );
}

/** Shared SVG filters: ink-starved stamp, highlighter wash, icon wobble. */
export function SketchDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
    >
      <defs>
        <filter id="stampy">
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".9"
            numOctaves="1"
            seed="4"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="1.2"
            result="d"
          />
          <feComponentTransfer in="n" result="m">
            <feFuncA type="discrete" tableValues="1 1 1 1 1 1 1 1 1 0 1 1" />
          </feComponentTransfer>
          <feComposite in="d" in2="m" operator="in" />
        </filter>
        <filter id="wobble">
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".06"
            numOctaves="2"
            seed="7"
          />
          <feDisplacementMap in="SourceGraphic" scale="1.6" />
        </filter>
        <filter id="wash" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".035"
            numOctaves="3"
            seed="3"
            result="t"
          />
          <feDisplacementMap in="SourceGraphic" in2="t" scale="7" result="d" />
          <feGaussianBlur in="d" stdDeviation="1.1" />
        </filter>
      </defs>
    </svg>
  );
}
