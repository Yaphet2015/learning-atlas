import { app } from "electron";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { AIRuntime } from "../dist-electron/electron/ai-runtime.js";
import { BoardStore } from "../dist-electron/electron/board-store.js";
import { installSystemFetch } from "../dist-electron/electron/system-fetch.js";

async function check() {
  if (!process.env.DS_API_KEY || !process.env.DS_BASE_URL)
    throw new Error("DS_API_KEY and DS_BASE_URL are required");
  installSystemFetch();
  const directory = await mkdtemp(join(tmpdir(), "studyboard-agent-live-"));
  const store = new BoardStore(join(directory, "boards"));
  const time = new Date().toISOString();
  const node = (id, title, body, parentId, order) => ({
    id,
    kind: "concept",
    title,
    body,
    parentId,
    order,
    status: "unseen",
  });
  const board = {
    version: 2,
    id: "live-" + randomUUID(),
    title: "浏览器渲染网页",
    topic: "浏览器如何把HTML和CSS变成页面",
    kind: "ai",
    createdAt: time,
    updatedAt: time,
    nodes: [
      {
        ...node(
          "root",
          "浏览器如何把HTML和CSS变成页面",
          "理解浏览器的渲染过程。",
          null,
          0,
        ),
        question: true,
      },
      node("dom", "DOM", "DOM负责定义元素的颜色和字体。", "root", 0),
      node("css", "样式计算", "根据CSS规则计算元素最终使用的样式。", "root", 1),
      node("layout", "布局", "计算元素在页面上的几何位置和大小。", "dom", 0),
    ],
    relations: [],
    notes: [],
    scene: {
      width: 200,
      color: "#88aa88",
      prediction: "",
      explanation: "",
      changed: null,
    },
  };
  await store.save(board);
  const runs = new Map();
  let last = "";
  const runtime = new AIRuntime(
    directory,
    () => {},
    null,
    {
      load: (id) => store.load(id),
      acquire: (run, expected) =>
        store.acquireCanvas(run.boardId, run.id, expected),
      release: (id, run) => store.releaseCanvas(id, run),
      commit: (id, run, expected, ops) =>
        store.commitCanvas(id, run, expected, ops),
    },
    (run) => {
      runs.set(run.id, run);
      const phase = JSON.stringify([
        run.origin,
        run.status,
        run.phase,
        run.revision,
        run.reviewed,
      ]);
      if (phase !== last) {
        last = phase;
        console.log(
          JSON.stringify({
            origin: run.origin,
            status: run.status,
            phase: run.phase,
            revision: run.revision,
            reviewed: run.reviewed,
            total: run.total,
          }),
        );
      }
    },
  );
  const wait = async (id) => {
    const start = Date.now();
    for (;;) {
      const run = runs.get(id);
      if (
        run &&
        [
          "ready",
          "applied",
          "failed",
          "conflict",
          "cancelled",
          "paused",
        ].includes(run.status)
      ) {
        assert.equal(
          run.status,
          "ready",
          run.error || "Agent did not finish its checks",
        );
        return run;
      }
      if (Date.now() - start > 8 * 60 * 1000)
        throw new Error("Live Agent test timed out");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };
  try {
    await runtime.setSettings({
      model: process.env.DS_MODEL || "deepseek-flash",
      baseUrl: process.env.DS_BASE_URL,
      apiKey: process.env.DS_API_KEY,
    });
    const organize = await runtime.startCanvasRun(board.id);
    await wait(organize.id);
    const organized = await runtime.commitCanvasRun(board.id, organize.id);
    assert.notEqual(
      organized.nodes.find((n) => n.id === "dom").body,
      board.nodes.find((n) => n.id === "dom").body,
    );
    assert.equal(
      organized.nodes.find((n) => n.id === "layout").parentId,
      "root",
    );
    console.log("PASS: live organization corrected content and hierarchy");
    const requestId = "chat-" + randomUUID();
    await runtime.ask({
      boardId: board.id,
      stickyId: "live-chat",
      requestId,
      mode: "answer",
      canvas: true,
      prompt:
        "这是临时画布上的CRUD验收。请实际用工具在root下创建两张卡：id为v8-keep和v8-temp，都解释V8执行JavaScript；然后读取它们，将v8-temp合并到v8-keep，并保留可恢复源记录。不要删除其他卡片。检查本轮受影响卡片和关系，最后调用canvas_finish。",
      context: { topic: board.topic, references: [], summary: "对话CRUD验收" },
    });
    await wait(requestId);
    const edited = await runtime.commitCanvasRun(board.id, requestId);
    assert(edited.nodes.some((n) => n.id === "v8-keep"));
    assert(!edited.nodes.some((n) => n.id === "v8-temp"));
    assert(
      edited.cardArchives.some(
        (a) => a.node.id === "v8-temp" && a.mergedInto === "v8-keep",
      ),
    );
    const repeat = await runtime.commitCanvasRun(board.id, requestId);
    assert.equal(repeat.nodes.length, edited.nodes.length);
    console.log(
      "PASS: live conversation created, read, merged and archived cards; commit replay was idempotent",
    );
    const archiveId = edited.cardArchives.find(
      (a) => a.node.id === "v8-temp",
    ).id;
    const restoreId = "restore-" + randomUUID();
    await runtime.ask({
      boardId: board.id,
      stickyId: "live-restore",
      requestId: restoreId,
      mode: "answer",
      canvas: true,
      prompt: `请实际调用restore操作恢复源记录 ${archiveId} 对应的原卡片，保留原内容和关联。不删除当前卡片，复核受影响关系后调用canvas_finish。`,
      context: {
        topic: board.topic,
        references: [],
        summary: "恢复源记录验收",
      },
    });
    await wait(restoreId);
    const restored = await runtime.commitCanvasRun(board.id, restoreId);
    assert(restored.nodes.some((n) => n.id === "v8-temp"));
    assert(!restored.cardArchives.some((a) => a.id === archiveId));
    console.log(
      "PASS: live source-record restoration preserved the original card identity",
    );
  } finally {
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  }
}
app
  .whenReady()
  .then(check)
  .then(
    () => app.exit(0),
    (error) => {
      // Only application-owned diagnostics are shown; provider payloads and credentials are omitted.
      const message = String(error.message || error).replaceAll(
        process.env.DS_API_KEY || "UNSET_SECRET",
        "<REDACTED>",
      );
      console.error("FAIL:", message);
      app.exit(1);
    },
  );
