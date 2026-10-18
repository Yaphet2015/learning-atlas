import { useEffect, useMemo, useState } from "react";
import {
  MiniMap,
  useReactFlow,
  useViewport,
  type MiniMapNodeProps,
} from "@xyflow/react";
import {
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
import { tip } from "./Tooltip";

export function Palette({
  boards,
  footer,
  currentId,
  onPick,
  onNew,
  onWalkthrough,
  onSettings,
  onClose,
}: {
  boards: BoardSummary[];
  footer?: string;
  currentId?: string;
  onPick: (id: string) => void;
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
    [boards, q, currentId, onPick, onNew, onWalkthrough, onSettings],
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
      {...tip(label, key)}
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
      <button className="b" {...tip("加概念", "Tab")} onClick={onAddConcept}>
        <SquarePen size={18} className="ico" />
      </button>
      {b("link", "连线", "L", <Link2 size={18} className="ico" />)}
      <button className="b" {...tip("批注", "N")} onClick={onNote}>
        <StickyNote size={18} className="ico" />
      </button>
      <span className="sep" />
      <button className="ask" onClick={onAsk}>
        <Sparkles size={17} className="ico" />
        问一问 <kbd>/</kbd>
      </button>
      <button
        className="b small"
        {...tip("设置", `${MOD}.`)}
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

/**
 * Zoom controls, bottom-right, always visible. The minimap floats above them only while the
 * canvas is being panned (or the hand tool is on) and fades out shortly after.
 */
export function MapUnit({ showMap }: { showMap: boolean }) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  // Keep the map up while the learner drags inside it.
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!held) return;
    const up = () => setHeld(false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [held]);
  const visible = showMap || held;
  return (
    <div className="map-unit">
      <div
        className={`chrome minimap-card ${visible ? "on" : ""}`}
        aria-hidden={!visible}
        data-visible={visible}
        onPointerDown={() => setHeld(true)}
      >
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
      </div>
      <div className="chrome zoom">
        <button
          {...tip("缩小")}
          onClick={() => flow.zoomOut({ duration: 200 })}
        >
          <Minus size={15} className="ico" />
        </button>
        <span className="lab">{Math.round(zoom * 100)}%</span>
        <button {...tip("放大")} onClick={() => flow.zoomIn({ duration: 200 })}>
          <Plus size={15} className="ico" />
        </button>
        <span className="sep" />
        <button
          {...tip("查看全图", "0")}
          onClick={() => flow.fitView({ padding: 0.16, duration: 400 })}
        >
          <Crosshair size={15} className="ico" />
        </button>
      </div>
    </div>
  );
}
