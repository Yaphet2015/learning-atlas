import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ChevronRight,
  Compass,
  LoaderCircle,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import type { BoardSummary } from "../shared/types";
import { api } from "../api";
import {
  listSessions,
  sessionClock,
  type SessionEntry,
} from "../model/sessions";
import { MOD } from "../model/shortcuts";
import { tip } from "./Tooltip";

export const SIDEBAR_DEFAULT_WIDTH = 256;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 400;

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

type WorkspaceSidebarProps = {
  boards: BoardSummary[];
  currentId: string;
  collapsed: boolean;
  switchingId: string | null;
  width: number;
  onWidthChange: (width: number) => void;
  onResizingChange: (resizing: boolean) => void;
  onToggle: () => void;
  onPick: (id: string) => void;
  onArchive: (id: string) => void;
  onNew: () => void;
  onSearch: () => void;
  onSettings: () => void;
  sessions: SessionEntry[];
  currentSessionId?: string;
  onOpenSession: (boardId: string, sessionId: string) => void;
  onNewSession: () => void;
};

type BoardGroupProps = {
  board: BoardSummary;
  current: boolean;
  collapsed: boolean;
  switchingId: string | null;
  sessions: SessionEntry[];
  currentSessionId?: string;
  onPick: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenSession: (sessionId: string) => void;
  onNewSession: () => void;
};

type SessionLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: SessionEntry[] };

function BoardGroup({
  board,
  current,
  collapsed,
  switchingId,
  sessions,
  currentSessionId,
  onPick,
  onContextMenu,
  onOpenSession,
  onNewSession,
}: BoardGroupProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SessionLoadState>({
    status: "loading",
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (current || !expanded || collapsed) return;
    let cancelled = false;
    setSavedSessions({ status: "loading" });
    void api.loadBoard(board.id).then(
      (value) => {
        if (cancelled) return;
        if (value) {
          setSavedSessions({ status: "ready", entries: listSessions(value) });
        } else {
          setSavedSessions({ status: "error", message: "画布不存在" });
        }
      },
      () => {
        if (!cancelled)
          setSavedSessions({ status: "error", message: "无法读取对话" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [board.id, board.updatedAt, current, expanded, collapsed, retry]);
  const sessionState: SessionLoadState = current
    ? { status: "ready", entries: sessions }
    : savedSessions;
  const disabled = switchingId !== null;
  const activeSessionId = current ? currentSessionId : undefined;
  let sessionItems: ReactNode;
  if (sessionState.status === "error") {
    sessionItems = (
      <li className="workspace-empty" role="alert">
        {sessionState.message}。
        <button onClick={() => setRetry((value) => value + 1)}>重试</button>
      </li>
    );
  } else if (sessionState.status === "loading") {
    sessionItems = (
      <li className="workspace-empty" role="status">
        正在读取对话…
      </li>
    );
  } else if (!sessionState.entries.length) {
    sessionItems = <li className="workspace-empty">还没有对话</li>;
  } else {
    sessionItems = sessionState.entries.map((session) => (
      <li key={session.id}>
        <button
          className="workspace-session"
          title={`${session.title} · ${session.anchorTitle} · ${sessionClock(session.time)}`}
          aria-current={session.id === activeSessionId ? "true" : undefined}
          disabled={disabled}
          onClick={() => onOpenSession(session.id)}
        >
          <MessageSquare size={14} className="ico" />
          <span>{session.title}</span>
        </button>
      </li>
    ));
  }
  return (
    <li>
      <div className="workspace-board-row">
        {!collapsed && (
          <button
            className="workspace-disclosure"
            aria-label={`${expanded ? "收起" : "展开"}${board.title}的对话`}
            aria-expanded={expanded}
            aria-controls={`board-sessions-${board.id}`}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronRight size={14} />
          </button>
        )}
        <button
          className={`workspace-board ${board.done ? "is-done" : ""}`}
          aria-label={board.title}
          title={board.title}
          data-tip={collapsed ? board.title : undefined}
          aria-current={current ? "page" : undefined}
          disabled={disabled}
          onClick={onPick}
          onContextMenu={onContextMenu}
        >
          {collapsed ? (
            <>
              {switchingId === board.id ? (
                <LoaderCircle size={14} className="ico spin" />
              ) : (
                <span className="workspace-initial" aria-hidden="true">
                  {Array.from(board.title)[0]}
                </span>
              )}
              {!!board.total && (
                <i
                  className="workspace-rail-bar"
                  aria-hidden="true"
                  style={{ ["--p" as string]: `${Math.round(((board.sealed ?? 0) / board.total) * 100)}%` }}
                />
              )}
            </>
          ) : (
            <>
              <span className="workspace-copy workspace-board-title">{board.title}</span>
              <span className="workspace-meta">
                {board.done ? (
                  <span className="workspace-done">
                    <span aria-hidden="true">A</span> 全部讲通
                  </span>
                ) : board.total ? (
                  <>
                    <Segments sealed={board.sealed ?? 0} total={board.total} />
                    <span className="workspace-count">
                      {board.sealed ?? 0}/{board.total}
                    </span>
                  </>
                ) : (
                  <span className="workspace-count">还没有卡片</span>
                )}
                <span className="workspace-date">
                  {switchingId === board.id ? (
                    <LoaderCircle size={12} className="ico spin" />
                  ) : (
                    relativeDay(board.updatedAt)
                  )}
                </span>
              </span>
            </>
          )}
        </button>
      </div>
      {!collapsed && (
        <ul
          id={`board-sessions-${board.id}`}
          className="workspace-sessions"
          aria-label={`${board.title}的对话`}
          hidden={!expanded}
        >
          {sessionItems}
          {current && (
            <li>
              <button
                className="workspace-session workspace-new-session"
                disabled={disabled}
                onClick={onNewSession}
              >
                <Plus size={14} className="ico" />
                新对话
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/** One segment per card (a long list becomes one proportional bar); sealed segments are filled. */
function Segments({ sealed, total }: { sealed: number; total: number }): ReactElement {
  if (total > 12)
    return (
      <span className="workspace-segs long" aria-hidden="true">
        <i className="on" style={{ flexGrow: sealed }} />
        <i style={{ flexGrow: total - sealed }} />
      </span>
    );
  return (
    <span className="workspace-segs" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < sealed ? "on" : ""} />
      ))}
    </span>
  );
}

/** 今天 / 昨天 / 10月15日, in local time. */
export function relativeDay(iso: string, today = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(today) - day(d)) / 86_400_000);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** Each entry selects the whole knowledge canvas and its conversations. */
export function WorkspaceSidebar({
  boards,
  currentId,
  collapsed,
  switchingId,
  width,
  onWidthChange,
  onResizingChange,
  onToggle,
  onPick,
  onArchive,
  onNew,
  onSearch,
  onSettings,
  sessions,
  currentSessionId,
  onOpenSession,
  onNewSession,
}: WorkspaceSidebarProps): ReactElement {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{
    id: string;
    x: number;
    y: number;
    trigger: HTMLButtonElement;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    function dismiss(event: Event): void {
      if (
        event.target instanceof Node &&
        menuRef.current?.contains(event.target)
      )
        return;
      setMenu(null);
    }
    function escape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setMenu(null);
      menu?.trigger.focus();
    }
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, [menu]);
  const resizeOrigin = useRef<{ x: number; width: number } | null>(null);
  function stopResizing(): void {
    if (!resizeOrigin.current) return;
    resizeOrigin.current = null;
    onResizingChange(false);
  }
  useEffect(() => {
    if (collapsed) {
      resizeOrigin.current = null;
      onResizingChange(false);
    }
    return () => onResizingChange(false);
  }, [collapsed, onResizingChange]);
  const search = query.trim().toLocaleLowerCase();
  const visibleBoards = collapsed
    ? boards
    : boards.filter((b) => b.title.toLocaleLowerCase().includes(search));

  const row = (b: BoardSummary): ReactElement => (
    <BoardGroup
      key={b.id}
      board={b}
      current={b.id === currentId}
      collapsed={collapsed}
      switchingId={switchingId}
      sessions={sessions}
      currentSessionId={currentSessionId}
      onPick={() => onPick(b.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        if (switchingId !== null) return;
        const box = event.currentTarget.getBoundingClientRect();
        setMenu({
          id: b.id,
          x: Math.max(
            8,
            Math.min(
              event.clientX || box.left,
              window.innerWidth - 184,
            ),
          ),
          y: Math.max(
            8,
            Math.min(
              event.clientY || box.bottom,
              window.innerHeight - 56,
            ),
          ),
          trigger: event.currentTarget,
        });
      }}
      onOpenSession={(id) => onOpenSession(b.id, id)}
      onNewSession={onNewSession}
    />
  );
  const groups = [
    { key: "active", label: "进行中", items: visibleBoards.filter((b) => !b.done) },
    { key: "done", label: "已完成", items: visibleBoards.filter((b) => b.done) },
  ];

  return (
    <aside
      className="workspace-sidebar"
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
          className="workspace-icon workspace-new"
          {...tip("新建画布", `${MOD}N`)}
          onClick={onNew}
          disabled={switchingId !== null}
        >
          <Plus size={17} />
        </button>
        <button
          className="workspace-toggle"
          {...tip(collapsed ? "展开左侧边栏" : "收起左侧边栏", `${MOD}\\`)}
          aria-expanded={!collapsed}
          aria-controls="workspace-navigation"
          onClick={onToggle}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </header>
      <div className="workspace-actions">
        {collapsed ? (
          <button className="workspace-icon" {...tip("搜索画布与卡片", `${MOD}K`)} onClick={onSearch}>
            <Search size={15} strokeWidth={2} />
          </button>
        ) : (
          <label className="workspace-search">
            <Search size={15} strokeWidth={2} className="ico" />
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
            <kbd
              title="搜索画布与卡片"
              onMouseDown={(e) => {
                e.preventDefault();
                onSearch();
              }}
            >
              {MOD} K
            </kbd>
          </label>
        )}
      </div>
      <nav
        id="workspace-navigation"
        className="workspace-navigation"
        aria-label="知识画布"
        aria-busy={switchingId !== null}
      >
        <div className="workspace-board-list">
          {!boards.length && !collapsed ? (
            <p className="workspace-start">提一个问题，开始第一张画布</p>
          ) : (
            groups.map((g) =>
              g.items.length ? (
                <section key={g.key} className="workspace-group" aria-label={g.label}>
                  {!collapsed && (
                    <h2 className="workspace-section">
                      {g.label} <span>{g.items.length}</span>
                    </h2>
                  )}
                  <ul>{g.items.map(row)}</ul>
                </section>
              ) : null,
            )
          )}
        </div>
        {!!boards.length && !visibleBoards.length && (
          <p className="workspace-empty">没有找到画布，换个词试试。</p>
        )}
      </nav>
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="画布操作"
            className="workspace-context-menu"
            style={{ left: menu.x, top: menu.y }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Tab") setMenu(null);
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              autoFocus
              role="menuitem"
              disabled={switchingId !== null}
              onClick={() => {
                setMenu(null);
                menu.trigger.focus();
                onArchive(menu.id);
              }}
            >
              <Archive size={16} className="ico" />
              归档
            </button>
          </div>,
          document.body,
        )}
      <div className="workspace-settings">
        <button
          className="workspace-action"
          {...tip("设置", `${MOD}.`)}
          onClick={onSettings}
        >
          <Settings2 size={15} className="ico" />
          <span className="workspace-copy">设置</span>
        </button>
      </div>
      {!collapsed && (
        <div
          className="workspace-resizer"
          role="separator"
          tabIndex={0}
          aria-label="调整左侧栏宽度"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={width}
          onPointerDown={(e) => {
            if (e.button !== 0 || !e.isPrimary) return;
            e.preventDefault();
            resizeOrigin.current = { x: e.clientX, width };
            e.currentTarget.setPointerCapture(e.pointerId);
            onResizingChange(true);
          }}
          onPointerMove={(e) => {
            const origin = resizeOrigin.current;
            if (origin)
              onWidthChange(
                clampSidebarWidth(origin.width + e.clientX - origin.x),
              );
          }}
          onPointerUp={(e) => {
            stopResizing();
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={stopResizing}
          onLostPointerCapture={stopResizing}
          onDoubleClick={() => onWidthChange(SIDEBAR_DEFAULT_WIDTH)}
          onKeyDown={(e) => {
            let next = width;
            if (e.key === "ArrowLeft") next -= 10;
            else if (e.key === "ArrowRight") next += 10;
            else if (e.key === "Home") next = SIDEBAR_MIN_WIDTH;
            else if (e.key === "End") next = SIDEBAR_MAX_WIDTH;
            else return;
            e.preventDefault();
            e.stopPropagation();
            onWidthChange(clampSidebarWidth(next));
          }}
        />
      )}
    </aside>
  );
}
