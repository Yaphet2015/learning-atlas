import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { BoardStore } from "./board-store.js";
import { migrateLegacyUserData } from "./legacy-data.js";
import { AIRuntime, smokeDurableStorage } from "./ai-runtime.js";
import { z } from "zod";
import {
  boardSchema,
  aiRequestSchema,
  settingsSchema,
} from "../src/shared/validation.js";
const here = path.dirname(fileURLToPath(import.meta.url));
// Packaged builds use build/icon.icns; dev runs show the PNG in the dock.
const devIcon = path.join(here, "../../build/icon.png");
const developmentURL = process.env.STUDYBOARD_DEV_SERVER;
let window: BrowserWindow | null = null;
let runtime: AIRuntime;
let quitting = false;
let closePending = false;
let rendererReady = false;
function traceClose(stage: string): void {
  if (process.env.STUDYBOARD_E2E === "1") console.info(`[close] ${stage}`);
}
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
app.setName("Studyboard");
if (process.env.STUDYBOARD_E2E === "1" && process.env.STUDYBOARD_TEST_USERDATA)
  app.setPath("userData", path.resolve(process.env.STUDYBOARD_TEST_USERDATA));
else if (process.env.STUDYBOARD_SMOKE_TEST !== "1")
  try {
    // The app used to be "Learning Atlas"; bring old boards across once.
    migrateLegacyUserData(
      app.getPath("appData"),
      app.getPath("userData"),
      console.info,
    );
  } catch (error) {
    console.error("[migrate] could not copy Learning Atlas data", error);
  }
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});
// Electron does not emit ready until the ESM entry module finishes evaluating.
// Await readiness in a callback, never as a top-level await in this entry point.
if (process.env.STUDYBOARD_SMOKE_TEST === "1")
  console.info("[smoke] entry module loaded; waiting for Electron ready");
async function bootstrap(): Promise<void> {
  if (process.env.STUDYBOARD_SMOKE_TEST === "1") {
    console.info(
      `[smoke] Electron ready: Electron ${process.versions.electron}, Node ${process.versions.node}`,
    );
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(":memory:");
    const result = db.prepare("SELECT 42 AS answer").get();
    db.close();
    console.info("[smoke] node:sqlite verified");
    const smokeDir = await mkdtemp(path.join(tmpdir(), "studyboard-smoke-"));
    try {
      console.info(
        "[smoke] opening durable SQLite, committing, closing and reopening",
      );
      const durable = await smokeDurableStorage(smokeDir);
      console.info("[smoke] durable reopen verified");
      console.log(
        JSON.stringify({
          electron: process.versions.electron,
          node: process.versions.node,
          sqlite: result,
          durable,
        }),
      );
    } finally {
      await rm(smokeDir, { recursive: true, force: true });
    }
    console.info("[smoke] complete; quitting Electron");
    app.quit();
  } else {
    if (!app.isPackaged) app.dock?.setIcon(devIcon);
    const store = new BoardStore(path.join(app.getPath("userData"), "boards"));
    runtime = new AIRuntime(
      path.join(app.getPath("userData"), "ai"),
      (update) => {
        if (window && !window.isDestroyed())
          window.webContents.send("studyboard:ai-update", update);
      },
    );
    function assertSender(event: Electron.IpcMainInvokeEvent) {
      const url = event.senderFrame?.url;
      if (event.sender !== window?.webContents || !url)
        throw new Error("Untrusted sender");
      if (
        developmentURL
          ? new URL(url).origin !== new URL(developmentURL).origin
          : !url.startsWith("file://")
      )
        throw new Error("Untrusted origin");
    }
    function handle(channel: string, fn: (...args: any[]) => unknown) {
      ipcMain.handle(channel, async (event, ...args) => {
        assertSender(event);
        return fn(...args);
      });
    }
    handle("studyboard:list", () => store.list());
    handle("studyboard:load", (value) => store.load(id.parse(value)));
    handle("studyboard:save", (value) => store.save(boardSchema.parse(value)));
    handle("studyboard:delete", (value) => store.delete(id.parse(value)));
    handle("studyboard:ai-settings", () => runtime.getSettings());
    handle("studyboard:configure-ai", (value) =>
      runtime.setSettings(settingsSchema.parse(value)),
    );
    handle("studyboard:test-ai", (value) =>
      runtime.testConnection(settingsSchema.parse(value)),
    );
    handle("studyboard:ask", (value) => {
      if (closePending) throw new Error("App is preparing to close");
      return runtime.ask(aiRequestSchema.parse(value));
    });
    handle("studyboard:stop", (board, sticky) =>
      runtime.stop(id.parse(board), id.parse(sticky)),
    );
    handle("studyboard:history", (board, sticky) =>
      runtime.getHistory(id.parse(board), id.parse(sticky)),
    );
    async function requestClose() {
      traceClose(
        `request received; pending=${closePending}; rendererReady=${rendererReady}`,
      );
      if (closePending) return;
      closePending = true;
      if (!rendererReady) {
        await runtime.close();
        quitting = true;
        app.quit();
        return;
      }
      try {
        await runtime.quiesce();
        traceClose("AI quiesced; requesting renderer save");
        window?.webContents.send("studyboard:before-close");
      } catch {
        closePending = false;
        await dialog.showMessageBox(window!, {
          type: "error",
          message: "暂时无法关闭 AI 会话",
          detail: "请停止回答后再重试关闭。",
          buttons: ["回到白板"],
        });
      }
    }
    handle("studyboard:renderer-ready", () => {
      rendererReady = true;
      traceClose("renderer save handler ready");
    });
    handle("studyboard:close-ready", async (saved) => {
      traceClose(`renderer save acknowledged: ${saved === true}`);
      if (saved !== true) {
        closePending = false;
        await dialog.showMessageBox(window!, {
          type: "error",
          message: "白板尚未保存",
          detail: "请先重试保存，再关闭应用。",
          buttons: ["回到白板"],
        });
        return;
      }
      await runtime.close();
      traceClose("runtime closed; quitting app");
      quitting = true;
      app.quit();
    });
    function createWindow() {
      window = new BrowserWindow({
        width: 1512,
        height: 982,
        minWidth: 1060,
        minHeight: 720,
        backgroundColor: "#f6f7f3",
        title: "Studyboard",
        icon: app.isPackaged ? undefined : devIcon,
        titleBarStyle: "hiddenInset",
        trafficLightPosition: { x: 20, y: 20 },
        webPreferences: {
          preload: path.join(here, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      rendererReady = false;
      // Fullscreen hides the traffic lights; the renderer drops its left inset there.
      for (const [event, value] of [
        ["enter-full-screen", true],
        ["leave-full-screen", false],
      ] as const)
        window.on(event as "enter-full-screen", () =>
          window?.webContents.send("studyboard:fullscreen", value),
        );
      window.webContents.on("render-process-gone", () => {
        rendererReady = false;
        closePending = false;
      });
      window.on("close", (event) => {
        traceClose(`native window close; quitting=${quitting}`);
        if (!quitting) {
          event.preventDefault();
          requestClose();
        }
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (
          developmentURL
            ? new URL(url).origin !== new URL(developmentURL).origin
            : url !== window?.webContents.getURL()
        )
          event.preventDefault();
      });
      window.webContents.session.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      window.webContents.session.setPermissionCheckHandler(() => false);
      if (developmentURL) void window.loadURL(developmentURL);
      else void window.loadFile(path.join(here, "../../dist/index.html"));
    }
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    app.on("window-all-closed", () => {
      app.quit();
    });
    app.on("before-quit", (event) => {
      if (quitting) return;
      event.preventDefault();
      requestClose();
    });
  }
}
void app
  .whenReady()
  .then(bootstrap)
  .catch((error: unknown) => {
    console.error(
      "[startup] failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    app.exit(1);
  });
