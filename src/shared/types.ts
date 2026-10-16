export type Point = { x: number; y: number };
export type Understanding = "unseen" | "exploring" | "explained";
export interface VisualDiagram {
  kind: "process" | "parts" | "comparison";
  title?: string;
  labels: string[];
  caption?: string;
  basis: "literal" | "analogy";
}
export interface ConceptNode {
  id: string;
  kind: "concept" | "scene";
  title: string;
  body: string;
  /** null only for the root question. Tree edges are implied by parentId. */
  parentId: string | null;
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
}
export interface StickyNote {
  id: string;
  title: string;
  text: string;
  position: Point;
  attachedTo?: { kind: "node" | "relation"; id: string };
  messages: ChatMessage[];
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
}
export interface AISettings {
  model: string;
  baseUrl: string;
  configured: boolean;
  source: "session" | "environment" | "none";
}
export interface AISettingsInput {
  model: string;
  baseUrl: string;
  apiKey?: string;
}
export interface AIRequest {
  boardId: string;
  stickyId: string;
  requestId: string;
  prompt: string;
  context: ContextBundle;
  mode: "answer" | "map" | "expand";
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
  onBeforeClose(callback: () => Promise<void>): () => void;
  listBoards(): Promise<BoardSummary[]>;
  loadBoard(id: string): Promise<Board | null>;
  saveBoard(board: Board): Promise<void>;
  deleteBoard(id: string): Promise<void>;
  getAISettings(): Promise<AISettings>;
  setAISettings(settings: AISettingsInput): Promise<AISettings>;
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
