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
      // Ghost-hint requests are recorded apart so flows that count asks stay exact.
      const hints: any[] = [];
      (window as any).__atlasHints = hints;
      // So are the quiet diagram/overview follow-ups after new cards land.
      const enriches: any[] = [];
      (window as any).__atlasEnriches = enriches;
      const answer = (request: any) => {
        if (request.mode === "enrich")
          return (
            (window as any).__atlasEnrichAnswers?.shift() ??
            JSON.stringify({ visuals: [], overviews: [] })
          );
        if (request.mode === "organize")
          return (window as any).__atlasOrganizationAnswers?.shift() ?? "{}";
        if (request.mode === "expand")
          return (
            (window as any).__atlasExpansionAnswers?.shift() ??
            JSON.stringify({ nodes: [], relations: [] })
          );
        if (request.mode === "hint") {
          const i = hints.indexOf(request);
          return JSON.stringify({
            below: "提示·子" + i,
            right: "提示·并列" + i,
            above: "提示·更大" + i,
          });
        }
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
      const canvasListeners = new Set<(event: any) => void>();
      const canvasRuns = new Map<string, any>();
      const emitCanvas = (run: any) => {
        canvasRuns.set(run.id, run);
        canvasListeners.forEach((callback) =>
          callback({ run: structuredClone(run) }),
        );
      };
      const startCanvas = async (
        boardId: string,
        origin = "organize",
        requestId?: string,
      ) => {
        if ((window as any).__atlasOrganizationError)
          throw new Error("整理请求失败，请重试。");
        const board = structuredClone(boards.get(boardId));
        const id = requestId ?? "canvas-" + crypto.randomUUID();
        const run = {
          id,
          boardId,
          stickyId: origin === "organize" ? "canvas-" + id : "chat-canvas",
          origin,
          status: "running",
          phase: "structure",
          revision: 0,
          reviewed: 0,
          total: board.nodes.length,
          changed: false,
          summary: "",
          draft: board,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        emitCanvas(run);
        setTimeout(() => {
          if (canvasRuns.get(id)?.status !== "running") return;
          emitCanvas({ ...run, phase: "locking" });
        }, 100);
        return structuredClone(run);
      };
      (window as any).atlas = {
        platform: os,
        onFullscreenChange: (callback: (value: boolean) => void) => {
          fullscreen.add(callback);
          return () => fullscreen.delete(callback);
        },
        onBeforeClose: () => () => {},
        listBoards: async () =>
          [...boards.values()].map(
            ({ id, title, kind, updatedAt, archivedAt }) => ({
              id,
              title,
              kind,
              updatedAt,
              ...(archivedAt ? { archivedAt } : {}),
            }),
          ),
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
          const { apiKey, deepseekApiKey, ...rest } = s;
          if (deepseekApiKey !== undefined) {
            settings.searchKey = deepseekApiKey
              ? {
                  source: "saved",
                  keyHint: `sk-••••${String(deepseekApiKey).slice(-4)}`,
                }
              : { source: "none" };
          }
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
        onCanvasRun: (callback: (event: any) => void) => {
          canvasListeners.add(callback);
          return () => canvasListeners.delete(callback);
        },
        startCanvasRun: async (boardId: string) => {
          asks.push({
            mode: "organize",
            boardId,
            context: {
              topic: boards.get(boardId)?.topic,
              references: [],
              summary: "整理全画布",
            },
          });
          return startCanvas(boardId);
        },
        listCanvasRuns: async (boardId: string) =>
          [...canvasRuns.values()]
            .filter((run) => run.boardId === boardId)
            .map(({ draft, ...run }) => run),
        getCanvasRun: async (_boardId: string, id: string) =>
          canvasRuns.get(id) ?? null,
        prepareCanvasRun: async (_boardId: string, id: string) => {
          const run = canvasRuns.get(id);
          if (!run || run.status !== "running") return;
          const custom = (window as any).__atlasCanvasDraft;
          const draft = custom
            ? {
                ...run.draft,
                ...structuredClone(custom),
                nodes: custom.nodes.map((node: any) => ({
                  ...run.draft.nodes.find((n: any) => n.id === node.id),
                  ...node,
                })),
              }
            : run.draft;
          emitCanvas({
            ...run,
            draft,
            changed: true,
            revision: 1,
            phase: "editing",
          });
          setTimeout(() => {
            const current = canvasRuns.get(id);
            if (current?.status !== "running") return;
            emitCanvas({
              ...current,
              status: (window as any).__atlasCanvasFail ? "failed" : "ready",
              phase: "validating",
              reviewed: draft.nodes.length,
              summary: "画布修改已完成，可撤销恢复。",
              ...((window as any).__atlasCanvasFail
                ? { error: "本轮校对未完成，修改未提交。" }
                : {}),
            });
          }, 900);
        },
        commitCanvasRun: async (boardId: string, id: string) => {
          const run = canvasRuns.get(id);
          const current = boards.get(boardId);
          const result = {
            ...current,
            nodes: run.draft.nodes,
            relations: run.draft.relations,
            canvasVersion: id,
          };
          boards.set(boardId, result);
          persist();
          emitCanvas({
            ...run,
            status: "applied",
            phase: "complete",
            draft: result,
          });
          return structuredClone(result);
        },
        resumeCanvasRun: async (boardId: string, id: string) => {
          const run = canvasRuns.get(id);
          if (run) emitCanvas({ ...run, status: "running", phase: "locking" });
        },
        cancelCanvasRun: async (_boardId: string, id: string) => {
          const run = canvasRuns.get(id);
          if (run) emitCanvas({ ...run, status: "cancelled" });
        },
        ask: async (request: any) => {
          if (
            request.mode === "organize" &&
            (window as any).__atlasOrganizationError
          )
            throw new Error("整理请求失败，请重试。");
          (request.mode === "hint"
            ? hints
            : request.mode === "enrich"
              ? enriches
              : asks
          ).push(request);
          if (request.canvas && (window as any).__atlasChatCanvas) {
            void startCanvas(request.boardId, "chat", request.requestId);
          }
          const emit = (text: string, status: string) =>
            listeners.forEach((l) =>
              l({
                boardId: request.boardId,
                stickyId: request.stickyId,
                requestId: request.requestId,
                text,
                status,
              }),
            );
          // Tests that look at the streaming state set __atlasSlow: think, stream half, finish.
          const slow = (window as any).__atlasSlow as number | undefined;
          if (slow && request.mode === "answer") {
            const full = answer(request);
            setTimeout(() => emit("", "streaming"), 20);
            setTimeout(
              () =>
                emit(full.slice(0, Math.ceil(full.length / 2)), "streaming"),
              slow,
            );
            setTimeout(() => emit(full, "done"), slow * 2);
            return;
          }
          setTimeout(
            () => emit(answer(request), "done"),
            request.mode === "organize" ? 900 : 120,
          );
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
