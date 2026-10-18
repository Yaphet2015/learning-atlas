import { contextBridge, ipcRenderer } from "electron";
import type { AtlasAPI, AIUpdate } from "../src/shared/types.js";
const api: AtlasAPI = {
  platform: process.platform,
  onFullscreenChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: boolean) =>
      callback(value === true);
    ipcRenderer.on("studyboard:fullscreen", listener);
    return () => ipcRenderer.removeListener("studyboard:fullscreen", listener);
  },
  onOpenSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("studyboard:open-settings", listener);
    return () =>
      ipcRenderer.removeListener("studyboard:open-settings", listener);
  },
  onBeforeClose: (callback) => {
    const listener = () => {
      void callback()
        .then(() => ipcRenderer.invoke("studyboard:close-ready", true))
        .catch(() => ipcRenderer.invoke("studyboard:close-ready", false));
    };
    ipcRenderer.on("studyboard:before-close", listener);
    void ipcRenderer.invoke("studyboard:renderer-ready");
    return () =>
      ipcRenderer.removeListener("studyboard:before-close", listener);
  },
  listBoards: () => ipcRenderer.invoke("studyboard:list"),
  loadBoard: (id) => ipcRenderer.invoke("studyboard:load", id),
  saveBoard: (board) => ipcRenderer.invoke("studyboard:save", board),
  deleteBoard: (id) => ipcRenderer.invoke("studyboard:delete", id),
  getAISettings: () => ipcRenderer.invoke("studyboard:ai-settings"),
  setAISettings: (settings) =>
    ipcRenderer.invoke("studyboard:configure-ai", settings),
  testAIConnection: (settings) =>
    ipcRenderer.invoke("studyboard:test-ai", settings),
  ask: (request) => ipcRenderer.invoke("studyboard:ask", request),
  stop: (board, sticky) => ipcRenderer.invoke("studyboard:stop", board, sticky),
  getHistory: (board, sticky) =>
    ipcRenderer.invoke("studyboard:history", board, sticky),
  onAIUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, update: AIUpdate) =>
      callback(update);
    ipcRenderer.on("studyboard:ai-update", listener);
    return () => ipcRenderer.removeListener("studyboard:ai-update", listener);
  },
};
contextBridge.exposeInMainWorld("atlas", api);
