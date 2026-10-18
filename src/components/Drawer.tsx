import { useState } from "react";
import { ArrowUp, LoaderCircle, Plus, Square, X } from "lucide-react";
import type {
  ConceptNode,
  ContextReference,
  StickyNote,
} from "../shared/types";
import { StructuredVisual } from "./StructuredVisual";
import { displayMessage } from "../model/kickoff";
import { AnswerBlocks } from "./AnswerBlocks";

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** AI conversations live in a right-hand drawer, attached to a card or free. */
export function Drawer({
  note,
  anchor,
  anchorTitle,
  refs,
  pending,
  busy,
  error,
  onChange,
  onAsk,
  kickoff,
  onStop,
  onPromote,
  onRemove,
  onClose,
}: {
  note: StickyNote;
  /** The card this conversation hangs on; its diagram renders here, not on the card. */
  anchor?: ConceptNode;
  anchorTitle?: string;
  refs: ContextReference[];
  pending?: string;
  busy?: boolean;
  error?: string;
  onChange: (patch: Partial<StickyNote>) => void;
  onAsk: (prompt: string) => boolean;
  /** Present while this is the root's kickoff conversation and the root has no children yet. */
  kickoff?: { onAccept: () => void; busy: boolean };
  onStop: () => void;
  onPromote: (text: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  /** Tick a 小练习 step; stored on the message so it survives reloads. */
  const toggleStep = (messageId: string, index: number) =>
    onChange({
      messages: note.messages.map((m) => {
        if (m.id !== messageId) return m;
        const checked = m.meta?.checked ?? [];
        return {
          ...m,
          meta: {
            ...m.meta,
            checked: checked.includes(index)
              ? checked.filter((c) => c !== index)
              : [...checked, index].sort((a, b) => a - b),
          },
        };
      }),
    });
  const last = note.messages.filter((m) => m.role === "assistant").at(-1);
  const send = () => {
    if (!prompt.trim() || busy) return;
    if (onAsk(prompt.trim())) setPrompt("");
  };
  return (
    <aside className="chrome drawer" aria-label="批注与提问">
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
        {anchor?.visual && (
          <section className="this-card" aria-label="这张卡">
            <span className="lab">这张卡 · {anchor.title}</span>
            <StructuredVisual visual={anchor.visual} />
          </section>
        )}
        <textarea
          className="note-text"
          aria-label="批注内容"
          placeholder="先写下你的理解，或一个没想通的地方……"
          value={note.text}
          onChange={(e) => onChange({ text: e.target.value })}
        />
        {note.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="msg user bubble">
              {displayMessage(m.role, m.text)}
            </div>
          ) : (
            <div key={m.id} className="msg assistant ans">
              <div className="who">
                <span>AI</span>
                <span>{clock(m.createdAt)}</span>
              </div>
              <AnswerBlocks
                text={m.text}
                actions={{
                  checked: m.meta?.checked,
                  onToggleStep: (i) => toggleStep(m.id, i),
                  onAnswerCheck: (text) => onAsk(text),
                }}
              />
            </div>
          ),
        )}
        {pending && (
          <div className="msg assistant ans streaming" aria-live="polite">
            <div className="who">
              <span>AI</span>
            </div>
            <AnswerBlocks text={pending} streaming />
            <span className="streaming-caret" aria-hidden="true" />
          </div>
        )}
        {busy && !pending && (
          <div className="lab thinking">正在看这片上下文…</div>
        )}
        {error && <div className="inline-error">{error}</div>}
        {kickoff && last && !busy ? (
          <div className="kickoff-accept">
            <button
              className="btn kickoff-btn"
              disabled={kickoff.busy}
              onClick={kickoff.onAccept}
            >
              {kickoff.busy ? (
                <LoaderCircle size={15} className="ico spin" />
              ) : (
                <Plus size={15} className="ico" />
              )}
              {kickoff.busy ? "正在拆出第一层…" : "把第一层问题放上画布"}
            </button>
            <span className="lab">
              先在下面回答它的问题，拆得会更贴合你；也可以直接放上去，之后再调整。
            </span>
          </div>
        ) : (
          last &&
          !busy && (
            <button
              className="btn chip-btn"
              onClick={() => onPromote(last.text)}
            >
              <Plus size={14} className="ico" /> 把回答加进地图
            </button>
          )
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
