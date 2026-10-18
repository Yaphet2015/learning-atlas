import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ConnectionMode,
  useReactFlow,
  type Edge,
  type Connection,
  type NodeChange,
} from "@xyflow/react";
import { ArrowRight, LoaderCircle, Plus, X } from "lucide-react";
import type {
  AIRequest,
  AISettings,
  AIUpdate,
  Board,
  BoardSummary,
  Selection,
  StickyNote,
  Understanding,
} from "./shared/types";
import { api, isDesktop } from "./api";
import {
  createWalkthroughBoard,
  createEmptyBoard,
  newId,
  newNote,
  expandWalkthrough,
  buildMapFromAI,
} from "./model/boards";
import { contextForNote } from "./model/context";
import {
  firstLevelPrompt,
  kickoffNote,
  kickoffPrompt,
  learnerAnswers,
  needsKickoff,
  rootOf,
} from "./model/kickoff";
import {
  addChild,
  addSibling,
  cacheMessages,
  removeSelection,
  reorder,
  reparent,
} from "./model/editor";
import { insertSlot, layoutTree, type Slot } from "./model/layout";
import { flushBoardCache, loadBoardForNavigation } from "./model/persistence";
import {
  ConceptCard,
  GhostCard,
  RootCard,
  type CanvasNode,
} from "./components/CanvasNodes";
import { TreeEdge, SeqEdge } from "./components/TreeEdge";
import { CrossEdge } from "./components/CrossEdge";
import { LevelGuides } from "./components/LevelGuides";
import {
  Dock,
  MapSwitcher,
  MapUnit,
  Palette,
  Progress,
  type Tool,
} from "./components/Chrome";
import { Drawer } from "./components/Drawer";
import { StudyMode } from "./components/StudyMode";
import { Outline } from "./components/Outline";
import { RoughBox, SketchDefs } from "./components/sketch/RoughBox";
import { Settings } from "./components/Settings";

const nodeTypes = { concept: ConceptCard, root: RootCard, ghost: GhostCard };
const edgeTypes = { tree: TreeEdge, seq: SeqEdge, cross: CrossEdge };
const GHOST = "ghost-slot";
function applySlot(board: Board, id: string, slot: Slot): Board {
  return slot.kind === "reorder"
    ? reorder(board, id, slot.order)
    : reparent(board, id, slot.parentId, slot.order);
}
function useMedia(query: string) {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}
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
    [drawer, setDrawer] = useState<string | null>(null),
    [palette, setPalette] = useState(false),
    [study, setStudy] = useState<{ startId?: string } | null>(null),
    [tool, setTool] = useState<Tool>("select"),
    [editingId, setEditingId] = useState<string | null>(null),
    [preview, setPreview] = useState<Board | null>(null),
    [measured, setMeasured] = useState<
      Record<string, { width: number; height: number }>
    >({}),
    [dragPos, setDragPos] = useState<{
      id: string;
      x: number;
      y: number;
    } | null>(null),
    [dark, setDark] = useState(
      () => matchMedia("(prefers-color-scheme: dark)").matches,
    ),
    mobile = useMedia("(max-width: 720px)");
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
  /** Open the drawer on the card's note (creating one if needed), or a free note. */
  const addNote = useCallback(
    (attachment?: StickyNote["attachedTo"], text?: string) => {
      const b = boardRef.current;
      if (!b) return;
      const existing = attachment
        ? b.notes.find(
            (n) =>
              n.attachedTo?.kind === attachment.kind &&
              n.attachedTo.id === attachment.id,
          )
        : undefined;
      if (existing && !text) {
        setDrawer(existing.id);
        return;
      }
      const note = newNote(b, { x: 0, y: 0 }, attachment);
      if (attachment?.id === "scene-browser" && b.scene.explanation)
        note.text = b.scene.explanation;
      if (text) note.text = text;
      if (attachment?.kind === "node")
        note.title = b.nodes.find((n) => n.id === attachment.id)?.title ?? "";
      edit((current) => ({ ...current, notes: [...current.notes, note] }));
      setDrawer(note.id);
    },
    [edit],
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
    [putBoard, settings.configured, sendAI, showToast],
  );
  const generateMap = useCallback(
    (target: Board, prompt?: string) => {
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
          prompt:
            prompt ??
            `为这个问题创建学习地图的第一小步：「${target.topic}」。只给 3 个大图景概念，具体、直观、少文字，适合初学者。`,
          context,
        },
        target.nodes[0]?.id,
      );
    },
    [settings.configured, sendAI, showToast],
  );
  /** 「让 AI 带我开始」: open the root's drawer conversation and let the tutor probe what the learner knows. */
  const startKickoff = useCallback(() => {
    if (editingLocked.current) return;
    const b = boardRef.current;
    const root = b && rootOf(b);
    if (!b || !root) return;
    if (!settings.configured) {
      showToast("先连接 AI，它就能带你从这个问题开始。");
      setShowSettings(true);
      return;
    }
    const existing = kickoffNote(b);
    if (existing?.messages.length) {
      setDrawer(existing.id);
      return;
    }
    let noteId = existing?.id;
    if (!noteId) {
      const note = newNote(b, { x: 0, y: 0 }, { kind: "node", id: root.id });
      note.title = "AI 带我开始";
      noteId = note.id;
      edit((current) => ({ ...current, notes: [...current.notes, note] }));
    }
    setDrawer(noteId);
    askNote(noteId, kickoffPrompt(b.topic));
  }, [settings.configured, showToast, edit, askNote]);
  /** Accept: turn the kickoff conversation into the first level of child questions on the canvas. */
  const proposeFirstLevel = useCallback(() => {
    const b = boardRef.current;
    if (!b || editingLocked.current) return;
    generateMap(b, firstLevelPrompt(b.topic, learnerAnswers(kickoffNote(b))));
  }, [generateMap]);
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
      setDrawer(null);
      setTimeout(() => flow.fitView({ padding: 0.16, duration: 400 }), 60);
    } catch (e) {
      showToast(errorText(e));
    } finally {
      editingLocked.current = false;
    }
  }
  async function createBoard(walkthrough = false) {
    if (editingLocked.current || (!walkthrough && !topic.trim())) return;
    editingLocked.current = true;
    let kickoff = false;
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
      setDrawer(null);
      setShowNew(false);
      setTopic("");
      await refreshList();
      setTimeout(() => flow.fitView({ padding: 0.22, duration: 450 }), 80);
      kickoff = !walkthrough;
    } catch (e) {
      showToast(errorText(e));
    } finally {
      editingLocked.current = false;
    }
    // A new question starts the guided kickoff (or leads to AI settings) instead of a silent map.
    if (kickoff) startKickoff();
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
  const setStatus = useCallback(
    (id: string, status: Understanding, hand?: string) =>
      edit((b) => ({
        ...b,
        nodes: b.nodes.map((n) =>
          n.id === id ? { ...n, status, ...(hand ? { hand } : {}) } : n,
        ),
      })),
    [edit],
  );
  const rename = useCallback(
    (id: string, title: string) =>
      edit((b) => ({
        ...b,
        nodes: b.nodes.map((n) => (n.id === id ? { ...n, title } : n)),
      })),
    [edit],
  );
  const addChildOf = useCallback(
    (parentId: string) => {
      const id = newId("concept");
      setPreview(null);
      edit((b) => addChild(b, parentId, id));
      setSelection({ kind: "node", id });
      setEditingId(id);
    },
    [edit],
  );
  const addSiblingOf = useCallback(
    (siblingId: string) => {
      const b = boardRef.current;
      const node = b?.nodes.find((n) => n.id === siblingId);
      if (!node) return;
      if (!node.parentId) return addChildOf(siblingId);
      const id = newId("concept");
      edit((current) => addSibling(current, siblingId, id));
      setSelection({ kind: "node", id });
      setEditingId(id);
    },
    [edit, addChildOf],
  );
  const selectedNodeId = selection?.kind === "node" ? selection.id : null;
  const rootId = board?.nodes.find((n) => n.parentId === null)?.id ?? null;
  function removeSelected() {
    if (!selection) return;
    if (selection.kind === "node" && selection.id === rootId) {
      showToast("起点问题不能删除，地图都从这里长出来。");
      return;
    }
    edit((b) => removeSelection(b, selection));
    setSelection(null);
    showToast("已移除。⌘Z 可以撤销。");
  }
  const ask = useCallback(() => {
    addNote(selectedNodeId ? { kind: "node", id: selectedNodeId } : undefined);
    setTimeout(
      () =>
        document
          .querySelector<HTMLTextAreaElement>(".drawer footer textarea")
          ?.focus(),
      60,
    );
  }, [addNote, selectedNodeId]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.matches(
        "input,textarea,select,[contenteditable=true]",
      );
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (e.key === "Escape") {
        setShowNew(false);
        setShowSettings(false);
        setPromote(null);
        setPalette(false);
        if (!typing) {
          if (drawer) setDrawer(null);
          else setSelection(null);
          setTool("select");
        }
      }
      // While a title is being edited (focus may still be moving), keys are text.
      if (typing || study || palette || editingId) return;
      const key = e.key.toLowerCase();
      if (mod && key === "n") {
        e.preventDefault();
        setShowNew(true);
      } else if (mod && key === "z") {
        e.preventDefault();
        undo();
      } else if (mod && key === "s") {
        e.preventDefault();
        void flush();
      } else if (mod) {
        return;
      } else if (e.key === "Tab") {
        e.preventDefault();
        const parent = selectedNodeId ?? rootId;
        if (parent) addChildOf(parent);
      } else if (e.key === "Enter" && selectedNodeId) {
        e.preventDefault();
        addSiblingOf(selectedNodeId);
      } else if (e.key === "F2" && selectedNodeId) {
        setEditingId(selectedNodeId);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        e.preventDefault();
        removeSelected();
      } else if (key === "f") {
        setStudy({ startId: selectedNodeId ?? undefined });
      } else if (key === "v") setTool("select");
      else if (key === "h") setTool("hand");
      else if (key === "l") {
        setTool((t) => (t === "link" ? "select" : "link"));
      } else if (key === "n") {
        addNote(
          selectedNodeId ? { kind: "node", id: selectedNodeId } : undefined,
        );
      } else if (e.key === "/") {
        e.preventDefault();
        ask();
      } else if (key === "0") {
        flow.fitView({ padding: 0.16, duration: 400 });
      } else if (key === "d") {
        setDark((d) => !d);
      } else if (selectedNodeId && ["1", "2", "3"].includes(key)) {
        setStatus(
          selectedNodeId,
          (["unseen", "exploring", "explained"] as const)[Number(key) - 1],
        );
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });

  // ---- layout: positions come only from layoutTree (or a drag/insert preview)
  const shown = preview ?? board;
  const baseLayout = useMemo(
    () => layoutTree(board?.nodes ?? []),
    [board?.nodes],
  );
  const layout = useMemo(
    () => (shown === board ? baseLayout : layoutTree(shown?.nodes ?? [])),
    [shown, board, baseLayout],
  );
  const slotRef = useRef<{ id: string; slot: Slot } | null>(null);
  const hoverAdd = useCallback((id: string | null) => {
    const b = boardRef.current;
    setPreview(id && b ? addChild(b, id, GHOST) : null);
  }, []);
  const kickoffReady = needsKickoff(board) && !mapBusy && !study;
  const nodes = useMemo<CanvasNode[]>(() => {
    if (!shown || !board) return [];
    const out: CanvasNode[] = [];
    for (const n of shown.nodes) {
      const p = layout.positions.get(n.id);
      if (!p) continue;
      if (n.id === GHOST) {
        out.push({
          id: GHOST,
          type: "ghost",
          position: { x: p.x, y: p.y },
          width: p.w,
          height: 74,
          measured: { width: p.w, height: 74 },
          data: { w: p.w },
          draggable: false,
          selectable: false,
        });
        continue;
      }
      const dragging = dragPos?.id === n.id;
      if (dragging && slotRef.current)
        out.push({
          id: GHOST,
          type: "ghost",
          position: { x: p.x, y: p.y },
          width: p.w,
          height: 74,
          measured: { width: p.w, height: 74 },
          data: { w: p.w },
          draggable: false,
          selectable: false,
        });
      out.push({
        id: n.id,
        type: n.parentId === null ? "root" : "concept",
        position: dragging
          ? { x: dragPos.x, y: dragPos.y }
          : { x: p.x, y: p.y },
        width: p.w,
        measured: measured[n.id],
        draggable:
          n.parentId !== null && tool === "select" && editingId !== n.id,
        selected: selectedNodeId === n.id,
        className: dragging ? "is-dragging" : undefined,
        data: {
          concept: n,
          no: n.parentId
            ? `§${String(n.order + 1).padStart(2, "0")}`
            : undefined,
          topic: board.topic,
          createdAt: board.createdAt,
          scene: board.scene,
          editing: editingId === n.id,
          linkMode: tool === "link",
          onRename: rename,
          onEditDone: () => setEditingId(null),
          onAddChild: addChildOf,
          onAddSibling: addSiblingOf,
          onPreviewAdd: hoverAdd,
          onStatus: setStatus,
          onStartEdit: setEditingId,
          onAsk: (id: string) => addNote({ kind: "node", id }),
          onExpand: expand,
          canExpand:
            !n.expanded &&
            (board.kind === "ai" ||
              ["concept-dom", "concept-style", "concept-render"].includes(
                n.id,
              )),
          onScene: (patch: Partial<Board["scene"]>) =>
            edit((b) => ({ ...b, scene: { ...b.scene, ...patch } }), false),
          onNote: (id: string) => addNote({ kind: "node", id }),
          ...(n.parentId === null && kickoffReady
            ? {
                onKickoff: startKickoff,
                kickoffStarted: Boolean(kickoffNote(board)?.messages.length),
              }
            : {}),
        },
      });
    }
    return out;
  }, [
    shown,
    board,
    layout,
    measured,
    dragPos,
    tool,
    editingId,
    selectedNodeId,
    rename,
    addChildOf,
    addSiblingOf,
    hoverAdd,
    setStatus,
    addNote,
    expand,
    edit,
    kickoffReady,
    startKickoff,
  ]);
  const edges = useMemo<Edge[]>(() => {
    if (!shown) return [];
    const out: Edge[] = [];
    const by = new Map(shown.nodes.map((n) => [n.id, n]));
    for (const [parent, kids] of layout.children) {
      const real = kids.filter((k) => k !== GHOST);
      const pw = layout.positions.get(parent)?.w ?? 176;
      real.forEach((child, i) => {
        const k = real.length;
        out.push({
          id: `tree-${child}`,
          type: "tree",
          source: parent,
          target: child,
          sourceHandle: "b",
          targetHandle: "t",
          selectable: false,
          focusable: false,
          data: {
            offset: k > 1 ? (i - (k - 1) / 2) * Math.min(24, pw / k / 1.5) : 0,
            unseen: by.get(child)?.status === "unseen",
          },
        });
        if (i > 0)
          out.push({
            id: `seq-${real[i - 1]}-${child}`,
            type: "seq",
            source: real[i - 1],
            target: child,
            sourceHandle: "b",
            targetHandle: "t",
            selectable: false,
            focusable: false,
          });
      });
    }
    for (const r of shown.relations)
      out.push({
        id: r.id,
        type: "cross",
        source: r.source,
        target: r.target,
        sourceHandle: "b",
        targetHandle: "t",
        selected: selection?.kind === "relation" && selection.id === r.id,
        data: { label: r.label },
      });
    return out;
  }, [shown, layout, selection]);
  // Positions are controlled by layoutTree; only drag offsets and measured
  // sizes (needed by the minimap) flow back from React Flow.
  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    const sizes: Record<string, { width: number; height: number }> = {};
    for (const c of changes) {
      if (c.type === "position" && c.dragging && c.position)
        setDragPos({ id: c.id, x: c.position.x, y: c.position.y });
      if (c.type === "dimensions" && c.dimensions) sizes[c.id] = c.dimensions;
    }
    if (Object.keys(sizes).length) setMeasured((m) => ({ ...m, ...sizes }));
  }, []);
  const onNodeDrag = useCallback(
    (_: unknown, node: CanvasNode) => {
      const b = boardRef.current;
      if (!b) return;
      const w = baseLayout.positions.get(node.id)?.w ?? 176;
      const heights = new Map(
        b.nodes.map((n) => [
          n.id,
          flow.getInternalNode(n.id)?.measured.height ?? 120,
        ]),
      );
      const slot = insertSlot(
        node.id,
        { x: node.position.x + w / 2, y: node.position.y },
        b.nodes,
        baseLayout,
        heights,
      );
      const key = slot ? JSON.stringify(slot) : "";
      if (key === (slotRef.current ? JSON.stringify(slotRef.current.slot) : ""))
        return;
      slotRef.current = slot ? { id: node.id, slot } : null;
      setPreview(slot ? applySlot(b, node.id, slot) : null);
    },
    [baseLayout, flow],
  );
  const onNodeDragStop = useCallback(() => {
    const s = slotRef.current;
    slotRef.current = null;
    setDragPos(null);
    setPreview(null);
    if (s) edit((b) => applySlot(b, s.id, s.slot));
  }, [edit]);
  const connect = useCallback(
    (c: Connection) => {
      setTool("select");
      if (!c.source || !c.target || c.source === c.target) return;
      edit((b) =>
        b.relations.some((r) => r.source === c.source && r.target === c.target)
          ? b
          : {
              ...b,
              relations: [
                ...b.relations,
                {
                  id: newId("relation"),
                  source: c.source,
                  target: c.target,
                  label: "关联",
                  kind: "cross",
                },
              ],
            },
      );
      showToast("已连上一条交叉链接。选中它可以改标签。");
    },
    [edit, showToast],
  );
  const bounds = useMemo(() => {
    const ps = [...baseLayout.positions.values()];
    return {
      levels: Math.max(1, ...ps.map((p) => p.level + 1)),
      left: Math.min(0, ...ps.map((p) => p.x)),
      right: Math.max(0, ...ps.map((p) => p.x + p.w)),
    };
  }, [baseLayout]);
  const selectedRelation = board?.relations.find(
    (r) => selection?.kind === "relation" && r.id === selection.id,
  );
  const drawerNote = board?.notes.find((n) => n.id === drawer);
  if (!loaded)
    return (
      <div className="loading-screen">
        <p>铺开你的学习地图…</p>
      </div>
    );
  return (
    <main className={`app tool-${tool} ${drawerNote ? "with-drawer" : ""}`}>
      <SketchDefs />
      <div className="grain" />
      {closing && (
        <div className="closing-overlay" role="status">
          <LoaderCircle size={18} />
          正在保存全部地图…
        </div>
      )}
      {board && mobile && (
        <Outline
          board={board}
          onStatus={(id, s) => setStatus(id, s)}
          onOpen={() => setPalette(true)}
          onStudy={() => setStudy({})}
        />
      )}
      {board && !mobile && (
        <>
          <ReactFlow<CanvasNode>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onConnect={connect}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={70}
            nodesConnectable={tool === "link"}
            onNodeClick={(_, n) =>
              n.type !== "ghost" && setSelection({ kind: "node", id: n.id })
            }
            onNodeDoubleClick={(_, n) =>
              n.type !== "ghost" && setEditingId(n.id)
            }
            onEdgeClick={(_, e) =>
              e.type === "cross" && setSelection({ kind: "relation", id: e.id })
            }
            onPaneClick={() => {
              setSelection(null);
              setEditingId(null);
            }}
            onPaneContextMenu={(e) => {
              e.preventDefault();
              addNote();
            }}
            fitView
            fitViewOptions={{ padding: 0.16 }}
            minZoom={0.18}
            maxZoom={1.8}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            panOnScroll
            panOnDrag={tool === "hand" ? true : [1, 2]}
            zoomOnDoubleClick={false}
            nodeDragThreshold={4}
            proOptions={{ hideAttribution: true }}
          >
            <LevelGuides {...bounds} />
            <MapUnit />
          </ReactFlow>
          <MapSwitcher
            title={board.title}
            nodes={board.nodes}
            onOpen={() => setPalette(true)}
          />
          <Progress
            nodes={board.nodes}
            onStudy={() => setStudy({ startId: selectedNodeId ?? undefined })}
          />
          <Dock
            tool={tool}
            setTool={setTool}
            onAddConcept={() => {
              const parent = selectedNodeId ?? rootId;
              if (parent) addChildOf(parent);
            }}
            onNote={() =>
              addNote(
                selectedNodeId
                  ? { kind: "node", id: selectedNodeId }
                  : undefined,
              )
            }
            onAsk={ask}
            onSettings={() => setShowSettings(true)}
          />
          {tool === "link" && (
            <div className="hint lab">
              连线：从一张卡拖到另一张卡 · Esc 取消
            </div>
          )}
          {selectedRelation && (
            <div className="chrome relation-bar">
              <RoughBox kind="soft" seedKey="relbar" />
              <div className="bg" />
              <span className="lab">交叉链接</span>
              <input
                aria-label="关系标签"
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
              <button
                className="btn"
                onClick={() =>
                  addNote({ kind: "relation", id: selectedRelation.id })
                }
              >
                问为什么
              </button>
              <button className="btn" onClick={removeSelected}>
                删除
              </button>
            </div>
          )}
          {mapBusy && (
            <div className="map-progress lab">
              <LoaderCircle size={14} /> 正在搭建下一小步…
            </div>
          )}
        </>
      )}
      {board && drawerNote && (
        <Drawer
          key={drawerNote.id}
          note={drawerNote}
          anchorTitle={
            board.nodes.find((n) => n.id === drawerNote.attachedTo?.id)?.title
          }
          refs={
            contextForNote(
              board,
              drawerNote.id,
              selection?.kind === "note" ? null : selection,
            ).references
          }
          pending={pending[`${board.id}/${drawerNote.id}`]?.text}
          busy={pending[`${board.id}/${drawerNote.id}`]?.busy}
          error={pending[`${board.id}/${drawerNote.id}`]?.error}
          onChange={(patch) =>
            edit(
              (b) => ({
                ...b,
                notes: b.notes.map((n) =>
                  n.id === drawerNote.id ? { ...n, ...patch } : n,
                ),
              }),
              false,
            )
          }
          onAsk={(prompt) => askNote(drawerNote.id, prompt)}
          kickoff={
            needsKickoff(board) && kickoffNote(board)?.id === drawerNote.id
              ? { onAccept: proposeFirstLevel, busy: mapBusy }
              : undefined
          }
          onStop={() =>
            void api
              .stop(board.id, drawerNote.id)
              .catch((e) => showToast(errorText(e)))
          }
          onPromote={(text) =>
            setPromote({ noteId: drawerNote.id, title: "新的发现", text })
          }
          onRemove={() => {
            edit((b) =>
              removeSelection(b, { kind: "note", id: drawerNote.id }),
            );
            setDrawer(null);
          }}
          onClose={() => setDrawer(null)}
        />
      )}
      {board && study && (
        <StudyMode
          board={board}
          startId={study.startId}
          onRate={setStatus}
          onAskAI={(id, text) => {
            setStudy(null);
            addNote({ kind: "node", id }, text);
          }}
          onClose={() => setStudy(null)}
        />
      )}
      {palette && (
        <Palette
          boards={boards}
          notes={(board?.notes ?? []).map((n) => ({
            id: n.id,
            title: n.title || n.text.slice(0, 24) || "未命名批注",
          }))}
          footer={`${isDesktop ? "白板保存在这台 Mac" : "浏览器预览 · 仅当前浏览器保存"} · ${saveStatus === "saving" ? "保存中" : saveStatus === "saved" ? "已保存" : "保存失败"}`}
          onNote={(id) => {
            setPalette(false);
            setDrawer(id);
          }}
          currentId={board?.id}
          onClose={() => setPalette(false)}
          onPick={(id) => {
            setPalette(false);
            void switchBoard(id);
          }}
          onNew={() => {
            setPalette(false);
            setShowNew(true);
          }}
          onWalkthrough={() => {
            setPalette(false);
            void createBoard(true);
          }}
          onSettings={() => {
            setPalette(false);
            setShowSettings(true);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={13} />
          </button>
        </div>
      )}
      {showSettings && (
        <Settings
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={async (input) => {
            setSettings(await api.setAISettings(input));
            showToast("AI 设置已更新。发出提问时才会调用模型。");
          }}
          onTest={(input) => api.testAIConnection(input)}
        />
      )}
      {showNew && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setShowNew(false)}
        >
          <section
            className="modal new-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
          >
            <RoughBox kind="soft" seedKey="new-modal" />
            <button
              className="modal-close icon-button"
              onClick={() => setShowNew(false)}
              aria-label="关闭"
            >
              <X size={19} />
            </button>
            <span className="eyebrow">一张新地图</span>
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
                className="btn primary"
                disabled={!topic.trim()}
                type="submit"
              >
                开始探索 <ArrowRight size={16} />
              </button>
            </form>
            <button
              className="text-button"
              onClick={() => void createBoard(true)}
            >
              或先试试内置演练：浏览器如何把代码变成画面？
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
            <RoughBox kind="soft" seedKey="promote" />
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
              className="btn primary"
              disabled={!promote.title.trim() || !promote.text.trim()}
              onClick={() => {
                const p = promote;
                const id = newId("concept");
                edit((b) => {
                  const note = b.notes.find((n) => n.id === p.noteId);
                  const parent =
                    note?.attachedTo?.kind === "node"
                      ? note.attachedTo.id
                      : (b.nodes.find((n) => n.parentId === null)?.id ?? "");
                  const next = addChild(b, parent, id);
                  return {
                    ...next,
                    nodes: next.nodes.map((n) =>
                      n.id === id
                        ? {
                            ...n,
                            title: p.title.trim(),
                            body: p.text.trim().slice(0, 4000),
                            status: "exploring" as const,
                          }
                        : n,
                    ),
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
