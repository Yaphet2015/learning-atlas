import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type Edge,
  type Connection,
  type NodeChange,
  applyNodeChanges,
  MarkerType,
} from "@xyflow/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Compass,
  Focus,
  Layers3,
  LoaderCircle,
  MessageCircle,
  MoreHorizontal,
  MousePointer2,
  Plus,
  Search,
  Settings2,
  Sparkles,
  StickyNote as StickyIcon,
  Undo2,
  X,
} from "lucide-react";
import type {
  AIRequest,
  AISettings,
  AIUpdate,
  Board,
  BoardSummary,
  ConceptNode,
  Point,
  Selection,
  StickyNote,
} from "./shared/types";
import { api, isDesktop } from "./api";
import {
  createWalkthroughBoard,
  createEmptyBoard,
  newNote,
  expandWalkthrough,
  buildMapFromAI,
} from "./model/boards";
import { contextForNote } from "./model/context";
import { removeSelection, cacheMessages } from "./model/editor";
import { flushBoardCache, loadBoardForNavigation } from "./model/persistence";
import {
  ConceptCard,
  SceneCard,
  NoteCard,
  type CanvasNode,
} from "./components/CanvasNodes";
import { Settings } from "./components/Settings";
const nodeTypes = { concept: ConceptCard, scene: SceneCard, note: NoteCard };
const defaults: AISettings = {
  configured: false,
  source: "none",
  model: "gpt-4o-mini",
  baseUrl: "https://api.openai.com/v1",
};
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
function errorText(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes("AI_NOT_CONFIGURED")
    ? "先连接 AI，才能继续这个问题。内置演练与白板编辑仍然可用。"
    : text
        .replace(/^Error invoking remote method '[^']+': Error: /, "")
        .slice(0, 500);
}
export default function App() {
  const [board, setBoard] = useState<Board | null>(null),
    [boards, setBoards] = useState<BoardSummary[]>([]),
    [selection, setSelection] = useState<Selection>(null),
    [settings, setSettings] = useState<AISettings>(defaults),
    [showSettings, setShowSettings] = useState(false),
    [showNew, setShowNew] = useState(false),
    [topic, setTopic] = useState(""),
    [toast, setToast] = useState(""),
    [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
      "saved",
    ),
    [loaded, setLoaded] = useState(false),
    [past, setPast] = useState<Board[]>([]),
    [pending, setPending] = useState<
      Record<string, { text: string; busy: boolean; error?: string }>
    >({}),
    [mapBusy, setMapBusy] = useState(false),
    [promote, setPromote] = useState<{
      noteId: string;
      text: string;
      title: string;
    } | null>(null),
    [search, setSearch] = useState("");
  const [closing, setClosing] = useState(false);
  const editingLocked = useRef(false);
  const boardCache = useRef(new Map<string, Board>()),
    completionQueues = useRef(new Map<string, Promise<void>>());
  const boardRef = useRef<Board | null>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    requestMeta = useRef(
      new Map<string, { request: AIRequest; anchor?: string }>(),
    );
  const flow = useReactFlow<CanvasNode>();
  const showToast = useCallback((text: string) => {
    setToast(text);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const refreshList = useCallback(async () => {
    setBoards(
      (await api.listBoards()).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    );
  }, []);
  const putBoard = useCallback((next: Board, record = true) => {
    const previous = boardRef.current;
    if (record && previous?.id === next.id)
      setPast((p) => [...p.slice(-29), structuredClone(previous)]);
    const value = { ...next, updatedAt: now() };
    boardRef.current = value;
    boardCache.current.set(value.id, value);
    setBoard(value);
    setSaveStatus("saving");
  }, []);
  const edit = useCallback(
    (fn: (b: Board) => Board, record = true) => {
      if (!editingLocked.current && boardRef.current)
        putBoard(fn(boardRef.current), record);
    },
    [putBoard],
  );
  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await flushBoardCache(boardCache.current, api.saveBoard, () => [
      ...completionQueues.current.values(),
    ]);
    setSaveStatus("saved");
    await refreshList();
  }, [refreshList]);
  const closeFlush = useCallback(async () => {
    editingLocked.current = true;
    setClosing(true);
    try {
      await flush();
    } catch (error) {
      editingLocked.current = false;
      setClosing(false);
      setSaveStatus("error");
      throw error;
    }
  }, [flush]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.listBoards();
        const settings = await api.getAISettings();
        let initial = list.length
          ? await api.loadBoard(
              [...list].sort((a, b) =>
                b.updatedAt.localeCompare(a.updatedAt),
              )[0].id,
            )
          : null;
        if (!initial) {
          initial = createWalkthroughBoard();
          await api.saveBoard(initial);
        }
        if (cancelled) return;
        boardRef.current = initial;
        boardCache.current.set(initial.id, initial);
        setBoard(initial);
        setSettings(settings);
        await refreshList();
        setLoaded(true);
        setTimeout(() => flow.fitView({ padding: 0.16, duration: 500 }), 160);
      } catch (error) {
        if (!cancelled) {
          showToast(errorText(error));
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => api.onBeforeClose(closeFlush), [closeFlush]);
  useEffect(() => {
    if (!loaded || !board) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void api
        .saveBoard(board)
        .then(() => {
          if (boardRef.current?.updatedAt === board.updatedAt)
            setSaveStatus("saved");
          void refreshList();
        })
        .catch((e) => {
          setSaveStatus("error");
          showToast(`保存失败：${errorText(e)}`);
        });
    }, 450);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [board, loaded, refreshList, showToast]);
  useEffect(() => {
    if (!board?.id) return;
    let cancelled = false;
    void (async () => {
      for (const note of board.notes) {
        try {
          const history = await api.getHistory(board.id, note.id);
          if (cancelled) return;
          if (history.messages.length)
            edit(
              (current) =>
                current.id === board.id
                  ? {
                      ...current,
                      notes: current.notes.map((n) =>
                        n.id === note.id
                          ? { ...n, messages: cacheMessages(history.messages) }
                          : n,
                      ),
                    }
                  : current,
              false,
            );
        } catch {
          /* Notes remain available offline; runtime history is optional before setup. */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [board?.id]);
  useEffect(
    () =>
      api.onAIUpdate((update: AIUpdate) => {
        const key = `${update.boardId}/${update.stickyId}`;
        setPending((p) => ({
          ...p,
          [key]: {
            text: update.text,
            busy: update.status === "streaming",
            error: update.error,
          },
        }));
        if (update.status === "streaming") return;
        const meta = requestMeta.current.get(update.requestId);
        requestMeta.current.delete(update.requestId);
        if (meta && meta.request.mode !== "answer") setMapBusy(false);
        if (update.status === "error") {
          showToast(errorText(update.error ?? "AI 暂时无法回答"));
          return;
        }
        if (update.status === "cancelled") {
          showToast("已停止回答，已保存的对话仍在。");
          return;
        }
        const previous =
          completionQueues.current.get(update.boardId) ?? Promise.resolve();
        const task = previous
          .then(async () => {
            const loaded =
              boardCache.current.get(update.boardId) ??
              (await api.loadBoard(update.boardId));
            const target =
              boardRef.current?.id === update.boardId
                ? boardRef.current
                : (boardCache.current.get(update.boardId) ?? loaded);
            if (!target) return;
            let next = target;
            try {
              if (meta && meta.request.mode !== "answer") {
                next = buildMapFromAI(update.text, target, meta.anchor);
                showToast("已展开新的概念。你可以继续调整它们。");
              } else {
                next = {
                  ...target,
                  notes: target.notes.map((n) =>
                    n.id === update.stickyId
                      ? {
                          ...n,
                          messages: cacheMessages([
                            ...n.messages,
                            {
                              id: update.requestId + "-answer",
                              role: "assistant" as const,
                              text: update.text,
                              createdAt: now(),
                            },
                          ]),
                        }
                      : n,
                  ),
                };
              }
              if (boardRef.current?.id === target.id) putBoard(next, false);
              else {
                next = { ...next, updatedAt: now() };
                boardCache.current.set(next.id, next);
                await api.saveBoard(next);
              }
              setPending((p) => ({ ...p, [key]: { text: "", busy: false } }));
            } catch (error) {
              showToast(`回答未加入地图：${errorText(error)}`);
            }
          })
          .catch((error) => showToast(errorText(error)));
        completionQueues.current.set(update.boardId, task);
        void task.finally(() => {
          if (completionQueues.current.get(update.boardId) === task)
            completionQueues.current.delete(update.boardId);
        });
      }),
    [putBoard, showToast],
  );
  const center = useCallback(
    () =>
      flow.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }),
    [flow],
  );
  const addNote = useCallback(
    (attachment?: StickyNote["attachedTo"], position?: Point) => {
      const b = boardRef.current;
      if (!b) return;
      let pos = position ?? center();
      if (attachment?.kind === "node") {
        const n = b.nodes.find((n) => n.id === attachment.id);
        if (n)
          pos = {
            x: n.position.x + (n.kind === "scene" ? 790 : 300),
            y: n.position.y,
          };
      }
      const note = newNote(b, pos, attachment);
      if (attachment?.id === "scene-browser" && b.scene.explanation)
        note.text = b.scene.explanation;
      edit((current) => ({ ...current, notes: [...current.notes, note] }));
      setSelection({ kind: "note", id: note.id });
      showToast(
        attachment
          ? "批注已关联；提问时会带上相关分支。"
          : "已放下一张自由批注。拖动标题可以移动。",
      );
    },
    [edit, center, showToast],
  );
  const sendAI = useCallback(
    async (request: AIRequest, anchor?: string) => {
      requestMeta.current.set(request.requestId, { request, anchor });
      setPending((p) => ({
        ...p,
        [`${request.boardId}/${request.stickyId}`]: { text: "", busy: true },
      }));
      try {
        await api.ask(request);
      } catch (error) {
        requestMeta.current.delete(request.requestId);
        setPending((p) => ({
          ...p,
          [`${request.boardId}/${request.stickyId}`]: {
            text: "",
            busy: false,
            error: errorText(error),
          },
        }));
        setMapBusy(false);
        showToast(errorText(error));
      }
    },
    [showToast],
  );
  const askNote = useCallback(
    (noteId: string, prompt: string) => {
      if (editingLocked.current) return false;
      const b = boardRef.current;
      if (!b) return false;
      if (!settings.configured) {
        setShowSettings(true);
        return false;
      }
      const context = contextForNote(b, noteId, selection);
      const request: AIRequest = {
        boardId: b.id,
        stickyId: noteId,
        requestId: uid(),
        prompt,
        context,
        mode: "answer",
      };
      edit(
        (current) => ({
          ...current,
          notes: current.notes.map((n) =>
            n.id === noteId
              ? {
                  ...n,
                  messages: cacheMessages([
                    ...n.messages,
                    {
                      id: request.requestId,
                      role: "user" as const,
                      text: prompt,
                      createdAt: now(),
                    },
                  ]),
                }
              : n,
          ),
        }),
        false,
      );
      void sendAI(request);
      return true;
    },
    [settings.configured, selection, sendAI, edit],
  );
  const expand = useCallback(
    (id: string) => {
      if (editingLocked.current) return;
      const b = boardRef.current;
      if (!b) return;
      if (b.kind === "walkthrough") {
        const next = expandWalkthrough(b, id);
        if (next === b) {
          showToast("这一小步已展开。可以写下自己的解释，或在批注中继续问。");
          return;
        }
        putBoard(next);
        setTimeout(() => flow.fitView({ padding: 0.18, duration: 500 }), 80);
        return;
      }
      if (!settings.configured) {
        setShowSettings(true);
        return;
      }
      const node = b.nodes.find((n) => n.id === id);
      if (!node) return;
      const virtual = newNote(b, { x: 0, y: 0 }, { kind: "node", id });
      const context = contextForNote(
        { ...b, notes: [...b.notes, virtual] },
        virtual.id,
      );
      setMapBusy(true);
      void sendAI(
        {
          boardId: b.id,
          stickyId: "expand-" + id,
          requestId: uid(),
          mode: "expand",
          prompt: `围绕「${node.title}」展开下一层，最多 3 个概念。先解释它如何工作或用一个例子拆开，不要一次铺开整个领域。`,
          context,
        },
        id,
      );
    },
    [putBoard, flow, settings.configured, sendAI],
  );
  const generateMap = useCallback(
    (target: Board) => {
      if (!settings.configured) {
        showToast("白板已创建。连接 AI 后就能探索这个问题。");
        setShowSettings(true);
        return;
      }
      const virtual = newNote(target, { x: 0, y: 0 });
      const context = contextForNote(
        { ...target, notes: [virtual] },
        virtual.id,
      );
      setMapBusy(true);
      void sendAI(
        {
          boardId: target.id,
          stickyId: "map-root",
          requestId: uid(),
          mode: "map",
          prompt: `为这个问题创建学习地图的第一小步：「${target.topic}」。只给 3 个大图景概念，具体、直观、少文字，适合初学者。`,
          context,
        },
        target.nodes[0]?.id,
      );
    },
    [settings.configured, sendAI, showToast],
  );
  async function switchBoard(id: string) {
    if (boardRef.current?.id === id || editingLocked.current) return;
    editingLocked.current = true;
    try {
      await flush();
      await completionQueues.current.get(id);
      const b = await loadBoardForNavigation(
        id,
        boardCache.current,
        api.loadBoard,
        flush,
      );
      if (!b) throw new Error("白板不存在");
      boardRef.current = b;
      boardCache.current.set(b.id, b);
      setBoard(b);
      setPast([]);
      setSelection(null);
      setTimeout(() => flow.fitView({ padding: 0.17, duration: 400 }), 60);
    } catch (e) {
      showToast(errorText(e));
    } finally {
      editingLocked.current = false;
    }
  }
  async function createBoard(walkthrough = false) {
    if (editingLocked.current || (!walkthrough && !topic.trim())) return;
    editingLocked.current = true;
    try {
      await flush();
      const next = walkthrough
        ? createWalkthroughBoard()
        : createEmptyBoard(topic.trim());
      await api.saveBoard(next);
      boardRef.current = next;
      boardCache.current.set(next.id, next);
      setBoard(next);
      setPast([]);
      setSelection(null);
      setShowNew(false);
      setTopic("");
      await refreshList();
      setTimeout(() => flow.fitView({ padding: 0.22, duration: 450 }), 80);
      if (!walkthrough) generateMap(next);
    } catch (e) {
      showToast(errorText(e));
    } finally {
      editingLocked.current = false;
    }
  }
  const undo = useCallback(() => {
    if (editingLocked.current) return;
    setPast((p) => {
      if (!p.length) return p;
      const previous = p[p.length - 1];
      boardRef.current = previous;
      boardCache.current.set(previous.id, previous);
      setBoard(previous);
      setSaveStatus("saving");
      return p.slice(0, -1);
    });
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.matches(
        "input,textarea,[contenteditable=true]",
      );
      if (e.key === "Escape") {
        setShowNew(false);
        setShowSettings(false);
        setPromote(null);
        setSelection(null);
      }
      if (typing) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setShowNew(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        addNote();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        flow.fitView({ padding: 0.18, duration: 400 });
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [undo, flush, addNote, flow]);
  const nodes = useMemo<CanvasNode[]>(() => {
    if (!board) return [];
    return [
      ...board.nodes.map((n) => ({
        id: n.id,
        type: n.kind,
        position: n.position,
        selected: selection?.kind === "node" && selection.id === n.id,
        data: {
          concept: n,
          scene: board.scene,
          onExpand: expand,
          onNote: (id: string) => addNote({ kind: "node", id }),
          onScene: (patch: any) =>
            edit((b) => ({ ...b, scene: { ...b.scene, ...patch } }), false),
        },
      })),
      ...board.notes.map((n) => ({
        id: n.id,
        type: "note",
        position: n.position,
        dragHandle: ".drag-handle",
        selected: selection?.kind === "note" && selection.id === n.id,
        zIndex: 5,
        data: {
          note: n,
          refs: contextForNote(
            board,
            n.id,
            selection?.kind === "note" ? null : selection,
          ).references,
          ...pending[`${board.id}/${n.id}`],
          pending: pending[`${board.id}/${n.id}`]?.text,
          onNoteChange: (id: string, patch: Partial<StickyNote>) =>
            edit(
              (b) => ({
                ...b,
                notes: b.notes.map((n) =>
                  n.id === id ? { ...n, ...patch } : n,
                ),
              }),
              false,
            ),
          onAsk: askNote,
          onStop: (id: string) => {
            void api.stop(board.id, id).catch((e) => showToast(errorText(e)));
          },
          onPromote: (id: string, text: string) =>
            setPromote({ noteId: id, title: "新的发现", text }),
          onDetach: (id: string) =>
            edit((b) => ({
              ...b,
              notes: b.notes.map((n) =>
                n.id === id ? { ...n, attachedTo: undefined } : n,
              ),
            })),
        },
      })),
    ];
  }, [board, selection, expand, addNote, edit, pending, askNote, showToast]);
  const edges = useMemo<Edge[]>(
    () =>
      board?.relations.map((r) => ({
        id: r.id,
        source: r.source,
        target: r.target,
        label: r.label,
        type: "smoothstep",
        selected: selection?.kind === "relation" && selection.id === r.id,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 13,
          height: 13,
          color: "#a6b3ac",
        },
        style: { stroke: "#b2bdb5", strokeWidth: 1.5 },
        labelStyle: { fontSize: 11, fill: "#768278" },
        labelBgStyle: { fill: "#f6f7f3" },
        labelBgPadding: [8, 4],
      })) ?? [],
    [board?.relations, selection],
  );
  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      const positions = changes.filter(
        (c) => c.type === "position" && c.position,
      );
      if (!positions.length) return;
      edit(
        (b) => ({
          ...b,
          nodes: b.nodes.map((n) => {
            const p = positions.find((c) => "id" in c && c.id === n.id);
            return p?.type === "position" && p.position
              ? { ...n, position: p.position }
              : n;
          }),
          notes: b.notes.map((n) => {
            const p = positions.find((c) => "id" in c && c.id === n.id);
            return p?.type === "position" && p.position
              ? { ...n, position: p.position }
              : n;
          }),
        }),
        false,
      );
    },
    [edit],
  );
  const connect = useCallback(
    (connection: Connection) => {
      if (
        !connection.source ||
        !connection.target ||
        connection.source === connection.target
      )
        return;
      edit((b) => ({
        ...b,
        relations: [
          ...b.relations,
          {
            id: uid(),
            source: connection.source!,
            target: connection.target!,
            label: "关联",
          },
        ],
      }));
    },
    [edit],
  );
  const selectedNode = board?.nodes.find(
      (n) => selection?.kind === "node" && n.id === selection.id,
    ),
    selectedRelation = board?.relations.find(
      (r) => selection?.kind === "relation" && r.id === selection.id,
    ),
    selectedNote = board?.notes.find(
      (n) => selection?.kind === "note" && n.id === selection.id,
    );
  const updateSelected = (patch: Partial<ConceptNode>) => {
    if (selectedNode)
      edit(
        (b) => ({
          ...b,
          nodes: b.nodes.map((n) =>
            n.id === selectedNode.id ? { ...n, ...patch } : n,
          ),
        }),
        false,
      );
  };
  function removeSelected() {
    if (!selection) return;
    edit((b) => removeSelection(b, selection));
    setSelection(null);
    showToast("已移除。⌘Z 可以撤销。");
  }
  if (!loaded)
    return (
      <div className="loading-screen">
        <Compass size={28} />
        <p>铺开你的学习地图…</p>
      </div>
    );
  return (
    <main className="app-shell">
      {closing && (
        <div className="closing-overlay" role="status">
          <LoaderCircle size={18} />
          正在保存全部白板…
        </div>
      )}
      <aside className="sidebar">
        <div className="window-drag" />
        <div className="brand">
          <div className="brand-mark">
            <Compass size={22} strokeWidth={1.6} />
          </div>
          <div>
            Learning Atlas<span>让理解，慢慢长出来</span>
          </div>
        </div>
        <button className="new-board-button" onClick={() => setShowNew(true)}>
          <Plus size={16} />
          新的问题<span>⌘ N</span>
        </button>
        <div className="sidebar-search">
          <Search size={14} />
          <input
            aria-label="搜索白板"
            placeholder="找到一张白板…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sidebar-label">
          我的白板 <span>{boards.length}</span>
        </div>
        <nav className="board-list">
          {boards
            .filter((b) => b.title.toLowerCase().includes(search.toLowerCase()))
            .map((b) => (
              <button
                key={b.id}
                onClick={() => void switchBoard(b.id)}
                className={b.id === board?.id ? "active" : ""}
              >
                <span className="board-symbol">
                  {b.kind === "walkthrough" ? (
                    <BookOpen size={16} />
                  ) : (
                    <Layers3 size={16} />
                  )}
                </span>
                <span>
                  {b.title}
                  <small>
                    {b.kind === "walkthrough" ? "内置演练" : "我的探索"}
                  </small>
                </span>
                {b.id === board?.id && <span className="active-dot" />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="learning-note">
            <span>小步探索，大图景理解。</span>
            <p>
              不用一口气学完。
              <br />
              带着问题，走近一个概念。
            </p>
          </div>
          <button
            className="settings-button"
            onClick={() => setShowSettings(true)}
          >
            <span
              className={`connection-dot ${settings.configured ? "connected" : ""}`}
            />
            <span>
              {settings.configured ? "AI 已配置" : "连接你的 AI"}
              <small>
                {settings.configured ? settings.model : "内置演练无需连接"}
              </small>
            </span>
            <Settings2 size={15} />
          </button>
          <div className="storage-caption">
            {isDesktop ? "白板保存在这台 Mac" : "浏览器预览 · 仅当前浏览器保存"}
          </div>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>我的白板</span>
            <ChevronRight size={13} />
            <strong>{board?.title ?? "Learning Atlas"}</strong>
          </div>
          <div className="topbar-actions">
            <span className={`save-status ${saveStatus}`}>
              {saveStatus === "saving" ? (
                <LoaderCircle size={12} />
              ) : saveStatus === "saved" ? (
                <Check size={12} />
              ) : (
                <CircleHelp size={12} />
              )}{" "}
              {saveStatus === "saving"
                ? "保存中"
                : saveStatus === "saved"
                  ? "已保存"
                  : "保存失败"}
            </span>
            <button
              className="icon-button"
              title="撤销 ⌘Z"
              aria-label="撤销"
              disabled={!past.length}
              onClick={undo}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="icon-button"
              title="AI 设置"
              onClick={() => setShowSettings(true)}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </header>
        <div className="question-bar">
          <div className="question-icon">
            <Sparkles size={19} />
          </div>
          <div>
            <span className="eyebrow">从这个问题出发</span>
            <h1>{board?.topic ?? "开始一个新问题"}</h1>
          </div>
          <span className="board-kind">
            {board?.kind === "walkthrough" ? "内置演练" : "自由探索"}
          </span>
        </div>
        <div className="canvas-layout">
          <div className="canvas-wrap">
            <div className="canvas-top-left">
              <span className="canvas-label">
                <span className="small-dot" />
                学习地图
              </span>
              <span>
                {board?.nodes.length ?? 0} 个概念 · {board?.notes.length ?? 0}{" "}
                张批注
              </span>
            </div>
            {board && (
              <ReactFlow<CanvasNode>
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onNodeDragStart={() => {
                  if (boardRef.current)
                    setPast((p) => [
                      ...p.slice(-29),
                      structuredClone(boardRef.current!),
                    ]);
                }}
                onConnect={connect}
                onNodeClick={(_, n) =>
                  setSelection({
                    kind: n.type === "note" ? "note" : "node",
                    id: n.id,
                  })
                }
                onEdgeClick={(_, e) =>
                  setSelection({ kind: "relation", id: e.id })
                }
                onPaneClick={() => setSelection(null)}
                onPaneContextMenu={(e) => {
                  e.preventDefault();
                  addNote(
                    undefined,
                    flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                  );
                }}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                minZoom={0.18}
                maxZoom={1.6}
                deleteKeyCode={null}
                panOnScroll
                selectionOnDrag
                panOnDrag={[1, 2]}
                zoomOnDoubleClick={false}
                proOptions={{ hideAttribution: true }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={24}
                  size={1}
                  color="#d6ddd4"
                />
                <Controls showInteractive={false} position="bottom-left" />
                <MiniMap
                  className="atlas-minimap"
                  position="bottom-right"
                  pannable
                  zoomable
                  nodeColor={(n) =>
                    n.type === "note"
                      ? "#e9d69b"
                      : n.type === "scene"
                        ? "#8dafa0"
                        : "#bdcec3"
                  }
                />
              </ReactFlow>
            )}
            <div className="canvas-toolbox">
              <button title="自由批注 N" onClick={() => addNote()}>
                <StickyIcon size={16} />
                <span>贴张批注</span>
                <kbd>N</kbd>
              </button>
              <div />
              <button
                title="适应地图 F"
                onClick={() => flow.fitView({ padding: 0.18, duration: 450 })}
              >
                <Focus size={16} />
                <span>查看全图</span>
                <kbd>F</kbd>
              </button>
            </div>
            <div className="canvas-help">
              双指平移 · 捏合缩放 · 拖动概念 · 连接圆点建立关系
            </div>
            {mapBusy && (
              <div className="map-progress">
                <LoaderCircle size={16} />
                正在搭建下一小步…
              </div>
            )}
            {toast && (
              <div className="toast" role="status">
                {toast}
                <button aria-label="关闭提示" onClick={() => setToast("")}>
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
          <aside className="inspector">
            <div className="inspector-heading">
              <span>{selection ? "在这里，继续探索" : "接下来，试一小步"}</span>
              {selection && (
                <button
                  className="icon-button"
                  onClick={() => setSelection(null)}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            {selectedNode ? (
              <>
                <span className="inspector-symbol">{selectedNode.emoji}</span>
                <label className="editor-label">
                  概念
                  <input
                    className="editable-title"
                    value={selectedNode.title}
                    onChange={(e) => updateSelected({ title: e.target.value })}
                  />
                </label>
                <label className="editor-label">
                  用几句话描述
                  <textarea
                    className="editable-body"
                    value={selectedNode.body}
                    onChange={(e) => updateSelected({ body: e.target.value })}
                  />
                </label>
                <div className="inspector-divider" />
                <span className="eyebrow">你的理解，由你判断</span>
                <div className="status-picker">
                  {(["unseen", "exploring", "explained"] as const).map((s) => (
                    <button
                      key={s}
                      className={selectedNode.status === s ? "active" : ""}
                      onClick={() => updateSelected({ status: s })}
                    >
                      {s === "unseen"
                        ? "待探索"
                        : s === "exploring"
                          ? "探索中"
                          : "我能解释"}
                    </button>
                  ))}
                </div>
                <p className="quiet-copy">
                  打开一个概念，只代表看过。能否举例、解释和运用，可以慢慢检验。
                </p>
                <div className="next-actions">
                  <button
                    onClick={() => expand(selectedNode.id)}
                    disabled={selectedNode.expanded || mapBusy}
                  >
                    <Plus size={16} />
                    <span>
                      展开下一层<small>看组成、过程或一个例子</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                  <button
                    onClick={() =>
                      addNote({ kind: "node", id: selectedNode.id })
                    }
                  >
                    <MessageCircle size={16} />
                    <span>
                      用自己的话解释<small>让 AI 帮你找遗漏或反例</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                </div>
                <button className="text-danger" onClick={removeSelected}>
                  移除概念
                </button>
              </>
            ) : selectedRelation ? (
              <>
                <span className="eyebrow">概念之间的关系</span>
                <div className="relation-preview">
                  <span>
                    {
                      board?.nodes.find((n) => n.id === selectedRelation.source)
                        ?.title
                    }
                  </span>
                  <ArrowDown size={18} />
                  <span>
                    {
                      board?.nodes.find((n) => n.id === selectedRelation.target)
                        ?.title
                    }
                  </span>
                </div>
                <label className="editor-label">
                  关系标签
                  <input
                    value={selectedRelation.label}
                    onChange={(e) =>
                      edit(
                        (b) => ({
                          ...b,
                          relations: b.relations.map((r) =>
                            r.id === selectedRelation.id
                              ? { ...r, label: e.target.value }
                              : r,
                          ),
                        }),
                        false,
                      )
                    }
                  />
                </label>
                <div className="next-actions">
                  <button
                    onClick={() =>
                      addNote({ kind: "relation", id: selectedRelation.id })
                    }
                  >
                    <MessageCircle size={16} />
                    <span>
                      为什么存在这条关系？
                      <small>带上两端概念和附近分支提问</small>
                    </span>
                  </button>
                </div>
                <button className="text-danger" onClick={removeSelected}>
                  移除关系
                </button>
              </>
            ) : selectedNote ? (
              <>
                <span className="inspector-symbol">✎</span>
                <h3>{selectedNote.title || "我的批注"}</h3>
                <p className="quiet-copy">
                  {selectedNote.attachedTo
                    ? "这张批注关联到地图的一部分。"
                    : "这是一张自由批注。"}
                  回答会留在批注里，你可以选择将有用的部分加入地图。
                </p>
                <span className="eyebrow">这次 AI 会参考什么</span>
                <div className="context-reference-list">
                  {board &&
                    contextForNote(board, selectedNote.id).references.map(
                      (r) => (
                        <div key={`${r.kind}-${r.id}`}>
                          <span>
                            {r.kind === "topic"
                              ? "起始问题"
                              : r.kind === "relation"
                                ? "关系"
                                : r.kind === "note"
                                  ? "批注"
                                  : "相关概念"}
                          </span>
                          <strong>{r.title}</strong>
                          <p>{r.text}</p>
                        </div>
                      ),
                    )}
                </div>
                <label className="editor-label">
                  关联到
                  <select
                    value={
                      selectedNote.attachedTo
                        ? `${selectedNote.attachedTo.kind}:${selectedNote.attachedTo.id}`
                        : ""
                    }
                    onChange={(e) => {
                      const [kind, id] = e.target.value.split(":");
                      edit((b) => ({
                        ...b,
                        notes: b.notes.map((n) =>
                          n.id === selectedNote.id
                            ? {
                                ...n,
                                attachedTo: kind
                                  ? { kind: kind as "node" | "relation", id }
                                  : undefined,
                              }
                            : n,
                        ),
                      }));
                    }}
                  >
                    <option value="">自由批注（只参考问题）</option>
                    {board?.nodes.map((n) => (
                      <option key={n.id} value={`node:${n.id}`}>
                        概念 · {n.title}
                      </option>
                    ))}
                    {board?.relations.map((r) => (
                      <option key={r.id} value={`relation:${r.id}`}>
                        关系 · {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="text-danger" onClick={removeSelected}>
                  移除批注
                </button>
              </>
            ) : (
              <>
                <div className="journey-illustration">
                  <div className="journey-orbit" />
                  <span>?</span>
                  <i className="leaf one" />
                  <i className="leaf two" />
                  <i className="leaf three" />
                </div>
                <h2>
                  先有画面，
                  <br />
                  再连起理解。
                </h2>
                <p className="inspector-intro">
                  从小实验开始。不用急着背下名词，先看看一处变化，会影响哪里。
                </p>
                <div className="next-actions">
                  {board?.kind === "walkthrough" ? (
                    <>
                      <button
                        onClick={() => {
                          setSelection({ kind: "node", id: "scene-browser" });
                          flow.fitView({
                            nodes: [{ id: "scene-browser" }],
                            padding: 0.3,
                            duration: 500,
                          });
                        }}
                      >
                        <MousePointer2 size={17} />
                        <span>
                          改一改颜色和宽度<small>先预测，再观察结果</small>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                      <button onClick={() => expand("concept-render")}>
                        <Layers3 size={17} />
                        <span>
                          拆开「布局与绘制」<small>它们为什么是两件事？</small>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={mapBusy}
                      onClick={() => board && generateMap(board)}
                    >
                      <Sparkles size={17} />
                      <span>
                        {board && board.nodes.length > 1
                          ? "换一个角度展开"
                          : "生成起点"}
                        <small>从 3 个大图景概念开始</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  )}
                  <button onClick={() => addNote()}>
                    <StickyIcon size={17} />
                    <span>
                      留下一个没想通的地方
                      <small>自由提问，或者自己试着解释</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="inspector-bottom-note">
                  <BookOpen size={16} />
                  <span>
                    {board?.kind === "walkthrough"
                      ? "这是可离线操作的内置演练；其他主题由你连接的 AI 生成。"
                      : "地图只是理解的起点。AI 也可能出错，重要结论请核对可靠来源。"}
                  </span>
                </div>
              </>
            )}
          </aside>
        </div>
      </section>
      {showSettings && (
        <Settings
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={async (input) => {
            setSettings(await api.setAISettings(input));
            showToast("AI 设置已更新。发出提问时才会调用模型。");
          }}
        />
      )}
      {showNew && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowNew(false);
          }}
        >
          <section
            className="modal new-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
          >
            <button
              className="modal-close icon-button"
              onClick={() => setShowNew(false)}
              aria-label="关闭"
            >
              <X size={19} />
            </button>
            <div className="modal-icon">
              <Compass size={27} />
            </div>
            <span className="eyebrow">一张新白板</span>
            <h2 id="new-title">什么，让你好奇？</h2>
            <p>输入一个问题、概念或领域。先看清一个小场景，再一步步展开。</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void createBoard();
              }}
            >
              <textarea
                autoFocus
                aria-label="新白板问题"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="比如：神经网络到底是怎么学习的？"
                maxLength={500}
              />
              <button
                className="primary-button"
                disabled={!topic.trim()}
                type="submit"
              >
                开始探索 <ArrowRight size={16} />
              </button>
            </form>
            <div className="modal-separator">或先试试</div>
            <button
              className="example-button"
              onClick={() => void createBoard(true)}
            >
              <span>◫</span>
              <div>
                浏览器如何把代码变成画面？<small>内置演练 · 可离线操作</small>
              </div>
              <ChevronRight size={16} />
            </button>
          </section>
        </div>
      )}
      {promote && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="promote-title"
          >
            <button
              className="modal-close icon-button"
              onClick={() => setPromote(null)}
              aria-label="关闭"
            >
              <X size={19} />
            </button>
            <span className="eyebrow">由你决定</span>
            <h2 id="promote-title">把有用的部分，放进地图</h2>
            <p>先压缩成自己的话。这不会替你标记为“已理解”。</p>
            <label>
              概念名称
              <input
                value={promote.title}
                onChange={(e) =>
                  setPromote({ ...promote, title: e.target.value })
                }
                maxLength={100}
              />
            </label>
            <label>
              保留这段解释
              <textarea
                rows={7}
                value={promote.text}
                onChange={(e) =>
                  setPromote({ ...promote, text: e.target.value })
                }
                maxLength={3000}
              />
            </label>
            <button
              className="primary-button"
              disabled={!promote.title.trim() || !promote.text.trim()}
              onClick={() => {
                const p = promote;
                edit((b) => {
                  const note = b.notes.find((n) => n.id === p.noteId);
                  const id = uid();
                  return {
                    ...b,
                    nodes: [
                      ...b.nodes,
                      {
                        id,
                        kind: "concept",
                        title: p.title,
                        body: p.text,
                        emoji: "◇",
                        color: "sage",
                        status: "exploring",
                        position: {
                          x: (note?.position.x ?? 0) + 360,
                          y: note?.position.y ?? 0,
                        },
                      },
                    ],
                    relations:
                      note?.attachedTo?.kind === "node"
                        ? [
                            ...b.relations,
                            {
                              id: uid(),
                              source: note.attachedTo.id,
                              target: id,
                              label: "我的发现",
                            },
                          ]
                        : b.relations,
                  };
                });
                setPromote(null);
                showToast("已加入地图，原回答仍保留在批注中。");
              }}
            >
              加入地图 <Plus size={16} />
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
