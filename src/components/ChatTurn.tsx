// One assistant turn of the post-probe chat: a plain answer, then at most one proposal —
// an inline route diff (应用 / 取消, then 撤销) or a single 开始第 N 站 button.
import { ArrowRight, Copy, NotebookPen, Undo2 } from "lucide-react";
import type { Board, ChatMessage } from "../shared/types";
import { previewRoute, routeOf } from "../model/route";
import { AnswerBlocks } from "./AnswerBlocks";

export interface ChatActions {
  board: Board;
  onApply: (messageId: string) => void;
  onUndo: (messageId: string) => void;
  onCancel: (messageId: string) => void;
  onStart: (messageId: string) => void;
  onSave: (messageId: string) => void;
}

export function ChatTurn({ message, chat, busy, onCopy }: { message: ChatMessage; chat: ChatActions; busy: boolean; onCopy: () => void }) {
  const p = message.meta?.proposal;
  return (
    <>
      <AnswerBlocks text={message.text} />
      {p?.type === "editRoute" && <RouteDiff message={message} chat={chat} />}
      {p?.type === "startStop" && (() => {
        const stop = routeOf(chat.board).find((n) => n.id === p.stopId);
        const no = routeOf(chat.board).findIndex((n) => n.id === p.stopId) + 1;
        if (!stop) return null;
        if (p.state !== "pending")
          return <p className="chat-done">{p.state === "applied" ? `已开始第 ${no} 站` : "已过期"}</p>;
        return (
          <button className="btn primary chat-start" disabled={busy} onClick={() => chat.onStart(message.id)}>
            开始第 {no} 站 · {stop.title}
            <ArrowRight size={15} className="ico" />
          </button>
        );
      })()}
      {!p && !busy && (
        <div className="acts chat-acts">
          {message.meta?.savedNote ? (
            <span className="chat-saved">已存成批注卡</span>
          ) : (
            <button className="btn sm chat-save" onClick={() => chat.onSave(message.id)}>
              <NotebookPen size={14} className="ico" />
              存成批注卡
            </button>
          )}
          <button className="btn sm ghost" onClick={onCopy}>
            <Copy size={14} className="ico" />
            复制
          </button>
        </div>
      )}
    </>
  );
}

function RouteDiff({ message, chat }: { message: ChatMessage; chat: ChatActions }) {
  const p = message.meta?.proposal;
  if (p?.type !== "editRoute") return null;
  // Once applied, the board already shows the new route; the diff keeps its pre-apply snapshot.
  const rows = (p.rows ?? previewRoute(chat.board, p.ops)).filter((r) => r.kind !== "keep");
  const stale = p.state === "expired" || p.state === "cancelled";
  return (
    <div className={`route-diff ${stale ? "stale" : ""}`} role="group" aria-label="路线改动">
      <div className="rd-k">路线改动</div>
      <ol className="rd-rows">
        {rows.map((r, i) => (
          <li key={i} className={`rd-row ${r.kind}`}>
            {r.kind === "replace" && (
              <>
                <span className="rd-old"><s>{r.from} · {r.was}</s></span>
                <span className="rd-new">{r.to} · {r.title}</span>
                {r.archives && <span className="rd-note">已讲通，会归档</span>}
              </>
            )}
            {r.kind === "remove" && (
              <>
                <span className="rd-old"><s>{r.from} · {r.title}</s></span>
                {r.archives && <span className="rd-note">已讲通，会归档</span>}
              </>
            )}
            {r.kind === "add" && <span className="rd-new">＋ {r.to} · {r.title}<span className="rd-note">新站</span></span>}
            {r.kind === "move" && (
              <span className="rd-new">{r.to} · {r.title}<span className="rd-note">↑↓ 从第 {r.from} 站移来</span></span>
            )}
            {r.kind === "focus" && (
              <span className="rd-new">{r.to} · {r.title}<span className="rd-note">重点：{r.focus}</span></span>
            )}
          </li>
        ))}
      </ol>
      <div className="rd-acts">
        {p.state === "pending" && (
          <>
            <button className="btn primary sm" onClick={() => chat.onApply(message.id)}>应用</button>
            <button className="btn sm ghost" onClick={() => chat.onCancel(message.id)}>取消</button>
          </>
        )}
        {p.state === "applied" && (
          <>
            <span className="rd-state">已改路线</span>
            <button className="btn sm ghost" onClick={() => chat.onUndo(message.id)}>
              <Undo2 size={14} className="ico" />
              撤销
            </button>
          </>
        )}
        {p.state === "undone" && <span className="rd-state">已撤销</span>}
        {p.state === "cancelled" && <span className="rd-state">已取消</span>}
        {p.state === "expired" && <span className="rd-state">已过期</span>}
      </div>
    </div>
  );
}
