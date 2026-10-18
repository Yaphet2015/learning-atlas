import type { Page } from "@playwright/test";

/**
 * Installs a scripted stand-in for the Electron preload bridge (window.atlas) so web e2e can
 * drive configured-AI flows. Nothing reaches a model; answers are canned per request mode.
 */
export async function installFakeAtlas(
  page: Page,
  configured = true,
  platform = "web",
  /** Boards on "disk": kept in localStorage so they survive a reload, like the Electron files. */
  seed?: unknown[],
) {
  await page.addInitScript(
    ([isConfigured, os, seeded]: [boolean, string, string | null]) => {
      const fullscreen = new Set<(value: boolean) => void>();
      (window as any).__setFullscreen = (value: boolean) =>
        fullscreen.forEach((l) => l(value));
      const DISK = "fake-atlas-disk";
      if (seeded && localStorage.getItem(DISK) === null)
        localStorage.setItem(DISK, seeded);
      const boards = new Map<string, any>(
        (JSON.parse(localStorage.getItem(DISK) ?? "[]") as any[]).map((b) => [
          b.id,
          b,
        ]),
      );
      const persist = () =>
        localStorage.setItem(DISK, JSON.stringify([...boards.values()]));
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
            // A chain the old “first incoming edge” rule turned into a vertical stack.
            relations: [
              { source: "light", target: "bend", label: "先看" },
              { source: "bend", target: "arc", label: "然后" },
            ],
          });
        return "在开始之前想先了解你：你听说过光的“折射”吗？你更想弄懂颜色从哪来，还是彩虹为什么是弯的？接下来我们会先拆成三个子问题：阳光的颜色、水滴里的折射、弧形的角度。";
      };
      let settings: any = {
        model: "gpt-4o-mini",
        baseUrl: "https://api.openai.com/v1",
        configured: isConfigured,
        source: isConfigured ? "saved" : "none",
        keyStorage: "encrypted",
        ...(isConfigured ? { keyHint: "sk-••••7f3a" } : {}),
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
        saveBoard: async (board: any) => {
          boards.set(board.id, board);
          persist();
        },
        deleteBoard: async (id: string) => {
          boards.delete(id);
          persist();
        },
        getAISettings: async () => ({ ...settings }),
        // Like the desktop runtime with safeStorage: a key is saved encrypted, shown masked.
        setAISettings: async (s: any) => {
          const { apiKey, ...rest } = s;
          if (apiKey === "")
            settings = {
              ...settings,
              ...rest,
              configured: false,
              source: "none",
            };
          else if (apiKey)
            settings = {
              ...settings,
              ...rest,
              configured: true,
              source: "saved",
              keyHint: `sk-••••${String(apiKey).slice(-4)}`,
            };
          else settings = { ...settings, ...rest };
          if (!settings.configured) delete settings.keyHint;
          return { ...settings };
        },
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
    [configured, platform, seed ? JSON.stringify(seed) : null] as [
      boolean,
      string,
      string | null,
    ],
  );
}
