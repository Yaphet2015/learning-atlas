import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { BoardStore } from "./board-store.js";
import { AIRuntime, smokeDurableStorage } from "./ai-runtime.js";
import { z } from "zod";
import {
  boardSchema,
  aiRequestSchema,
  settingsSchema,
} from "../src/shared/validation.js";
const here = path.dirname(fileURLToPath(import.meta.url));
const developmentURL = process.env.ATLAS_DEV_SERVER;
let window: BrowserWindow | null = null;
let runtime: AIRuntime;
let quitting = false;
let closePending = false;
let rendererReady = false;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
app.setName("Learning Atlas");
if (process.env.ATLAS_E2E === "1" && process.env.ATLAS_TEST_USERDATA)
  app.setPath("userData", path.resolve(process.env.ATLAS_TEST_USERDATA));
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});
await app.whenReady();
if (process.env.ATLAS_SMOKE_TEST === "1") {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  const result = db.prepare("SELECT 42 AS answer").get();
  db.close();
  const smokeDir = await mkdtemp(path.join(tmpdir(), "learning-atlas-smoke-"));
  try {
    const durable = await smokeDurableStorage(smokeDir);
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
  app.quit();
} else {
  const store = new BoardStore(path.join(app.getPath("userData"), "boards"));
  runtime = new AIRuntime(
    path.join(app.getPath("userData"), "ai"),
    (update) => {
      if (window && !window.isDestroyed())
        window.webContents.send("atlas:ai-update", update);
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
  handle("atlas:list", () => store.list());
  handle("atlas:load", (value) => store.load(id.parse(value)));
  handle("atlas:save", (value) => store.save(boardSchema.parse(value)));
  handle("atlas:delete", (value) => store.delete(id.parse(value)));
  handle("atlas:ai-settings", () => runtime.getSettings());
  handle("atlas:configure-ai", (value) =>
    runtime.setSettings(settingsSchema.parse(value)),
  );
  handle("atlas:ask", (value) => {
    if (closePending) throw new Error("App is preparing to close");
    return runtime.ask(aiRequestSchema.parse(value));
  });
  handle("atlas:stop", (board, sticky) =>
    runtime.stop(id.parse(board), id.parse(sticky)),
  );
  handle("atlas:history", (board, sticky) =>
    runtime.getHistory(id.parse(board), id.parse(sticky)),
  );
  async function requestClose() {
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
      window?.webContents.send("atlas:before-close");
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
  handle("atlas:renderer-ready", () => {
    rendererReady = true;
  });
  handle("atlas:close-ready", async (saved) => {
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
      title: "Learning Atlas",
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
    window.webContents.on("render-process-gone", () => {
      rendererReady = false;
      closePending = false;
    });
    window.on("close", (event) => {
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
