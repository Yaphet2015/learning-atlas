import { useMemo, useState } from "react";
import type { Board, Understanding } from "../shared/types";
import { layoutTree } from "../model/layout";
import { isQuestionRoot } from "../model/kickoff";
import { Seal } from "./Seal";

const NEXT: Record<Understanding, Understanding> = {
  unseen: "exploring",
  exploring: "explained",
  explained: "unseen",
};

/** Mobile: a vertical outline, indentation = level; the icon is the card state in miniature. */
export function Outline({
  board,
  onStatus,
  onOpen,
  onStudy,
}: {
  board: Board;
  onStatus: (id: string, status: Understanding) => void;
  onOpen: () => void;
  onStudy: () => void;
}) {
  const rows = useMemo(() => {
    const layout = layoutTree(board.nodes);
    const by = new Map(board.nodes.map((n) => [n.id, n]));
    const out: { id: string; level: number }[] = [];
    const walk = (id: string, level: number) => {
      out.push({ id, level });
      for (const c of layout.children.get(id) ?? []) walk(c, level + 1);
    };
    for (const r of layout.rootIds) walk(r, 0);
    return out.map((r) => ({ ...r, n: by.get(r.id)! }));
  }, [board.nodes]);
  const [open, setOpen] = useState<string | null>(null);
  const concepts = rows.filter((r) => r.level > 0);
  const done = concepts.filter((r) => r.n.status === "explained").length;
  return (
    <main className="outline">
      <header>
        <button className="outline-title" onClick={onOpen}>
          {board.title} ▾
        </button>
        <span className="lab">
          {done}/{concepts.length} 能解释
        </span>
      </header>
      <ol>
        {rows.map(({ n, level }) =>
          level === 0 ? (
            <li key={n.id} className="outline-root">
              <span className="eyebrow">起点 · 问题</span>
              <h1>{isQuestionRoot(board.nodes, n) ? board.topic : n.title}</h1>
            </li>
          ) : (
            <li
              key={n.id}
              style={{ "--lvl": level } as React.CSSProperties}
              className={`row s-${n.status}`}
            >
              <button
                className="state"
                aria-label={`切换掌握度：${n.title}`}
                onClick={() => onStatus(n.id, NEXT[n.status])}
              >
                <i />
              </button>
              <button
                className="row-body"
                onClick={() => setOpen(open === n.id ? null : n.id)}
              >
                <strong>{n.title}</strong>
                {n.status === "explained" && <Seal size={16} />}
                {open === n.id && n.body && <p>{n.body}</p>}
                {open === n.id && n.hand && (
                  <span className="hand">{n.hand}</span>
                )}
              </button>
            </li>
          ),
        )}
      </ol>
      <button className="btn primary outline-study" onClick={onStudy}>
        走一遍
      </button>
    </main>
  );
}
