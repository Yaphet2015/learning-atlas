import { useEffect, useState } from "react";

/*
 * The drawer's thinking / answering indicator. Pattern adapted (not copied) from
 * Beautiful UI's LoadingState + ThinkingState (MIT, © 2026 Shane Levine,
 * github.com/slev12397/beautiful-ui): a 3×3 pixel grid whose chevron wavefront
 * sweeps left to right, a shimmering label, and a live elapsed time in tabular
 * figures. Rebuilt in plain CSS on the v5 ink tokens. Reduced motion freezes the
 * grid and the shimmer; the timer still ticks.
 */

// Delay per cell (row-major): a ">" shaped front, column by column.
const DELAYS = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

export function elapsedLabel(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
}

export function StreamStatus({
  phase,
  startedAt,
}: {
  phase: "thinking" | "answering";
  startedAt: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="stream-status" data-phase={phase}>
      <span className="pixel-grid" aria-hidden="true">
        {DELAYS.map((d, i) => (
          <span key={i} style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
      <span className="shimmer">
        {phase === "thinking" ? "正在思考" : "正在回答"}
      </span>
      <span className="elapsed">{elapsedLabel(now - startedAt)}</span>
    </span>
  );
}
