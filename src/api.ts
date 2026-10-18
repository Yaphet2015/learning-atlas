import type { AtlasAPI, Board } from "./shared/types";
import { safeParseBoard } from "./shared/validation";
import { migrateLegacyPreview, PREVIEW_KEY } from "./preview-storage";
const key = PREVIEW_KEY;
function read(): Board[] {
  migrateLegacyPreview();
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  const all: unknown[] = JSON.parse(raw);
  // Upgrade v1 previews in place; drop anything that no longer validates.
  return all.flatMap((item) => {
    const result = safeParseBoard(item);
    return result.success ? [result.data as Board] : [];
  });
}
const preview: AtlasAPI = {
  platform: "web",
  onFullscreenChange() {
    return () => {};
  },
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
      keyStorage: "web",
    };
  },
  async setAISettings() {
    throw new Error(
      "AI 连接需要桌面客户端。浏览器预览只在本机保存白板，不接收 API 密钥。",
    );
  },
  async testAIConnection() {
    return {
      ok: false,
      kind: "config",
      message: "浏览器预览不能测试连接：请在桌面客户端中配置 AI。",
    };
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
