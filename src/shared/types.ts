export type Point = { x: number; y: number };
export type Understanding = "unseen" | "exploring" | "explained";
export interface VisualDiagram {
  kind: "process" | "parts" | "comparison";
  title?: string;
  labels: string[];
  caption?: string;
  basis: "literal" | "analogy";
}
/** AI ghost hints cached on a card, one short suggestion per direction it can grow. */
export interface CardHints {
  /** hintSignature() when they were made; stale hints are asked for again. */
  sig: string;
  below?: string;
  right?: string;
  above?: string;
}
export interface ConceptNode {
  id: string;
  kind: "concept" | "scene";
  title: string;
  body: string;
  /** null for a top-level card (a root). Tree edges are implied by parentId. */
  parentId: string | null;
  /**
   * The board's original question, once roots have grown above or beside it. Absent on
   * older boards: the leftmost root is the question then.
   */
  question?: boolean;
  /** Cached ghost hints for the '+' handles (optional; older boards have none). */
  hints?: CardHints;
  /** Position among siblings (0-based, contiguous); also reads as 先→后. */
  order: number;
  /** Derived from the parentId chain; never persisted. */
  level?: number;
  status: Understanding;
  /** Handwritten margin remark shown under the body. */
  hand?: string;
  expanded?: boolean;
  visual?: VisualDiagram;
}
export interface Relation {
  id: string;
  source: string;
  target: string;
  label: string;
  /** Only cross-links are stored; they never affect layout. */
  kind: "cross";
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  /** Renderer-only state for an answer, e.g. ticked 小练习 steps. Optional: older boards have none. */
  meta?: { checked?: number[]; laid?: boolean };
}
export interface StickyNote {
  id: string;
  title: string;
  text: string;
  position: Point;
  attachedTo?: { kind: "node" | "relation"; id: string };
  messages: ChatMessage[];
  /** References the learner unticked: they are not sent to the AI. */
  excludedRefs?: string[];
  /** Extra cards the learner chose as context (multi-select or the picker). */
  contextCards?: string[];
  /** When the conversation started; older notes have none. */
  createdAt?: string;
}
export interface SceneState {
  width: number;
  color: string;
  prediction: string;
  explanation: string;
  changed: "width" | "color" | null;
}
export interface Board {
  version: 2;
  id: string;
  title: string;
  topic: string;
  kind: "walkthrough" | "ai";
  createdAt: string;
  updatedAt: string;
  nodes: ConceptNode[];
  relations: Relation[];
  notes: StickyNote[];
  scene: SceneState;
  viewport?: { x: number; y: number; zoom: number };
}
export interface BoardSummary {
  id: string;
  title: string;
  kind: Board["kind"];
  updatedAt: string;
}
export type Selection = {
  kind: "node" | "relation" | "note";
  id: string;
} | null;
export interface ContextReference {
  id: string;
  kind: "topic" | "node" | "relation" | "note";
  title: string;
  text: string;
}
export interface ContextBundle {
  topic: string;
  references: ContextReference[];
  summary: string;
  /** Outline of the whole board (model/structure.ts); optional for older saved contexts. */
  structure?: string;
}
export interface AISettings {
  model: string;
  baseUrl: string;
  configured: boolean;
  /** saved: encrypted at rest (safeStorage); session: in memory until the app quits. */
  source: "saved" | "session" | "environment" | "none";
  /** A masked form of the key in use ("sk-••••a1b2"); never the key itself. */
  keyHint?: string;
  /** Whether a key can be saved encrypted on this machine; "web" in the browser preview. */
  keyStorage?: "encrypted" | "unavailable" | "web";
}
export interface AISettingsInput {
  model: string;
  baseUrl: string;
  apiKey?: string;
}
/** Outcome of the settings 「测试连接」 probe. Never carries the key or raw provider text. */
export type AIConnectionResult =
  | { ok: true; model: string; latencyMs: number }
  | {
      ok: false;
      kind:
        | "config"
        | "auth"
        | "model"
        | "network"
        | "timeout"
        | "rate"
        | "unknown";
      message: string;
      status?: number;
    };
export interface AIRequest {
  boardId: string;
  stickyId: string;
  requestId: string;
  prompt: string;
  context: ContextBundle;
  mode: "answer" | "map" | "expand" | "hint";
}
export interface AIUpdate {
  boardId: string;
  stickyId: string;
  requestId: string;
  text: string;
  status: "streaming" | "done" | "error" | "cancelled";
  error?: string;
}
export interface AIHistory {
  messages: ChatMessage[];
  running: boolean;
}
export interface AtlasAPI {
  /** Host OS from the preload ("darwin", "win32", …); "web" in the browser preview. */
  platform: string;
  /** Native fullscreen changes (macOS hides the traffic lights there). */
  onFullscreenChange(callback: (fullscreen: boolean) => void): () => void;
  /** The app menu's 「Settings…」 item (desktop only). */
  onOpenSettings?(callback: () => void): () => void;
  onBeforeClose(callback: () => Promise<void>): () => void;
  listBoards(): Promise<BoardSummary[]>;
  loadBoard(id: string): Promise<Board | null>;
  saveBoard(board: Board): Promise<void>;
  deleteBoard(id: string): Promise<void>;
  getAISettings(): Promise<AISettings>;
  setAISettings(settings: AISettingsInput): Promise<AISettings>;
  testAIConnection(settings: AISettingsInput): Promise<AIConnectionResult>;
  ask(request: AIRequest): Promise<void>;
  stop(boardId: string, stickyId: string): Promise<void>;
  getHistory(boardId: string, stickyId: string): Promise<AIHistory>;
  onAIUpdate(callback: (update: AIUpdate) => void): () => void;
}
declare global {
  interface Window {
    atlas?: AtlasAPI;
  }
}
