import { contextBridge, ipcRenderer } from "electron";
import type { AtlasAPI, AIUpdate } from "../src/shared/types.js";
const api: AtlasAPI = {
  onBeforeClose: (callback) => {
    const listener = () => {
      void callback()
        .then(() => ipcRenderer.invoke("atlas:close-ready", true))
        .catch(() => ipcRenderer.invoke("atlas:close-ready", false));
    };
    ipcRenderer.on("atlas:before-close", listener);
    void ipcRenderer.invoke("atlas:renderer-ready");
    return () => ipcRenderer.removeListener("atlas:before-close", listener);
  },
  listBoards: () => ipcRenderer.invoke("atlas:list"),
  loadBoard: (id) => ipcRenderer.invoke("atlas:load", id),
  saveBoard: (board) => ipcRenderer.invoke("atlas:save", board),
  deleteBoard: (id) => ipcRenderer.invoke("atlas:delete", id),
  getAISettings: () => ipcRenderer.invoke("atlas:ai-settings"),
  setAISettings: (settings) =>
    ipcRenderer.invoke("atlas:configure-ai", settings),
  testAIConnection: (settings) => ipcRenderer.invoke("atlas:test-ai", settings),
  ask: (request) => ipcRenderer.invoke("atlas:ask", request),
  stop: (board, sticky) => ipcRenderer.invoke("atlas:stop", board, sticky),
  getHistory: (board, sticky) =>
    ipcRenderer.invoke("atlas:history", board, sticky),
  onAIUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, update: AIUpdate) =>
      callback(update);
    ipcRenderer.on("atlas:ai-update", listener);
    return () => ipcRenderer.removeListener("atlas:ai-update", listener);
  },
};
contextBridge.exposeInMainWorld("atlas", api);
