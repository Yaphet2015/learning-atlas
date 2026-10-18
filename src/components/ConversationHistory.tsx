import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "../api";
import type { ChatMessage, StickyNote } from "../shared/types";
import { completeMessages } from "../shared/transfer";

type ConversationHistoryProps = {
  boardId: string;
  note: StickyNote;
  onClose: () => void;
};

/** Read the complete transcript without enlarging the board's bounded message cache. */
export function ConversationHistory({
  boardId,
  note,
  onClose,
}: ConversationHistoryProps) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void api
      .getHistory(boardId, note.id)
      .then((history) => {
        if (!cancelled)
          setMessages(completeMessages(note.messages, history.messages));
      })
      .catch(() => {
        if (!cancelled) setError("无法读取完整对话，请关闭后重试。");
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, note.id]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="modal conversation-history"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
      >
        <button
          autoFocus
          className="modal-close icon-button"
          aria-label="关闭完整对话"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <h2 id="history-title">完整对话</h2>
        <p>
          {note.title} {messages && `· ${messages.length} 条消息`}
        </p>
        {!messages && !error && <p role="status">正在读取…</p>}
        {error && <p role="alert">{error}</p>}
        <div className="history-messages">
          {messages?.map((m) => (
            <article key={m.id}>
              <header>
                <strong>{m.role === "user" ? "我" : "AI"}</strong>
                <time dateTime={m.createdAt}>
                  {new Date(m.createdAt).toLocaleString()}
                </time>
              </header>
              <p>{m.text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
