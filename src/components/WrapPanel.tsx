import { useState } from "react";
import type { Board } from "../shared/types";
import { sentences } from "../model/wrap";

/** 合起来讲 on the root (06-wrap): five sentences, no cards; the stations it reaches light up. */
export function WrapPanel({
  board,
  stations,
  onSubmit,
}: {
  board: Board;
  stations: number;
  onSubmit: (text: string) => Promise<boolean>;
}) {
  const wrap = board.wrap;
  const [text, setText] = useState(wrap?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setFailed(!(await onSubmit(text)));
    setBusy(false);
  };
  return (
    <section className="stop wrap-up" aria-label="合起来讲">
      <span className="lab">最后一站 · 合起来讲</span>
      <p className="beat-q">不看卡片，用 5 句话回答起点问题。讲到哪张卡，哪张就亮起来。</p>
      {wrap?.done ? (
        <>
          <p className="card-body">{wrap.text}</p>
          <p className="beat-sealed">
            <span className="seal-a" aria-hidden="true">A</span>
            全图讲通了
          </p>
        </>
      ) : (
        <>
          <textarea
            className="beat-input"
            aria-label="合起来讲"
            rows={5}
            value={text}
            placeholder="先说它的核心是什么，再把每一站串进来……"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
          />
          <p className="beat-foot">
            {sentences(text)} 句
          </p>
          {wrap?.missing && <p className="beat-feedback" role="status">还差一点：{wrap.missing}</p>}
          {failed && !wrap?.missing && <p className="beat-feedback" role="status">这次没判出来，稍后再提交一次。</p>}
          <div className="beat-acts">
            <button className="btn primary" disabled={busy || !text.trim()} onClick={() => void submit()}>
              {busy ? "正在听…" : "讲完了"} <span className="kbd">⌘↵</span>
            </button>
          </div>
        </>
      )}
    </section>
  );
}
