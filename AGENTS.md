# AGENTS.md

给 AI 助手的项目规则。改代码前先读这里。

## 网络请求必须跟随系统代理（强制）

**要求**：应用的所有对外请求，在 dev 和打包版都必须默认跟随操作系统代理。

**背景**：主进程的 Node `fetch`（undici）默认直连——既不读 macOS 系统代理，也不读 `HTTP(S)_PROXY` 环境变量。渲染进程走 Chromium 栈不受影响；问题只在主进程。

**现状实现**：`electron/system-fetch.ts` 把主进程 `globalThis.fetch` 替换为 Electron `net.fetch`（Chromium 网络栈，原生跟随系统代理、PAC、SOCKS、绕过列表）。`electron/main.ts` 在入口最早处调用 `installSystemFetch()`。

**改动规则**：

1. 主进程新增对外 HTTP(S) 请求，一律用全局 `fetch`（已被补丁接管），或直接用 `net.fetch`。
2. 禁止引入绕过补丁的传输方式：裸 `undici`、`node:http`/`node:https`、`axios`、`got`、`ws` 直连外网端点。它们都不读系统代理。
3. 不要移除或延后 `installSystemFetch()` 调用；它必须在任何请求发生前执行。
4. 库支持注入 fetch 时（如 pi-ai 的 `options.fetch`），注入全局 `fetch`，不要另造原生 fetch。
5. 改动涉及网络路径时，必须验证（证据先行，再宣称完成）：

```bash
# 把 <repo> 替换为仓库绝对路径；打补丁的 fetch 应经系统代理返回 204（而非直连超时）
cat > /tmp/check-proxy-fetch.mjs <<'EOF'
import { app } from "electron";
import { installSystemFetch } from "<repo>/dist-electron/electron/system-fetch.js";
app.whenReady().then(async () => {
  installSystemFetch();
  try {
    const r = await fetch("https://www.google.com/generate_204");
    console.log(r.status === 204 ? "PASS" : `UNEXPECTED ${r.status}`);
  } catch (e) {
    console.log("FAIL:", e.cause?.code || e.message);
  }
  app.exit(0);
});
EOF
pnpm exec electron /tmp/check-proxy-fetch.mjs
```

再跑 `pnpm typecheck`；动过主进程启动链路时，追加打包冒烟：
`pnpm dist:dir && STUDYBOARD_SMOKE_TEST=1 ./release/mac-arm64/Studyboard.app/Contents/MacOS/Studyboard`
（注意：先确认没有残留的 Studyboard 实例占用 `requestSingleInstanceLock()`，否则冒烟会在 ready 前静默退出。）
