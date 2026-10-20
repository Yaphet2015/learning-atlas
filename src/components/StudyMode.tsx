import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Board, ConceptNode, Understanding } from "../shared/types";
import { layoutTree } from "../model/layout";
import { levelName } from "./LevelGuides";
import { Seal } from "./Seal";

const RATES: { s: Understanding; label: string }[] = [
  { s: "unseen", label: "还没懂" },
  { s: "exploring", label: "大概懂" },
  { s: "explained", label: "能讲给别人" },
];

/** 走一遍: walk the map level by level — predict → explain in my words → self-rate. */
export function StudyMode({
  board,
  startId,
  onRate,
  onPredict,
  onAskAI,
  onClose,
}: {
  board: Board;
  startId?: string;
  onRate: (id: string, status: Understanding, hand?: string) => void;
  onPredict: (id: string, prediction: string) => void;
  onAskAI: (id: string, explanation: string) => void;
  onClose: () => void;
}) {
  const { steps, levels, children } = useMemo(() => {
    const layout = layoutTree(board.nodes);
    const by = new Map(board.nodes.map((n) => [n.id, n]));
    const steps = board.nodes
      .filter((n) => n.parentId !== null && layout.positions.has(n.id))
      .sort((a, b) => {
        const pa = layout.positions.get(a.id)!,
          pb = layout.positions.get(b.id)!;
        return pa.level - pb.level || pa.x - pb.x;
      });
    const levels = new Map(
      steps.map((n) => [n.id, layout.positions.get(n.id)!.level]),
    );
    const children = (id: string) =>
      (layout.children.get(id) ?? []).map((c) => by.get(c)!);
    return { steps, levels, children };
  }, [board.nodes]);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      steps.findIndex((s) => s.id === startId),
    ),
  );
  const [drafts, setDrafts] = useState<Record<string, { explain: string }>>({});
  const node = steps[Math.min(index, steps.length - 1)];
  const go = (d: number) =>
    setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + d)));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.target as HTMLElement)?.matches("input,textarea")) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  if (!node) return null;
  const level = levels.get(node.id)!;
  const row = steps.filter((s) => levels.get(s.id) === level);
  const draft = drafts[node.id] ?? { explain: "" };
  const set = (patch: Partial<typeof draft>) =>
    setDrafts((d) => ({ ...d, [node.id]: { ...draft, ...patch } }));
  const prev = steps[index - 1],
    next = steps[index + 1];
  const kids = children(node.id);
  const Shadow = ({ n, side }: { n?: ConceptNode; side: string }) =>
    n ? (
      <button
        className={`shadow-card ${side} s-${n.status}`}
        onClick={() => go(side === "left" ? -1 : 1)}
      >
        {n.title}
      </button>
    ) : null;
  return (
    <div className="study" role="dialog" aria-label="走一遍">
      <nav className="study-steps">
        <span className="lab">问题 › {levelName(level)}</span>
        {row.map((s, i) => (
          <button
            key={s.id}
            className={s.id === node.id ? "on" : ""}
            onClick={() => setIndex(steps.indexOf(s))}
          >
            <i className={`dot s-${s.status}`}>
              {String(i + 1).padStart(2, "0")}
            </i>
            {s.title}
          </button>
        ))}
      </nav>
      <Shadow n={prev} side="left" />
      <Shadow n={next} side="right" />
      <article className={`chrome focus-card s-${node.status}`}>
        {node.status === "explained" && <Seal size={44} />}
        <span className="eyebrow">
          {levelName(level)} · 第 {row.indexOf(node) + 1} 个 ·{" "}
          {node.status === "unseen"
            ? "待探索"
            : node.status === "exploring"
              ? "探索中"
              : "我能解释"}
        </span>
        <span className="lab no">L{level}</span>
        <h1>{node.title}</h1>
        {node.body && <p className="lead">{node.body}</p>}
        <div className="study-cols">
          <label>
            <span className="lab">① 先预测</span>
            <span className="q">
              还没细看之前，猜一猜：「{node.title}」要解决什么？会产出什么？
            </span>
            <textarea
              value={node.prediction ?? ""}
              maxLength={2_000}
              onChange={(e) => onPredict(node.id, e.target.value)}
              placeholder="我猜……"
            />
          </label>
          <label>
            <span className="lab">② 用我的话解释</span>
            <textarea
              className="explain"
              value={draft.explain}
              onChange={(e) => set({ explain: e.target.value })}
              placeholder="讲给一个刚接触的人听……"
            />
          </label>
        </div>
        <footer>
          <span className="lab">③ 现在我</span>
          <div className="seg">
            {RATES.map((r) => (
              <button
                key={r.s}
                className={node.status === r.s ? "on" : ""}
                onClick={() =>
                  onRate(
                    node.id,
                    r.s,
                    draft.explain.trim()
                      ? `— ${draft.explain.trim().slice(0, 60)}`
                      : undefined,
                  )
                }
              >
                {r.label}
              </button>
            ))}
          </div>
          <span className="grow" />
          <button
            className="btn"
            disabled={!draft.explain.trim()}
            onClick={() => onAskAI(node.id, draft.explain.trim())}
          >
            <Sparkles size={15} className="ico accent" /> 请 AI 检查
          </button>
          {next ? (
            <button className="btn primary" onClick={() => go(1)}>
              下一站 · {next.title} <ArrowRight size={15} />
            </button>
          ) : (
            <button className="btn primary" onClick={onClose}>
              走完了，回到地图
            </button>
          )}
        </footer>
      </article>
      {kids.length > 0 && (
        <div className="study-below">
          <span className="lab">往下一层 · {levelName(level + 1)}</span>
          <div>
            {kids.map((k) => (
              <button
                key={k.id}
                className={`mini-card s-${k.status}`}
                onClick={() => setIndex(steps.indexOf(k))}
              >
                {k.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="study-keys lab">
        <kbd>Esc</kbd> 回到地图　<kbd>←</kbd> <kbd>→</kbd> 上一站 / 下一站
      </div>
    </div>
  );
}
