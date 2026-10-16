import { useState } from "react";
import { ArrowUp, Plus, Square, X } from "lucide-react";
import type { ContextReference, StickyNote } from "../shared/types";
import { RoughBox } from "./sketch/RoughBox";

/** AI conversations live in a right-hand drawer, attached to a card or free. */
export function Drawer({
  note,
  anchorTitle,
  refs,
  pending,
  busy,
  error,
  onChange,
  onAsk,
  onStop,
  onPromote,
  onRemove,
  onClose,
}: {
  note: StickyNote;
  anchorTitle?: string;
  refs: ContextReference[];
  pending?: string;
  busy?: boolean;
  error?: string;
  onChange: (patch: Partial<StickyNote>) => void;
  onAsk: (prompt: string) => boolean;
  onStop: () => void;
  onPromote: (text: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const last = note.messages.filter((m) => m.role === "assistant").at(-1);
  const send = () => {
    if (!prompt.trim() || busy) return;
    if (onAsk(prompt.trim())) setPrompt("");
  };
  return (
    <aside className="chrome drawer" aria-label="批注与提问">
      <RoughBox kind="soft" seedKey={"drawer"} />
      <div className="bg" />
      <header>
        <span className="eyebrow">批注</span>
        <input
          className="drawer-title"
          aria-label="批注标题"
          value={note.title}
          placeholder={anchorTitle ?? "我的问题"}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <button className="icon" aria-label="关闭" onClick={onClose}>
          <X size={17} className="ico" />
        </button>
      </header>
      <div className="refs">
        <span className="lab">AI 会参考</span>
        <div>
          {refs
            .filter((r) => r.kind !== "note")
            .map((r) => (
              <span className="chip" key={`${r.kind}-${r.id}`} title={r.text}>
                {r.kind === "topic"
                  ? "起点问题"
                  : r.kind === "relation"
                    ? `~ ${r.title}`
                    : r.title}
              </span>
            ))}
        </div>
      </div>
      <div className="thread">
        <textarea
          className="note-text"
          aria-label="批注内容"
          placeholder="先写下你的理解，或一个没想通的地方……"
          value={note.text}
          onChange={(e) => onChange({ text: e.target.value })}
        />
        {note.messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <p>{m.text}</p>
          </div>
        ))}
        {pending && (
          <div className="msg assistant streaming">
            <p>{pending}</p>
          </div>
        )}
        {busy && !pending && (
          <div className="lab thinking">正在看这片上下文…</div>
        )}
        {error && <div className="inline-error">{error}</div>}
        {last && !busy && (
          <button className="btn chip-btn" onClick={() => onPromote(last.text)}>
            <Plus size={14} className="ico" /> 把回答加进地图
          </button>
        )}
      </div>
      <footer>
        <textarea
          aria-label="向 AI 提问"
          placeholder="继续追问…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              send();
            }
          }}
        />
        {busy ? (
          <button
            className="icon"
            title="停止回答"
            aria-label="停止回答"
            onClick={onStop}
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            className="icon"
            title="发送 ↵"
            aria-label="发送提问"
            disabled={!prompt.trim()}
            onClick={send}
          >
            <ArrowUp size={16} />
          </button>
        )}
      </footer>
      <button className="text-button danger" onClick={onRemove}>
        删除这张批注
      </button>
    </aside>
  );
}
