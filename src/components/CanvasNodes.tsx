import { useEffect, useRef, useState } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import {
  ArrowRight,
  ChevronRight,
  Image,
  Layers3,
  MessageCircle,
  PencilLine,
  Sparkles,
  StickyNote,
} from "lucide-react";
import type { ConceptNode, SceneState } from "../shared/types";
import { Seal } from "./Seal";

export type CardData = {
  [key: string]: unknown;
  concept: ConceptNode;
  /** Hierarchical "§1.2" index shown top-right. */
  no?: string;
  topic?: string;
  createdAt?: string;
  scene?: SceneState;
  editing?: boolean;
  linkMode?: boolean;
  dimmed?: boolean;
  /** The drawer is open on this card's note. */
  noteOpen?: boolean;
  onRename?: (id: string, title: string) => void;
  onEditDone?: () => void;
  onAddChild?: (id: string) => void;
  onAddSibling?: (id: string) => void;
  onPreviewAdd?: (id: string | null) => void;
  onScene?: (patch: Partial<SceneState>) => void;
  onNote?: (id: string) => void;
  onStatus?: (id: string, status: ConceptNode["status"]) => void;
  onStartEdit?: (id: string) => void;
  onAsk?: (id: string) => void;
  onExpand?: (id: string) => void;
  canExpand?: boolean;
  /** Root only, while an AI board has no first level yet: the obvious next step. */
  onKickoff?: () => void;
  kickoffStarted?: boolean;
};
export type GhostData = { [key: string]: unknown; w: number };
export type CardNode = Node<CardData, "concept" | "root">;
export type GhostNode = Node<GhostData, "ghost">;
export type CanvasNode = CardNode | GhostNode;

function Ports({ linkMode }: { linkMode?: boolean }) {
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        id="t"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="b"
        isConnectable={false}
      />
      {linkMode && (
        <Handle
          type="source"
          position={Position.Right}
          id="link"
          className="link-handle"
        />
      )}
    </>
  );
}

/** Card title; double-click or F2 turns it into an input. */
function Title({ data, as: Tag }: { data: CardData; as: "h2" | "h3" }) {
  const n = data.concept;
  const [draft, setDraft] = useState(n.title);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(n.title), [n.title, data.editing]);
  useEffect(() => {
    if (!data.editing) return;
    // React Flow moves focus to the node wrapper on select; take it back.
    const t = setTimeout(() => {
      input.current?.focus();
      input.current?.select();
    }, 30);
    return () => clearTimeout(t);
  }, [data.editing]);
  if (data.editing)
    return (
      <input
        ref={input}
        className="title-input nodrag nopan"
        aria-label="概念标题"
        value={draft}
        maxLength={160}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim()) data.onRename?.(n.id, draft.trim());
          data.onEditDone?.();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
        }}
      />
    );
  if (Tag === "h3") return <h3>{n.title}</h3>;
  // A bracketed aside in the root question gets its own quieter line.
  const text = data.topic ?? n.title;
  const m = text.match(/^(.+?)([（(].+[）)])$/);
  return m ? (
    <h2>
      {m[1]}
      <span className="sub">{m[2]}</span>
    </h2>
  ) : (
    <h2>{text}</h2>
  );
}

/** Hangs on the card the drawer is talking about. */
const NoteTab = () => (
  <span className="note-tab" aria-hidden="true">
    <StickyNote size={13} className="ico" />
    批注
  </span>
);

function AddHandles({ data }: { data: CardData }) {
  const id = data.concept.id;
  return (
    <>
      <button
        className="plus below nodrag nopan"
        title="加子概念 Tab"
        aria-label="加子概念"
        onMouseEnter={() => data.onPreviewAdd?.(id)}
        onMouseLeave={() => data.onPreviewAdd?.(null)}
        onClick={(e) => {
          e.stopPropagation();
          data.onAddChild?.(id);
        }}
      >
        +
      </button>
      {data.concept.parentId && (
        <button
          className="plus right nodrag nopan"
          title="加并列概念 Enter"
          aria-label="加并列概念"
          onClick={(e) => {
            e.stopPropagation();
            data.onAddSibling?.(id);
          }}
        >
          +
        </button>
      )}
    </>
  );
}

const STATUS: [ConceptNode["status"], string][] = [
  ["unseen", "待探索"],
  ["exploring", "探索中"],
  ["explained", "我能解释"],
];
/**
 * Selection toolbar under the card. It carries an opaque paper halo so the tree
 * line leaving the card bottom passes *behind* it instead of through it.
 */
function SelectToolbar({
  data,
  visible,
}: {
  data: CardData;
  visible: boolean;
}) {
  const n = data.concept;
  return (
    <NodeToolbar
      isVisible={visible}
      position={Position.Bottom}
      offset={20}
      className="select-toolbar"
    >
      <div className="seg" role="radiogroup" aria-label="掌握度">
        {STATUS.map(([s, label]) => (
          <button
            key={s}
            role="radio"
            aria-checked={n.status === s}
            className={n.status === s ? "on" : ""}
            onClick={() => data.onStatus?.(n.id, s)}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="sep" />
      <button
        className="icon"
        title="改标题 F2"
        aria-label="改标题"
        onClick={() => data.onStartEdit?.(n.id)}
      >
        <PencilLine size={15} className="ico" />
      </button>
      {data.canExpand && (
        <button
          className="icon"
          title="再看一层"
          aria-label="再看一层"
          onClick={() => data.onExpand?.(n.id)}
        >
          <Layers3 size={15} className="ico" />
        </button>
      )}
      <button
        className="icon accent"
        title="问一问 /"
        aria-label="问一问"
        onClick={() => data.onAsk?.(n.id)}
      >
        <Sparkles size={15} className="ico" />
      </button>
    </NodeToolbar>
  );
}

export function ConceptCard({ data, selected }: NodeProps<CardNode>) {
  const n = data.concept;
  // Stamp only when the status changes while mounted, not on first paint.
  const first = useRef(n.status);
  const animate = first.current !== n.status;
  return (
    <article
      className={`card s-${n.status} ${selected || data.noteOpen ? "is-selected" : ""} ${animate ? "animate" : ""} ${data.dimmed ? "dimmed" : ""}`}
    >
      {data.noteOpen && <NoteTab />}
      <Ports linkMode={data.linkMode} />
      {n.status === "explained" && <Seal />}
      {data.no && <span className="no">{data.no}</span>}
      <Title data={data} as="h3" />
      {n.body && <p>{n.body}</p>}
      {(n.visual || n.hand) && (
        <div className="meta">
          {n.visual && (
            <button
              className="chip-fig nodrag nopan"
              title="在批注里看图示"
              onClick={(e) => {
                e.stopPropagation();
                data.onNote?.(n.id);
              }}
            >
              <Image size={13} className="ico" />
              含图示
            </button>
          )}
          {n.hand && <span className="hand">{n.hand}</span>}
        </div>
      )}
      {!data.linkMode && <AddHandles data={data} />}
      <SelectToolbar data={data} visible={!!selected && !data.editing} />
    </article>
  );
}

const dateLabel = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

export function RootCard({ data, selected }: NodeProps<CardNode>) {
  const n = data.concept;
  const [open, setOpen] = useState(false);
  return (
    <article
      className={`origin ${selected || data.noteOpen ? "is-selected" : ""}`}
    >
      {data.noteOpen && <NoteTab />}
      <Ports linkMode={data.linkMode} />
      <div className="origin-head">
        <span className="eyebrow">起点 · 问题</span>
        <span className="date">{dateLabel(data.createdAt)}</span>
      </div>
      <Title data={data} as="h2" />
      {n.kind === "scene" && data.scene && (
        <>
          <button
            className="text-button nodrag nopan"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
          >
            {open ? "收起小实验" : "动手看一看 · 改一行 CSS"}
            <ChevronRight size={13} className={open ? "rot" : ""} />
          </button>
          {open && (
            <div className="scene-body nodrag nopan">
              <SceneExperiment
                scene={data.scene}
                onScene={(p) => data.onScene?.(p)}
                onNote={() => data.onNote?.(n.id)}
              />
            </div>
          )}
        </>
      )}
      {data.onKickoff && (
        <div className="kickoff nodrag nopan">
          <button
            className="btn kickoff-btn"
            onClick={(e) => {
              e.stopPropagation();
              data.onKickoff?.();
            }}
          >
            <Sparkles size={15} className="ico" />
            {data.kickoffStarted ? "继续：AI 带我开始" : "让 AI 带我开始"}
          </button>
          <span className="lab">
            AI 先问你知道些什么，再提出第一层子问题，由你决定放上画布。
          </span>
        </div>
      )}
      {!data.linkMode && <AddHandles data={data} />}
    </article>
  );
}

/** Insertion preview: a vermilion dashed slot. */
export function GhostCard({ data }: NodeProps<GhostNode>) {
  return <div className="ghost" style={{ width: data.w }} />;
}

export function SceneExperiment({
  scene: s,
  onScene,
  onNote,
}: {
  scene: SceneState;
  onScene: (patch: Partial<SceneState>) => void;
  onNote: () => void;
}) {
  const [tab, setTab] = useState<"experiment" | "explain">("experiment");
  return (
    <div className="scene">
      <div className="seg">
        <button
          className={tab === "experiment" ? "on" : ""}
          onClick={() => setTab("experiment")}
        >
          小实验
        </button>
        <button
          className={tab === "explain" ? "on" : ""}
          onClick={() => setTab("explain")}
        >
          我的理解
        </button>
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
                  onScene({
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
                      onClick={() => onScene({ color: c, changed: "color" })}
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
            onChange={(e) => onScene({ prediction: e.target.value })}
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
            onChange={(e) => onScene({ explanation: e.target.value })}
          />
          <p>
            这段解释会留在你的白板。你可以把它放进批注，向 AI
            提问、找反例或修正地图。
          </p>
          <button className="subtle-button" onClick={() => onNote()}>
            <MessageCircle size={14} />
            带着解释提问
          </button>
        </div>
      )}
    </div>
  );
}
