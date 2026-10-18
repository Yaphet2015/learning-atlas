import { useEffect, useMemo, useState } from "react";
import {
  MiniMap,
  useReactFlow,
  useViewport,
  type MiniMapNodeProps,
} from "@xyflow/react";
import {
  ChevronDown,
  Crosshair,
  Hand,
  Link2,
  Minus,
  MousePointer2,
  Plus,
  Scan,
  Settings2,
  Sparkles,
  SquarePen,
  StickyNote,
} from "lucide-react";
import type { BoardSummary, ConceptNode } from "../shared/types";
import { MOD } from "../model/shortcuts";

function Compass() {
  return (
    <svg
      viewBox="0 0 26 26"
      width="22"
      height="22"
      className="compass"
      aria-hidden="true"
    >
      <g>
        <circle
          cx="13"
          cy="13"
          r="11.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M13 2.8l2.2 10.2L13 23.2l-2.2-10.2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path d="M13 2.8l2.2 10.2h-4.4z" fill="var(--accent)" />
      </g>
    </svg>
  );
}

export function MapSwitcher({
  title,
  nodes,
  onOpen,
}: {
  title: string;
  nodes: ConceptNode[];
  onOpen: () => void;
}) {
  const concepts = nodes.filter((n) => n.parentId !== null);
  const explained = concepts.filter((n) => n.status === "explained").length;
  return (
    <button className="chrome switcher" onClick={onOpen} title="切换地图 ⌘K">
      <Compass />
      <span className="switcher-text">
        <strong title={title}>{title}</strong>
        <small>
          {concepts.length} 概念 · {explained} 能解释
        </small>
      </span>
      <ChevronDown size={15} className="ico" />
    </button>
  );
}

export function Palette({
  boards,
  notes = [],
  footer,
  currentId,
  onPick,
  onNote,
  onNew,
  onWalkthrough,
  onSettings,
  onClose,
}: {
  boards: BoardSummary[];
  notes?: { id: string; title: string }[];
  footer?: string;
  currentId?: string;
  onPick: (id: string) => void;
  onNote?: (id: string) => void;
  onNew: () => void;
  onWalkthrough: () => void;
  onSettings: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const items = useMemo(
    () => [
      ...boards
        .filter((b) => b.title.toLowerCase().includes(q.toLowerCase()))
        .map((b) => ({
          key: b.id,
          label: b.title,
          hint: b.kind === "walkthrough" ? "内置演练" : "我的探索",
          run: () => onPick(b.id),
          current: b.id === currentId,
        })),
      ...notes
        .filter((n) => n.title.toLowerCase().includes(q.toLowerCase()))
        .map((n) => ({
          key: "note:" + n.id,
          label: `批注 · ${n.title}`,
          hint: "N",
          run: () => onNote?.(n.id),
          current: false,
        })),
      {
        key: "+new",
        label: q.trim() ? `新的问题：${q.trim()}` : "新的问题…",
        hint: "⌘N",
        run: onNew,
        current: false,
      },
      {
        key: "+walk",
        label: "浏览器如何把代码变成画面？",
        hint: "内置演练",
        run: onWalkthrough,
        current: false,
      },
      {
        key: "+ai",
        label: "设置",
        hint: `${MOD}.`,
        run: onSettings,
        current: false,
      },
    ],
    [
      boards,
      notes,
      q,
      currentId,
      onPick,
      onNote,
      onNew,
      onWalkthrough,
      onSettings,
    ],
  );
  useEffect(() => setCursor(0), [q]);
  return (
    <div
      className="palette-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="chrome palette" role="dialog" aria-label="切换地图">
        <input
          autoFocus
          placeholder="找一张地图，或输入新问题…"
          aria-label="搜索地图"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown")
              setCursor((c) => Math.min(items.length - 1, c + 1));
            else if (e.key === "ArrowUp") setCursor((c) => Math.max(0, c - 1));
            else if (e.key === "Enter") items[cursor]?.run();
            else if (e.key === "Escape") onClose();
            else return;
            e.preventDefault();
          }}
        />
        <ul>
          {items.map((it, i) => (
            <li key={it.key}>
              <button
                className={`${i === cursor ? "cursor" : ""} ${it.current ? "current" : ""}`}
                onMouseEnter={() => setCursor(i)}
                onClick={it.run}
              >
                <span>{it.label}</span>
                <small className="lab">{it.hint}</small>
              </button>
            </li>
          ))}
        </ul>
        {footer && <p className="lab palette-foot">{footer}</p>}
      </section>
    </div>
  );
}

export function Progress({
  nodes,
  onStudy,
}: {
  nodes: ConceptNode[];
  onStudy: () => void;
}) {
  const concepts = nodes.filter((n) => n.parentId !== null);
  const done = concepts.filter((n) => n.status === "explained").length;
  return (
    <div className="chrome progress">
      <span className="lab">理解进度</span>
      {concepts.length > 16 ? (
        // Many concepts: one continuous bar, filled by share of each state.
        <span className="bar long" aria-hidden="true">
          {(["explained", "exploring", "unseen"] as const).map((st) => {
            const k = concepts.filter((n) => n.status === st).length;
            return k ? (
              <i key={st} className={`s-${st}`} style={{ flexGrow: k }} />
            ) : null;
          })}
        </span>
      ) : (
        <span className="bar" aria-hidden="true">
          {concepts.map((n) => (
            <i key={n.id} className={`s-${n.status}`} />
          ))}
        </span>
      )}
      <span
        className="count"
        aria-label={`${concepts.length} 个概念里讲清楚了 ${done} 个`}
      >
        <b>
          {done} / {concepts.length}
        </b>{" "}
        讲清楚
      </span>
      <button
        className="btn primary"
        onClick={onStudy}
        disabled={!concepts.length}
        title="走一遍 F"
      >
        <Scan size={16} className="ico" />
        走一遍 <kbd>F</kbd>
      </button>
    </div>
  );
}

export type Tool = "select" | "hand" | "link";
export function Dock({
  tool,
  setTool,
  onAddConcept,
  onNote,
  onAsk,
  onSettings,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  onAddConcept: () => void;
  onNote: () => void;
  onAsk: () => void;
  onSettings: () => void;
}) {
  const b = (t: Tool, label: string, key: string, icon: React.ReactNode) => (
    <button
      className={`b ${tool === t ? "on" : ""}`}
      title={`${label} ${key}`}
      aria-label={label}
      aria-pressed={tool === t}
      onClick={() => setTool(t)}
    >
      {icon}
    </button>
  );
  return (
    <nav className="chrome dock" aria-label="工具">
      {b("select", "选择", "V", <MousePointer2 size={18} className="ico" />)}
      {b("hand", "平移", "H", <Hand size={18} className="ico" />)}
      <span className="sep" />
      <button
        className="b"
        title="加概念 Tab"
        aria-label="加概念"
        onClick={onAddConcept}
      >
        <SquarePen size={18} className="ico" />
      </button>
      {b("link", "连线", "L", <Link2 size={18} className="ico" />)}
      <button className="b" title="批注 N" aria-label="批注" onClick={onNote}>
        <StickyNote size={18} className="ico" />
      </button>
      <span className="sep" />
      <button className="ask" onClick={onAsk} title="问一问 /">
        <Sparkles size={17} className="ico" />
        问一问 <kbd>/</kbd>
      </button>
      <button
        className="b small"
        title="设置"
        aria-label="设置"
        onClick={onSettings}
      >
        <Settings2 size={16} className="ico" />
      </button>
    </nav>
  );
}

function MiniNode({ x, y, width, height, className }: MiniMapNodeProps) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={20} // ≈ 2px at the minimap’s ~0.1 scale
      className={`mini-node ${className ?? ""}`}
    />
  );
}

/** Minimap and zoom controls as one unit, bottom-right. */
export function MapUnit() {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return (
    <div className="chrome map-unit">
      <MiniMap
        pannable
        zoomable
        position="top-left"
        className="atlas-minimap"
        // Match the CSS box so the viewBox has the same aspect ratio; otherwise the
        // mask's outer sub-path shows in the letterbox as a second frame.
        style={{ width: 194, height: 120 }}
        nodeComponent={MiniNode}
        nodeClassName={(n) =>
          n.type === "ghost"
            ? "ghost"
            : `s-${(n.data as { concept?: ConceptNode }).concept?.status ?? "exploring"}`
        }
        maskColor="transparent"
        maskStrokeColor="var(--accent)"
        maskStrokeWidth={1.25}
        bgColor="transparent"
      />
      <div className="zoom">
        <button
          aria-label="缩小"
          onClick={() => flow.zoomOut({ duration: 200 })}
        >
          <Minus size={15} className="ico" />
        </button>
        <span className="lab">{Math.round(zoom * 100)}%</span>
        <button
          aria-label="放大"
          onClick={() => flow.zoomIn({ duration: 200 })}
        >
          <Plus size={15} className="ico" />
        </button>
        <span className="sep" />
        <button
          aria-label="查看全图"
          title="查看全图 0"
          onClick={() => flow.fitView({ padding: 0.16, duration: 400 })}
        >
          <Crosshair size={15} className="ico" />
        </button>
      </div>
    </div>
  );
}
