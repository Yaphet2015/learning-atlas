import { useState, type ReactElement } from "react";
import {
  BookOpen,
  Check,
  Compass,
  Download,
  HardDrive,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Upload,
  Waypoints,
} from "lucide-react";
import type { BoardSummary } from "../shared/types";
import { MOD } from "../model/shortcuts";
import { tip } from "./Tooltip";

type WorkspaceSidebarProps = {
  boards: BoardSummary[];
  currentId: string;
  collapsed: boolean;
  switchingId: string | null;
  saveStatus: "saved" | "saving" | "error";
  desktop: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
  onNew: () => void;
  onSearch: () => void;
  onImport: () => void;
  onExport: () => void;
  transferBusy: boolean;
};

/** Each entry selects the whole knowledge canvas and its conversations. */
export function WorkspaceSidebar({
  boards,
  currentId,
  collapsed,
  switchingId,
  saveStatus,
  desktop,
  onToggle,
  onPick,
  onNew,
  onSearch,
  onImport,
  onExport,
  transferBusy,
}: WorkspaceSidebarProps): ReactElement {
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const search = query.trim().toLocaleLowerCase();
  const visibleBoards = collapsed
    ? boards
    : boards.filter((b) => b.title.toLocaleLowerCase().includes(search));
  const hoveredIndex = visibleBoards.findIndex((b) => b.id === hoveredId);
  let savedLabel = desktop ? "已保存在这台 Mac" : "已保存在此浏览器";
  let StatusIcon = Check;
  if (saveStatus === "saving") {
    savedLabel = "正在保存…";
    StatusIcon = LoaderCircle;
  } else if (saveStatus === "error") {
    savedLabel = "保存失败";
    StatusIcon = HardDrive;
  }

  return (
    <aside
      className="chrome workspace-sidebar"
      aria-label="学习空间"
      onKeyDown={(e) => {
        if (e.key === "Tab" || e.key === "Enter") e.stopPropagation();
      }}
    >
      <header className="workspace-header">
        <span className="workspace-brand">
          <Compass size={23} strokeWidth={1.5} className="ico" />
          <span className="workspace-copy">Studyboard</span>
        </span>
        <button
          className="workspace-toggle"
          {...tip(collapsed ? "展开左侧边栏" : "收起左侧边栏", `${MOD}\\`)}
          aria-expanded={!collapsed}
          aria-controls="workspace-navigation"
          onClick={onToggle}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
      </header>
      <div className="workspace-actions">
        <button
          className="workspace-action workspace-new"
          {...tip("新建画布", `${MOD}N`)}
          onClick={onNew}
          disabled={switchingId !== null}
        >
          <Plus size={18} className="ico" />
          <span className="workspace-copy">新建画布</span>
          <kbd className="workspace-copy">{MOD}N</kbd>
        </button>
        {collapsed ? (
          <button
            className="workspace-action"
            {...tip("搜索知识画布", `${MOD}K`)}
            onClick={onSearch}
          >
            <Search size={17} className="ico" />
          </button>
        ) : (
          <label className="workspace-search">
            <Search size={16} className="ico" />
            <input
              aria-label="搜索知识画布"
              placeholder="搜索画布…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setQuery("");
                  e.currentTarget.blur();
                }
              }}
            />
          </label>
        )}
      </div>
      <div className="workspace-section workspace-copy">
        <span>知识画布</span>
        <span>{boards.length}</span>
      </div>
      <nav
        id="workspace-navigation"
        className="workspace-navigation"
        aria-label="知识画布"
        aria-busy={switchingId !== null}
      >
        <div
          className="workspace-board-list"
          onPointerLeave={() => setHoveredId(null)}
        >
          {hoveredIndex >= 0 && (
            <span
              className="workspace-hover"
              aria-hidden="true"
              style={{ transform: `translateY(${hoveredIndex * 44}px)` }}
            />
          )}
          <ul>
            {visibleBoards.map((b) => {
              const Icon = b.kind === "walkthrough" ? BookOpen : Waypoints;
              return (
                <li key={b.id}>
                  <button
                    className="workspace-board"
                    aria-label={b.title}
                    title={b.title}
                    data-tip={collapsed ? b.title : undefined}
                    aria-current={b.id === currentId ? "page" : undefined}
                    disabled={switchingId !== null}
                    onPointerEnter={() => setHoveredId(b.id)}
                    onClick={() => onPick(b.id)}
                  >
                    {switchingId === b.id ? (
                      <LoaderCircle size={17} className="ico spin" />
                    ) : (
                      <Icon size={17} className="ico" />
                    )}
                    <span className="workspace-copy workspace-board-title">
                      {b.title}
                    </span>
                    {b.id === currentId && (
                      <span className="workspace-current" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {!visibleBoards.length && (
          <p className="workspace-empty">没有找到画布，换个词试试。</p>
        )}
      </nav>
      <div className="workspace-transfer">
        <button
          className="workspace-action"
          {...tip("导入画板")}
          disabled={transferBusy || switchingId !== null}
          onClick={onImport}
        >
          <Upload size={17} className="ico" />
          <span className="workspace-copy">导入画板</span>
        </button>
        <button
          className="workspace-action"
          {...tip("导出当前画板")}
          disabled={transferBusy || switchingId !== null}
          onClick={onExport}
        >
          <Download size={17} className="ico" />
          <span className="workspace-copy">导出当前画板</span>
        </button>
      </div>
      <footer className="workspace-footer" data-tip={savedLabel}>
        <StatusIcon
          size={16}
          className={`ico ${saveStatus === "saving" ? "spin" : ""}`}
        />
        <span className="workspace-copy">{savedLabel}</span>
      </footer>
    </aside>
  );
}
