import { useState } from "react";
import type { ProbeState } from "../shared/types";
import { levelState, nextProbe, probeResult, type LevelState } from "../model/probe";
import { UNSURE } from "../model/mark";

export interface ProbeProps {
  state: ProbeState;
  busy: boolean;
  /** Stations on the route (for the result line); 0 before the map is laid. */
  stations: number;
  onAnswer: (choice: number | null, text: string) => void;
  onSkip: () => void;
  /** 我想从头学: drop the light seals, start at 第 1 站. */
  onFromStart?: () => void;
}

const MARK: Record<LevelState, string> = {
  asking: "正在问",
  correct: "✓",
  partial: "✗",
  wrong: "✗",
  unsure: "✗",
  inferred: "推断",
  unasked: "先不问",
};

/** The bisection 摸底 (01-start / 02-route): the depth ladder L5→L0 on top, one probe below. */
export function ProbePanel({ state, busy, stations, onAnswer, onSkip, onFromStart }: ProbeProps) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const step = nextProbe(state);
  const asking = state.status === "asking";
  const level = asking && !step.done ? state.ladder[step.level] : undefined;
  const frontier = state.frontier ?? 0;
  const n = state.answers.length;
  const submit = () => {
    if (busy || !level) return;
    if (level.probe.type === "choice" ? choice === null : !text.trim() && choice !== -1) return;
    onAnswer(choice, text);
    setChoice(null);
    setText("");
  };
  return (
    <section className="stop probe" aria-label="摸底">
      <div className="probe-head">
        <h3>摸底 · 找到你的起点</h3>
        <span className="lab">
          {asking ? (state.ladder.length ? `第 ${n + 1} 题 / 约 3 题` : "正在拟深度阶梯…") : `${n} 题 · 已收敛`}
        </span>
      </div>
      {state.ladder.length > 0 && (
        <ol className="ladder" aria-label="深度阶梯">
          {[...state.ladder].reverse().map((l) => {
            const st = levelState(state, l.level);
            const isFrontier = !asking && state.status === "done" && l.level === frontier;
            return (
              <li key={l.level} className={`rung ${st} ${isFrontier ? "frontier" : ""}`}>
                <b>L{l.level}</b>
                <span className="rung-desc">{l.desc}</span>
                <span className="rung-mark">{isFrontier ? "← 前沿" : MARK[st]}</span>
              </li>
            );
          })}
        </ol>
      )}
      {level && (
        <div className="beat-pane probe-q">
          <span className="lab">
            L{level.level} · {level.probe.type === "choice" ? "情境题" : "一句话解释"}
          </span>
          <p className="beat-q">{level.probe.q}</p>
          {level.probe.type === "choice" && level.probe.options ? (
            <div className="beat-options" role="radiogroup" aria-label="摸底选项">
              {[...level.probe.options, UNSURE].map((o, i) => {
                const v = i === level.probe.options!.length ? -1 : i;
                return (
                  <button key={i} role="radio" aria-checked={choice === v} className={`opt ${choice === v ? "on" : ""}`} onClick={() => setChoice(v)}>
                    {v >= 0 ? `${String.fromCharCode(65 + i)}. ` : ""}
                    {o}
                  </button>
                );
              })}
            </div>
          ) : (
            <button className={`opt ${choice === -1 ? "on" : ""}`} role="radio" aria-checked={choice === -1} onClick={() => setChoice(choice === -1 ? null : -1)}>
              {UNSURE}
            </button>
          )}
          <textarea
            className="beat-input"
            aria-label={level.probe.type === "choice" ? "说说为什么（可选）" : "我的回答"}
            rows={2}
            value={text}
            placeholder={level.probe.type === "choice" ? "选完再用一句话说说为什么（可选），能让判断更准。" : "用一句话回答"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="beat-acts">
            <button className="btn primary" disabled={busy} onClick={submit}>
              {busy ? "正在判…" : "确定"} <span className="kbd">↵</span>
            </button>
            <button className="btn quiet" onClick={onSkip}>
              跳过摸底
            </button>
          </div>
        </div>
      )}
      {!asking && (
        <div className="probe-result">
          <p>{probeResult(state, stations)}</p>
          {onFromStart && frontier > 0 && (
            <button className="btn quiet" onClick={onFromStart}>
              我想从头学
            </button>
          )}
        </div>
      )}
    </section>
  );
}
