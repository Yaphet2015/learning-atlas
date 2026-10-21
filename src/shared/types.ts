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
  /** Cached zoom overview; sig covers the subtree's content and structure. */
  overview?: { summary: string; sig: string };
  /** Position among siblings (0-based, contiguous); also reads as 先→后. */
  order: number;
  /** Derived from the parentId chain; never persisted. */
  level?: number;
  status: Understanding;
  /** Handwritten margin remark shown under the body. */
  hand?: string;
  expanded?: boolean;
  visual?: VisualDiagram;
  /** The board plan block this card realises (board.plan); optional. */
  planBlock?: string;
  /** Rich card content (PR-C); every field optional, older boards have none. */
  summary?: string;
  keyPoints?: string[];
  whyItMatters?: string;
  example?: string;
  misconception?: string;
  depthType?: DepthType;
  sources?: CardSource[];
}
/** The depth ladder: what → why → how → edge → apply; compare sits beside it. */
export type DepthType = "what" | "why" | "how" | "edge" | "apply" | "compare";
export interface CardSource {
  title: string;
  url?: string;
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
export interface CanvasArchive {
  id: string;
  runId: string;
  reason: string;
  node: ConceptNode;
  relations: Relation[];
  children?: Pick<ConceptNode, "id" | "parentId" | "order">[];
  noteBindings: {
    id: string;
    attachedTo?: StickyNote["attachedTo"];
    contextCards?: string[];
  }[];
  mergedInto?: string;
  createdAt: string;
}
export interface Board {
  version: 2;
  id: string;
  title: string;
  topic: string;
  kind: "walkthrough" | "ai";
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  canvasVersion?: string;
  appliedCanvasRuns?: string[];
  cardArchives?: CanvasArchive[];
  nodes: ConceptNode[];
  relations: Relation[];
  notes: StickyNote[];
  scene: SceneState;
  viewport?: { x: number; y: number; zoom: number };
  /** The learning plan behind the map (optional; older boards have none). */
  plan?: BoardPlan;
}
export type PlanIntent =
  | "concept"
  | "mechanism"
  | "decision"
  | "howto"
  | "learning-path"
  | "compare";
/** One block of the topic skeleton: a sub-question the map must answer. */
export interface PlanBlock {
  id: string;
  title: string;
  /** Why reaching the goal needs it. */
  why: string;
  /** A top-level block (null) becomes a first-level card; others sit under a top-level block. */
  parent: string | null;
  /** Blocks (ids) to understand first. */
  prerequisites: string[];
  /** Required by the question itself, whoever asks; the learner profile cannot drop it. */
  core: boolean;
}
export interface BoardPlan {
  /** draft: waiting for the learner to review it; confirmed: drives generation. */
  status: "draft" | "confirmed";
  intent: PlanIntent;
  /** Testable: "学完后，能……". */
  goal: string;
  /** A short learner profile from the kickoff (or "按初学者处理"). */
  learner: string;
  blocks: PlanBlock[];
  outOfScope: string[];
}
export interface BoardSummary {
  id: string;
  title: string;
  kind: Board["kind"];
  updatedAt: string;
  archivedAt?: string;
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
  /** Full card contents in the four-level review window; absent in older contexts. */
  review?: CardReview;
  /** The confirmed board plan, rendered for this request (model/plan.ts). */
  plan?: string;
}
export interface CardReview {
  scope?: "all";
  relations?: Relation[];
  radius: 4;
  anchors: string[];
  nodes: (Pick<
    ConceptNode,
    "id" | "parentId" | "order" | "title" | "body" | "visual"
  > & { level: number; bodyExcluded?: boolean })[];
}
export interface AISettings {
  model: string;
  baseUrl: string;
  customInstructions?: string;
  searchKey?: {
    source: "saved" | "session" | "none";
    keyHint?: string;
  };
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
  customInstructions?: string;
  deepseekApiKey?: string;
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
  canvas?: boolean;
  canvasRunId?: string;
  excludedCardIds?: string[];
  mode:
    | "answer"
    | "map"
    | "expand"
    | "hint"
    | "organize"
    | "enrich"
    | "plan"
    | "critique";
}
export interface AIUpdate {
  boardId: string;
  stickyId: string;
  requestId: string;
  text: string;
  status: "streaming" | "done" | "error" | "cancelled";
  error?: string;
}
export type CanvasRunStatus =
  | "running"
  | "paused"
  | "ready"
  | "applied"
  | "cancelled"
  | "failed"
  | "conflict";
export interface CanvasRun {
  id: string;
  boardId: string;
  stickyId: string;
  origin: "organize" | "chat";
  status: CanvasRunStatus;
  phase:
    | "structure"
    | "reading"
    | "locking"
    | "editing"
    | "relations"
    | "validating"
    | "complete";
  revision: number;
  reviewed: number;
  total: number;
  changed: boolean;
  summary: string;
  error?: string;
  draft?: Board;
  createdAt: string;
  updatedAt: string;
}
export interface CanvasRunEvent {
  run: CanvasRun;
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
  exportBoard(
    board: Board,
    format: "data" | "markdown" | "png",
    image?: string,
  ): Promise<boolean>;
  importBoard(text: string): Promise<Board>;
  getAISettings(): Promise<AISettings>;
  setAISettings(settings: AISettingsInput): Promise<AISettings>;
  testAIConnection(settings: AISettingsInput): Promise<AIConnectionResult>;
  ask(request: AIRequest): Promise<void>;
  stop(boardId: string, stickyId: string): Promise<void>;
  getHistory(boardId: string, stickyId: string): Promise<AIHistory>;
  startCanvasRun(boardId: string): Promise<CanvasRun>;
  listCanvasRuns(boardId: string): Promise<CanvasRun[]>;
  getCanvasRun(boardId: string, runId: string): Promise<CanvasRun | null>;
  prepareCanvasRun(boardId: string, runId: string): Promise<void>;
  resumeCanvasRun(boardId: string, runId: string): Promise<void>;
  cancelCanvasRun(boardId: string, runId: string): Promise<void>;
  commitCanvasRun(boardId: string, runId: string): Promise<Board>;
  onCanvasRun(callback: (event: CanvasRunEvent) => void): () => void;
  onAIUpdate(callback: (update: AIUpdate) => void): () => void;
}
declare global {
  interface Window {
    atlas?: AtlasAPI;
  }
}
