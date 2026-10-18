import type { Page } from "@playwright/test";

/**
 * Installs a scripted stand-in for the Electron preload bridge (window.atlas) so web e2e can
 * drive configured-AI flows. Nothing reaches a model; answers are canned per request mode.
 */
export async function installFakeAtlas(
  page: Page,
  configured = true,
  platform = "web",
) {
  await page.addInitScript(
    ([isConfigured, os]: [boolean, string]) => {
      const fullscreen = new Set<(value: boolean) => void>();
      (window as any).__setFullscreen = (value: boolean) =>
        fullscreen.forEach((l) => l(value));
      const boards = new Map<string, any>();
      const listeners = new Set<(update: any) => void>();
      const asks: any[] = [];
      (window as any).__atlasAsks = asks;
      const answer = (request: any) => {
        if (request.mode === "map")
          return JSON.stringify({
            nodes: [
              {
                id: "light",
                title: "阳光里有哪些颜色？",
                body: "白光其实混着很多颜色。",
              },
              {
                id: "bend",
                title: "水滴怎样让光拐弯？",
                body: "进出水滴时光会折射。",
              },
              {
                id: "arc",
                title: "为什么是一道弧？",
                body: "只有特定角度的光会进到眼里。",
              },
            ],
            relations: [
              { source: "anchor", target: "light", label: "先看" },
              { source: "anchor", target: "bend", label: "再看" },
              { source: "anchor", target: "arc", label: "最后" },
            ],
          });
        return "在开始之前想先了解你：你听说过光的“折射”吗？你更想弄懂颜色从哪来，还是彩虹为什么是弯的？接下来我们会先拆成三个子问题：阳光的颜色、水滴里的折射、弧形的角度。";
      };
      (window as any).atlas = {
        platform: os,
        onFullscreenChange: (callback: (value: boolean) => void) => {
          fullscreen.add(callback);
          return () => fullscreen.delete(callback);
        },
        onBeforeClose: () => () => {},
        listBoards: async () =>
          [...boards.values()].map(({ id, title, kind, updatedAt }) => ({
            id,
            title,
            kind,
            updatedAt,
          })),
        loadBoard: async (id: string) => boards.get(id) ?? null,
        saveBoard: async (board: any) => void boards.set(board.id, board),
        deleteBoard: async (id: string) => void boards.delete(id),
        getAISettings: async () => ({
          model: "gpt-4o-mini",
          baseUrl: "https://api.openai.com/v1",
          configured: isConfigured,
          source: isConfigured ? "session" : "none",
        }),
        setAISettings: async (s: any) => ({
          ...s,
          configured: true,
          source: "session",
        }),
        testAIConnection: async (s: any) =>
          s.apiKey === "bad"
            ? {
                ok: false,
                kind: "auth",
                message: "鉴权失败：API Key 无效、已过期或没有这个模型的权限。",
                status: 401,
              }
            : { ok: true, model: s.model, latencyMs: 842 },
        ask: async (request: any) => {
          asks.push(request);
          setTimeout(() => {
            const update = {
              boardId: request.boardId,
              stickyId: request.stickyId,
              requestId: request.requestId,
              text: answer(request),
              status: "done",
            };
            listeners.forEach((l) => l(update));
          }, 120);
        },
        stop: async () => {},
        getHistory: async () => ({ messages: [], running: false }),
        onAIUpdate: (callback: (update: any) => void) => {
          listeners.add(callback);
          return () => listeners.delete(callback);
        },
      };
    },
    [configured, platform] as [boolean, string],
  );
}
