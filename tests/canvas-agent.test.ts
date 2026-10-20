import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIRuntime } from "../electron/ai-runtime";
import { BoardStore } from "../electron/board-store";
import { applyCanvasEdits, canvasFingerprint } from "../src/shared/canvas";
import { createEmptyBoard, newNote } from "../src/model/boards";
import type { CanvasRun } from "../src/shared/types";

const directories: string[] = [];
const runtimes: AIRuntime[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((r) => r.close()));
  await Promise.all(
    directories.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function fixture() {
  const b = createEmptyBoard("浏览器渲染");
  b.nodes.push(
    {
      id: "dom",
      kind: "concept",
      title: "DOM",
      body: "DOCUMENT_BODY_ONLY_AFTER_READ",
      parentId: b.nodes[0].id,
      order: 0,
      status: "explained",
      hand: "我的解释",
    },
    {
      id: "style",
      kind: "concept",
      title: "CSS",
      body: "样式计算",
      parentId: b.nodes[0].id,
      order: 1,
      status: "unseen",
    },
  );
  const note = newNote(b, { x: 0, y: 0 }, { kind: "node", id: "dom" });
  note.text = "保留笔记";
  b.notes.push(note);
  return b;
}
describe("canvas domain", () => {
  it("validates an entire hierarchy exchange and preserves the original question above/beside roots", () => {
    const b = fixture();
    b.nodes.find((n) => n.id === "style")!.parentId = "dom";
    const next = applyCanvasEdits(
      b,
      [
        { op: "move", id: "dom", parentId: "style", order: 0 },
        { op: "move", id: "style", parentId: b.nodes[0].id, order: 0 },
      ],
      "run",
      "2026-10-19T00:00:00Z",
    );
    expect(next.nodes.find((n) => n.id === "dom")?.parentId).toBe("style");
    expect(b.nodes.find((n) => n.id === "dom")?.parentId).toBe(b.nodes[0].id);
  });
  it("archives merged evidence, redirects notes, and restores the source", () => {
    const b = fixture();
    const merged = applyCanvasEdits(
      b,
      [{ op: "merge", id: "dom", targetId: "style", reason: "测试合并" }],
      "run",
      "2026-10-19T00:00:00Z",
    );
    expect(merged.cardArchives?.[0].node).toMatchObject({
      id: "dom",
      status: "explained",
      hand: "我的解释",
    });
    expect(merged.notes[0]).toMatchObject({
      text: "保留笔记",
      attachedTo: { id: "style" },
    });
    const restored = applyCanvasEdits(
      merged,
      [{ op: "restore", id: merged.cardArchives![0].id }],
      "restore-run",
      "2026-10-19T00:00:00Z",
    );
    expect(restored.nodes.find((n) => n.id === "dom")?.hand).toBe("我的解释");
    expect(restored.notes[0].attachedTo?.id).toBe("dom");
  });
  it("rejects cycles, protected changes, and edits to excluded content atomically", () => {
    const b = fixture();
    const before = structuredClone(b);
    expect(() =>
      applyCanvasEdits(
        b,
        [{ op: "move", id: "dom", parentId: "dom", order: 0 }],
        "run",
        "2026-10-19T00:00:00Z",
      ),
    ).toThrow();
    expect(() =>
      applyCanvasEdits(
        b,
        [{ op: "delete", id: b.nodes[0].id, reason: "delete" }],
        "run",
        "2026-10-19T00:00:00Z",
      ),
    ).toThrow();
    expect(() =>
      applyCanvasEdits(
        b,
        [{ op: "update", id: "dom", body: "overwrite" }],
        "run",
        "2026-10-19T00:00:00Z",
        ["dom"],
      ),
    ).toThrow();
    expect(b).toEqual(before);
  });
});

it.each([false, true])(
  "runs real Pi tool rounds and finishes with mixed tools=%s",
  async (mixed) => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const dir = await mkdtemp(join(tmpdir(), "canvas-agent-test-"));
    directories.push(dir);
    const b = fixture();
    const store = new BoardStore(join(dir, "boards"));
    await store.save(b);
    const ids = b.nodes.map((n) => n.id);
    const calls: [string, unknown][] = [
      ["canvas_structure", {}],
      ["canvas_read", { ids }],
      [
        "canvas_edit",
        {
          reason: "校对DOM解释",
          operations: [
            { op: "update", id: "dom", body: "DOM 是文档节点组成的树。" },
          ],
        },
      ],
      ["canvas_read", { ids }],
      [
        "canvas_review",
        { ids, revision: 1, conclusion: "内容与父子层级已校对" },
      ],
      ["canvas_finish", { summary: "已校对文档结构说明。" }],
    ];
    if (mixed)
      calls.push(["canvas_finish", { summary: "已校对文档结构说明。" }]);
    const payloads: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        if (String(_url).startsWith("https://mcp.exa.ai/"))
          throw new Error("Exa unavailable in this fixture");
        payloads.push(JSON.parse(init.body));
        const call = calls[payloads.length - 1];
        if (!call) throw new Error("unexpected generation");
        const chunk = {
          id: "completion",
          object: "chat.completion.chunk",
          created: 1700000000,
          model: "deepseek-flash",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call-" + payloads.length,
                    type: "function",
                    function: {
                      name: call[0],
                      arguments: JSON.stringify(call[1]),
                    },
                  },
                  ...(mixed && payloads.length === calls.length - 1
                    ? [
                        {
                          index: 1,
                          id: "search-with-finish",
                          type: "function",
                          function: {
                            name: "web_search",
                            arguments: JSON.stringify({
                              query: "DOM document tree",
                            }),
                          },
                        },
                      ]
                    : []),
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        };
        return new Response(
          `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        );
      }),
    );
    const events: CanvasRun[] = [];
    const runtime = new AIRuntime(
      dir,
      () => {},
      null,
      {
        load: (id) => store.load(id),
        acquire: (run, expected) =>
          store.acquireCanvas(run.boardId, run.id, expected),
        release: (board, id) => store.releaseCanvas(board, id),
        commit: (board, id, expected, ops) =>
          store.commitCanvas(board, id, expected, ops),
      },
      (run) => events.push(run),
    );
    runtimes.push(runtime);
    await runtime.setSettings({
      model: "deepseek-flash",
      baseUrl: "http://localhost:12345/v1",
      apiKey: "TEST_SECRET",
      customInstructions: "CANVAS_CUSTOM_PREFERENCE：先给结论。",
    });
    const run = await runtime.startCanvasRun(b.id);
    try {
      await vi.waitFor(() => expect(events.at(-1)?.status).toBe("ready"), {
        timeout: 2500,
      });
    } catch {
      throw new Error(
        JSON.stringify({
          events: events.map((e) => ({
            status: e.status,
            phase: e.phase,
            error: e.error,
          })),
          calls: payloads.length,
          toolResults: payloads
            .at(-1)
            ?.messages.filter((m: any) => m.role === "tool")
            .map((m: any) => m.content),
        }),
      );
    }
    expect(
      events.some(
        (e) =>
          e.changed &&
          e.status === "running" &&
          e.draft?.nodes.find((n) => n.id === "dom")?.body ===
            "DOM 是文档节点组成的树。",
      ),
    ).toBe(true);
    expect(JSON.stringify(payloads[0].messages)).not.toContain(
      "DOCUMENT_BODY_ONLY_AFTER_READ",
    );
    expect(JSON.stringify(payloads[0].messages)).toContain(
      "CANVAS_CUSTOM_PREFERENCE",
    );
    expect(payloads).toHaveLength(calls.length);
    await vi.waitFor(async () =>
      expect(
        (await runtime.getHistory(b.id, run.stickyId)).messages.some(
          (message) =>
            message.role === "assistant" &&
            message.text === "已校对文档结构说明。",
        ),
      ).toBe(true),
    );
    const result = await runtime.commitCanvasRun(b.id, run.id);
    expect(result.nodes.find((n) => n.id === "dom")).toMatchObject({
      body: "DOM 是文档节点组成的树。",
      status: "explained",
      hand: "我的解释",
    });
    expect(result.notes[0].text).toBe("保留笔记");
    expect((await runtime.commitCanvasRun(b.id, run.id)).nodes).toEqual(
      result.nodes,
    );
    await expect(store.save(b)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(canvasFingerprint((await store.load(b.id))!)).toBe(
      canvasFingerprint(result),
    );
  },
);

it("exports and imports recoverable source records with their bindings", async () => {
  const {
    collectBoardTransfer,
    parseBoardTransfer,
    importedBoard,
    transferMarkdown,
  } = await import("../src/shared/transfer");
  const b = fixture();
  b.nodes.find((node) => node.id === "style")!.parentId = "dom";
  const archived = applyCanvasEdits(
    b,
    [{ op: "delete", id: "dom", reason: "校对后移除" }],
    "portable-run",
    new Date().toISOString(),
  );
  const transfer = await collectBoardTransfer(archived, async () => ({
    messages: [],
    running: false,
  }));
  const restored = importedBoard(parseBoardTransfer(JSON.stringify(transfer)));
  expect(restored.cardArchives).toEqual(archived.cardArchives);
  expect(transferMarkdown(transfer)).toContain("可恢复的源卡片");
  const recovered = applyCanvasEdits(
    restored,
    [{ op: "restore", id: restored.cardArchives![0].id }],
    "restore-portable",
    new Date().toISOString(),
  );
  expect(recovered.nodes.find((node) => node.id === "style")?.parentId).toBe(
    "dom",
  );
  expect(recovered.notes[0].attachedTo?.id).toBe("dom");
});
