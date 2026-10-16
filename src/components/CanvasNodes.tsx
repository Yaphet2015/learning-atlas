import { useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronRight,
  CornerDownLeft,
  Expand,
  MessageCircle,
  Plus,
  Send,
  Square,
  StickyNote as StickyIcon,
} from "lucide-react";
import type {
  ConceptNode,
  ContextReference,
  SceneState,
  StickyNote,
  VisualDiagram,
} from "../shared/types";
export type CanvasData = {
  [key: string]: unknown;
  concept?: ConceptNode;
  note?: StickyNote;
  scene?: SceneState;
  refs?: ContextReference[];
  pending?: string;
  error?: string;
  busy?: boolean;
  onExpand?: (id: string) => void;
  onNote?: (id: string) => void;
  onScene?: (patch: Partial<SceneState>) => void;
  onNoteChange?: (id: string, patch: Partial<StickyNote>) => void;
  onAsk?: (id: string, prompt: string) => boolean;
  onStop?: (id: string) => void;
  onPromote?: (id: string, text: string) => void;
  onDetach?: (id: string) => void;
};
export type CanvasNode = Node<CanvasData>;
function StructuredVisual({ visual }: { visual: VisualDiagram }) {
  return (
    <figure className={`structured-visual visual-${visual.kind}`}>
      <figcaption>
        <span>
          {visual.title ??
            (visual.kind === "process"
              ? "过程一览"
              : visual.kind === "parts"
                ? "拆开看组成"
                : "放在一起比较")}
        </span>
        <small>{visual.basis === "analogy" ? "类比示意" : "结构示意"}</small>
      </figcaption>
      <div className="visual-labels">
        {visual.labels.map((label, index) => (
          <div className="visual-item" key={index}>
            {visual.kind === "process" && (
              <span className="visual-sequence">
                {String(index + 1).padStart(2, "0")}
              </span>
            )}
            <span>{label}</span>
            {visual.kind === "process" && index < visual.labels.length - 1 && (
              <ArrowDown size={11} />
            )}
          </div>
        ))}
      </div>
      {visual.caption && <p>{visual.caption}</p>}
    </figure>
  );
}
function Ports() {
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}
export function ConceptCard({ data, selected }: NodeProps<CanvasNode>) {
  const n = data.concept!;
  return (
    <article
      className={`concept-card ${n.color} ${selected ? "is-selected" : ""}`}
    >
      <Ports />
      <div className="card-top">
        <span className="concept-symbol">{n.emoji}</span>
        <span className={`understanding ${n.status}`}>
          {n.status === "explained"
            ? "我能解释"
            : n.status === "exploring"
              ? "探索中"
              : "待探索"}
        </span>
      </div>
      <h3>{n.title}</h3>
      <p>{n.body}</p>
      {n.visual && <StructuredVisual visual={n.visual} />}
      <div className="card-actions nodrag nopan">
        <button onClick={() => data.onExpand?.(n.id)} disabled={n.expanded}>
          <Plus size={14} />
          {n.expanded ? "已展开" : "再看一层"}
        </button>
        <button
          className="icon-button"
          title="贴一张批注"
          aria-label={`批注 ${n.title}`}
          onClick={() => data.onNote?.(n.id)}
        >
          <StickyIcon size={15} />
        </button>
      </div>
    </article>
  );
}
export function SceneCard({ data, selected }: NodeProps<CanvasNode>) {
  const s = data.scene!;
  const [tab, setTab] = useState<"experiment" | "explain">("experiment");
  return (
    <article className={`scene-card ${selected ? "is-selected" : ""}`}>
      <Ports />
      <div className="scene-heading">
        <div>
          <span className="eyebrow">动手看一看 · 内置演练</span>
          <h2>一行 CSS，画面为什么变了？</h2>
        </div>
        <div className="scene-tabs nodrag nopan">
          <button
            className={tab === "experiment" ? "active" : ""}
            onClick={() => setTab("experiment")}
          >
            小实验
          </button>
          <button
            className={tab === "explain" ? "active" : ""}
            onClick={() => setTab("explain")}
          >
            我的理解
          </button>
        </div>
      </div>
      {tab === "experiment" ? (
        <>
          <div className="experiment-row nodrag nopan">
            <div className="code-lab">
              <span className="tiny-label">试着改变这个盒子</span>
              <div className="css-line">
                <span>width</span>
                <strong>{s.width}px</strong>
              </div>
              <input
                aria-label="盒子宽度"
                type="range"
                min="110"
                max="230"
                step="10"
                value={s.width}
                onChange={(e) =>
                  data.onScene?.({
                    width: Number(e.target.value),
                    changed: "width",
                  })
                }
              />
              <div className="css-line">
                <span>background</span>
                <div className="swatches">
                  {["#789b8d", "#dca779", "#8e9ec4"].map((c) => (
                    <button
                      key={c}
                      aria-label={`颜色 ${c}`}
                      className={s.color === c ? "selected" : ""}
                      style={{ background: c }}
                      onClick={() =>
                        data.onScene?.({ color: c, changed: "color" })
                      }
                    />
                  ))}
                </div>
              </div>
              <span className="code-comment">拖动宽度，再换个颜色</span>
            </div>
            <ArrowRight className="experiment-arrow" size={18} />
            <div className="browser-preview">
              <div className="browser-chrome">
                <i />
                <i />
                <i />
                <span>live preview</span>
              </div>
              <div className="preview-page">
                <div
                  className="preview-box"
                  style={{ width: s.width, background: s.color }}
                >
                  A little change.
                  <br />A different picture.
                </div>
                <div className="preview-follow">我会跟着盒子的高度移动 ↕</div>
              </div>
            </div>
          </div>
          <div className="pipeline nodrag nopan">
            <span className="pipeline-step">结构</span>
            <ChevronRight size={12} />
            <span className="pipeline-step">样式</span>
            <ChevronRight size={12} />
            <span
              className={`pipeline-step ${s.changed === "width" ? "lit layout" : ""}`}
            >
              布局 {s.changed === "width" && "↻"}
            </span>
            <ChevronRight size={12} />
            <span className={`pipeline-step ${s.changed ? "lit paint" : ""}`}>
              绘制 {s.changed && "↻"}
            </span>
            <span className="pipeline-caption">
              {s.changed === "width"
                ? "宽度改变 → 重新计算几何位置"
                : s.changed === "color"
                  ? "颜色改变 → 几何不变，更新绘制"
                  : "先预测：哪些步骤会重新发生？"}
            </span>
          </div>
          <input
            className="prediction-input nodrag nopan"
            aria-label="我的预测"
            placeholder="先猜一猜：改颜色与改宽度，区别在哪？（可跳过）"
            value={s.prediction}
            onChange={(e) => data.onScene?.({ prediction: e.target.value })}
          />
        </>
      ) : (
        <div className="explain-lab nodrag nopan">
          <span className="tiny-label">
            用自己的话，讲给一个刚接触网页的人听
          </span>
          <textarea
            aria-label="我的理解"
            placeholder="我认为改宽度会……因为……；而改颜色……"
            value={s.explanation}
            onChange={(e) => data.onScene?.({ explanation: e.target.value })}
          />
          <p>
            这段解释会留在你的白板。你可以把它放进批注，向 AI
            提问、找反例或修正地图。
          </p>
          <button
            className="subtle-button"
            onClick={() => data.onNote?.("scene-browser")}
          >
            <MessageCircle size={14} />
            带着解释提问
          </button>
        </div>
      )}
    </article>
  );
}
export function NoteCard({ data, selected }: NodeProps<CanvasNode>) {
  const n = data.note!;
  const [prompt, setPrompt] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const last = n.messages.filter((m) => m.role === "assistant").at(-1);
  const messages = showHistory ? n.messages : n.messages.slice(-2);
  function send() {
    if (!prompt.trim() || data.busy) return;
    if (data.onAsk?.(n.id, prompt.trim()) !== false) setPrompt("");
  }
  return (
    <article className={`note-card ${selected ? "is-selected" : ""}`}>
      <div className="note-header drag-handle">
        <StickyIcon size={15} />
        <span>{n.attachedTo ? "关联批注" : "自由批注"}</span>
        {n.attachedTo && (
          <button
            className="nodrag icon-button"
            title="解除关联"
            onClick={() => data.onDetach?.(n.id)}
          >
            ↗
          </button>
        )}
      </div>
      <div className="nodrag nopan note-inner">
        <input
          className="note-title"
          aria-label="批注标题"
          value={n.title}
          onChange={(e) => data.onNoteChange?.(n.id, { title: e.target.value })}
        />
        <textarea
          className="note-body"
          aria-label="批注内容"
          placeholder="留下一点发现，或者一个没想通的地方……"
          value={n.text}
          onChange={(e) => data.onNoteChange?.(n.id, { text: e.target.value })}
        />
        <div className="note-context">
          <span>AI 参考</span>
          {data.refs?.slice(0, 3).map((r) => (
            <span key={`${r.kind}-${r.id}`} title={r.text}>
              {r.kind === "topic" ? "起始问题" : r.title}
            </span>
          ))}
          {(data.refs?.length ?? 0) > 3 && (
            <span
              title={data.refs
                ?.slice(3)
                .map((r) => r.title)
                .join("、")}
            >
              +{data.refs!.length - 3}
            </span>
          )}
        </div>
        {!!messages.length && (
          <div className="note-conversation">
            {n.messages.length > 2 && (
              <button
                className="history-toggle"
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory
                  ? "收起对话"
                  : `查看之前 ${n.messages.length - 2} 条消息`}
              </button>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`note-message ${m.role}`}>
                <span>{m.role === "user" ? "你" : "AI"}</span>
                <p>{m.text}</p>
              </div>
            ))}
          </div>
        )}
        {data.pending && (
          <div className="note-message assistant streaming">
            <span>AI</span>
            <p>{data.pending}</p>
          </div>
        )}
        {data.busy && !data.pending && (
          <div className="thinking">
            <i />
            <i />
            <i />
            <span>正在看这片上下文</span>
          </div>
        )}
        {data.error && <div className="note-error">{data.error}</div>}
        {last && !data.busy && (
          <button
            className="promote-button"
            onClick={() => data.onPromote?.(n.id, last.text)}
          >
            <Plus size={13} />
            选取回答，加入地图
          </button>
        )}
        <div className="note-composer">
          <textarea
            aria-label="向 AI 提问"
            placeholder="问这里，也可以说说你的理解…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          {data.busy ? (
            <button title="停止回答" onClick={() => data.onStop?.(n.id)}>
              <Square size={14} />
            </button>
          ) : (
            <button
              title="发送提问"
              aria-label="发送提问"
              disabled={!prompt.trim()}
              onClick={send}
            >
              <ArrowRight size={16} />
            </button>
          )}
        </div>
        <div className="note-foot">回答留在这里，由你决定是否加入地图</div>
      </div>
    </article>
  );
}
