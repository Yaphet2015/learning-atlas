import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  Copy,
  Delete,
  Layers3,
  LoaderCircle,
  Locate,
  MessageSquareQuote,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Square,
  SquarePlus,
  X,
} from "lucide-react";
import type {
  ChatMessage,
  ConceptNode,
  ContextReference,
  StickyNote,
} from "../shared/types";
import { StructuredVisual } from "./StructuredVisual";
import { displayMessage } from "../model/kickoff";
import { outlineOf, type OutlineItem } from "../model/answer";
import { AnswerBlocks } from "./AnswerBlocks";

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const copy = (text: string) => void navigator.clipboard?.writeText(text);

/** Small popover menu: closes on Esc, on a click elsewhere, or after a pick. */
function Menu({
  className = "",
  onClose,
  onDelete,
  children,
}: {
  className?: string;
  onClose: () => void;
  /** ⌫ inside the menu. */
  onDelete?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:enabled")?.focus();
    const down = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", down);
    return () => window.removeEventListener("pointerdown", down);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className={`menu ${className}`}
      role="menu"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
        if (onDelete && (e.key === "Backspace" || e.key === "Delete")) {
          onClose();
          onDelete();
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const items = [
            ...(ref.current?.querySelectorAll<HTMLButtonElement>(
              "button:enabled",
            ) ?? []),
          ];
          const i = items.indexOf(document.activeElement as HTMLButtonElement);
          items[
            (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
          ]?.focus();
        }
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) onClose();
      }}
    >
      {children}
    </div>
  );
}

/** The action row under one answer: split primary, copy, re-answer. */
function AnswerActs({
  message,
  outline,
  recommendLay,
  kickoff,
  selected,
  onLay,
  onPromote,
  onRedo,
}: {
  message: ChatMessage;
  outline: OutlineItem[];
  /** The answer has an outline and the anchor has no children yet. */
  recommendLay: boolean;
  kickoff?: { onAccept: () => void; busy: boolean };
  selected: () => string;
  onLay: () => void;
  onPromote: (text: string) => void;
  onRedo?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Kickoff without an outline in the answer: AI drafts the first level.
  const lay =
    outline.length > 1 && !message.meta?.laid
      ? onLay
      : kickoff
        ? kickoff.onAccept
        : undefined;
  const primary = recommendLay || kickoff ? lay : undefined;
  return (
    <div className="acts">
      <span className="split">
        <button
          className="btn sm primary"
          disabled={kickoff?.busy}
          title={
            primary
              ? outline.length > 1
                ? `骨架 ${outline.length} 块铺成第一层`
                : "让 AI 拆出第一层"
              : "整段作为一张卡"
          }
          onClick={() => (primary ? primary() : onPromote(message.text))}
        >
          {kickoff?.busy ? (
            <LoaderCircle size={15} className="ico spin" />
          ) : (
            <Plus size={15} className="ico" />
          )}
          {kickoff?.busy
            ? "正在拆出第一层…"
            : kickoff && primary
              ? "铺成第一层"
              : "把回答加进地图"}
        </button>
        <button
          className="btn sm primary caret"
          aria-label="更多加入方式"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown size={14} />
        </button>
        {open && (
          <Menu className="acts-menu" onClose={() => setOpen(false)}>
            <button
              className="it"
              role="menuitem"
              disabled={!lay}
              onClick={() => lay?.()}
            >
              <Layers3 size={16} className="ico" />
              <span>
                铺成第一层{recommendLay || kickoff ? "（推荐）" : ""}
                <span className="sub">
                  {outline.length > 1
                    ? `骨架里的 ${outline.length} 块，各成一张卡`
                    : kickoff
                      ? "让 AI 按你的回答拆出来"
                      : "这条回答里没有骨架"}
                </span>
              </span>
            </button>
            <button
              className="it"
              role="menuitem"
              onClick={() => onPromote(message.text)}
            >
              <SquarePlus size={16} className="ico" />
              整段作为一张卡
            </button>
            <button
              className="it"
              role="menuitem"
              disabled={!selected()}
              onClick={() => onPromote(selected())}
            >
              <MessageSquareQuote size={16} className="ico" />
              <span>
                只加选中的部分
                <span className="sub">先在回答里选中一句</span>
              </span>
            </button>
          </Menu>
        )}
      </span>
      <button
        className="ib"
        title="复制"
        aria-label="复制这条回答"
        onClick={() => copy(message.text)}
      >
        <Copy size={16} />
      </button>
      {onRedo && (
        <button
          className="ib"
          title="重新回答"
          aria-label="重新回答"
          onClick={onRedo}
        >
          <RotateCcw size={16} />
        </button>
      )}
    </div>
  );
}

/** AI conversations live in a right-hand drawer, attached to a card or free. */
export function Drawer({
  note,
  anchor,
  anchorTitle,
  anchorHasChildren,
  refs,
  pending,
  busy,
  error,
  onChange,
  onAsk,
  kickoff,
  onStop,
  onPromote,
  onLay,
  onLocate,
  onRemove,
  onClose,
}: {
  note: StickyNote;
  /** The card this conversation hangs on; its diagram renders here, not on the card. */
  anchor?: ConceptNode;
  anchorTitle?: string;
  anchorHasChildren: boolean;
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
  /** Lay items as unseen cards under the anchor; with messageId, that answer counts as laid. */
  onLay: (items: OutlineItem[], messageId?: string) => void;
  onLocate: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [menu, setMenu] = useState(false);
  const [sel, setSel] = useState<{ text: string; x: number; y: number }>();
  const root = useRef<HTMLElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
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
  const answers = note.messages.filter((m) => m.role === "assistant");
  const lastAnswer = answers.at(-1);
  const lastQuestion = note.messages.filter((m) => m.role === "user").at(-1);
  const defaultTitle = kickoff
    ? "带我起步"
    : anchorTitle
      ? `关于「${anchorTitle}」`
      : "我的问题";
  const send = () => {
    if (!prompt.trim() || busy) return;
    if (onAsk(prompt.trim())) setPrompt("");
  };
  const selectedText = () => sel?.text ?? "";
  // Selecting text inside an answer floats a small ink toolbar above it.
  const onMouseUp = () => {
    const s = window.getSelection();
    const text = s?.toString().trim() ?? "";
    const box = root.current?.getBoundingClientRect();
    if (!s || !text || !box || s.rangeCount === 0) return setSel(undefined);
    const node = s.anchorNode;
    const el = node instanceof Element ? node : node?.parentElement;
    if (!el?.closest(".ans") || !root.current?.contains(el))
      return setSel(undefined);
    const r = s.getRangeAt(0).getBoundingClientRect();
    setSel({
      text,
      x: Math.min(
        Math.max(r.left + r.width / 2 - box.left, 120),
        box.width - 120,
      ),
      y: r.top - box.top - 8,
    });
  };
  useEffect(() => {
    if (!sel) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setSel(undefined);
    const down = (e: PointerEvent) =>
      !(e.target as Element).closest?.(".seltb") && setSel(undefined);
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", down);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", down);
    };
  }, [sel]);
  const conversation = () =>
    note.messages
      .map(
        (m) =>
          `${m.role === "user" ? "我" : "AI"}：${displayMessage(m.role, m.text)}`,
      )
      .join("\n\n");
  return (
    <aside
      ref={root}
      className="chrome drawer"
      aria-label="批注与提问"
      onMouseUp={onMouseUp}
    >
      <header className="dhead">
        <div className="t">
          <input
            ref={title}
            className="drawer-title"
            aria-label="批注标题"
            value={note.title}
            placeholder={defaultTitle}
            onChange={(e) => onChange({ title: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" || e.key === "Escape")
                e.currentTarget.blur();
            }}
          />
          <div className="m">
            <span>批注</span>
            <span className="dot" />
            <span>
              挂在{" "}
              <button className="link" onClick={onLocate} title="在画布上定位">
                {anchor && anchor.parentId !== null ? anchorTitle : "起点问题"}
              </button>
            </span>
            <span className="dot" />
            <span>{note.messages.length} 条消息</span>
          </div>
        </div>
        <span className="menu-anchor">
          <button
            className={`ib ${menu ? "on" : ""}`}
            title="更多"
            aria-label="更多操作"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <MoreHorizontal size={18} />
          </button>
          {menu && (
            <Menu onClose={() => setMenu(false)} onDelete={onRemove}>
              <button
                className="it"
                role="menuitem"
                onClick={() => setTimeout(() => title.current?.select(), 0)}
              >
                <Pencil size={16} className="ico" />
                重命名
              </button>
              <button className="it" role="menuitem" onClick={onLocate}>
                <Locate size={16} className="ico" />
                在画布上定位
              </button>
              <button
                className="it"
                role="menuitem"
                disabled={!note.messages.length}
                onClick={() => copy(conversation())}
              >
                <Copy size={16} className="ico" />
                复制整段对话
              </button>
              <div className="sepm" role="separator" />
              <button className="it danger" role="menuitem" onClick={onRemove}>
                <Delete size={16} className="ico" />
                删除这张批注
                <span className="kbd">⌫</span>
              </button>
            </Menu>
          )}
        </span>
        <button
          className="ib"
          title="关闭 Esc"
          aria-label="关闭"
          onClick={onClose}
        >
          <X size={18} />
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
          placeholder="写下你的理解，或一个没想通的地方……"
          rows={1}
          value={note.text}
          onChange={(e) => onChange({ text: e.target.value })}
        />
        {note.messages.map((m) => {
          if (m.role === "user")
            return (
              <div key={m.id} className="msg user bubble">
                {displayMessage(m.role, m.text)}
              </div>
            );
          const outline = outlineOf(m.text);
          const layItems = () => onLay(outline, m.id);
          return (
            <div key={m.id} className="msg assistant ans">
              <div className="who">
                <span>AI</span>
                <span>{clock(m.createdAt)}</span>
              </div>
              <AnswerBlocks
                text={m.text}
                actions={{
                  laid: m.meta?.laid,
                  onLocate,
                  onLay: outline.length > 1 ? layItems : undefined,
                  // “+” on one row: just that item, without marking the answer laid.
                  onAddItem: (item) => onLay([item]),
                  checked: m.meta?.checked,
                  onToggleStep: (i) => toggleStep(m.id, i),
                  onAnswerCheck: (text) => onAsk(text),
                }}
              />
              {!busy && (
                <AnswerActs
                  message={m}
                  outline={outline}
                  recommendLay={outline.length > 1 && !anchorHasChildren}
                  kickoff={m === lastAnswer ? kickoff : undefined}
                  selected={selectedText}
                  onLay={layItems}
                  onPromote={onPromote}
                  onRedo={
                    m === lastAnswer && lastQuestion
                      ? () => onAsk(lastQuestion.text)
                      : undefined
                  }
                />
              )}
            </div>
          );
        })}
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
        {kickoff && lastAnswer && !busy && (
          <span className="lab kickoff-tip">
            先在下面回答它的问题，拆得会更贴合你；也可以直接铺成第一层，之后再调整。
          </span>
        )}
      </div>
      {sel && (
        <div
          className="seltb"
          role="toolbar"
          aria-label="选中的文字"
          style={{ left: sel.x, top: sel.y }}
        >
          <button
            onClick={() => {
              onPromote(sel.text);
              setSel(undefined);
            }}
          >
            <Plus size={14} /> 加成卡片
          </button>
          <button
            onClick={() => {
              setPrompt(`> ${sel.text}\n${prompt}`);
              setSel(undefined);
              setTimeout(() => composer.current?.focus(), 0);
            }}
          >
            追问这句
          </button>
          <button
            onClick={() => {
              copy(sel.text);
              setSel(undefined);
            }}
          >
            复制
          </button>
        </div>
      )}
      <footer>
        <textarea
          ref={composer}
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
    </aside>
  );
}
