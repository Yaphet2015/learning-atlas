import type { AtlasAPI, Board } from "./shared/types";
const key = "learning-atlas-preview-boards-v1";
function read(): Board[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  return JSON.parse(raw);
}
const preview: AtlasAPI = {
  onBeforeClose() {
    return () => {};
  },
  async listBoards() {
    return read().map(({ id, title, kind, updatedAt }) => ({
      id,
      title,
      kind,
      updatedAt,
    }));
  },
  async loadBoard(id) {
    return read().find((b) => b.id === id) ?? null;
  },
  async saveBoard(board) {
    const all = read();
    const index = all.findIndex((b) => b.id === board.id);
    if (index < 0) all.push(board);
    else all[index] = board;
    localStorage.setItem(key, JSON.stringify(all));
  },
  async deleteBoard(id) {
    localStorage.setItem(
      key,
      JSON.stringify(read().filter((b) => b.id !== id)),
    );
  },
  async getAISettings() {
    return {
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
      configured: false,
      source: "none",
    };
  },
  async setAISettings() {
    throw new Error(
      "AI 连接需要桌面客户端。浏览器预览只在本机保存白板，不接收 API 密钥。",
    );
  },
  async ask() {
    throw new Error("AI_NOT_CONFIGURED: 请在桌面客户端的 AI 设置中连接模型。");
  },
  async stop() {},
  async getHistory() {
    return { messages: [], running: false };
  },
  onAIUpdate() {
    return () => {};
  },
};
export const api = window.atlas ?? preview;
export const isDesktop = Boolean(window.atlas);
