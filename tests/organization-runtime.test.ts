import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIRuntime } from "../electron/ai-runtime";
import { createEmptyBoard } from "../src/model/boards";
import {
  applyOrganization,
  organizationContext,
} from "../src/model/organization";
import type { AIUpdate } from "../src/shared/types";

const runtimes: AIRuntime[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Replay the recorded failure: reasoning consumes the entire 4096-token budget. */
function providerReply(text: string, truncated = false): Response {
  const chunk = {
    id: "completion",
    object: "chat.completion.chunk",
    created: 1700000000,
    model: "deepseek-flash",
    choices: [
      {
        index: 0,
        delta: truncated
          ? {
              reasoning_content: "需要先校对所有层级。",
              ...(text ? { content: text } : {}),
            }
          : { content: text },
        finish_reason: truncated ? "length" : "stop",
      },
    ],
    usage: {
      prompt_tokens: 10000,
      completion_tokens: truncated ? 4096 : 100,
      total_tokens: truncated ? 14096 : 10100,
      completion_tokens_details: { reasoning_tokens: truncated ? 4096 : 0 },
    },
  };
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
async function setup(
  scenario: "normal" | "thinking-limit" | "partial-limit" = "normal",
) {
  vi.stubEnv("OPENAI_API_KEY", "");
  const board = createEmptyBoard("浏览器如何渲染页面");
  for (let i = 0; i < 38; i++)
    board.nodes.push({
      id: `card-${i}`,
      kind: "concept",
      parentId: board.nodes[0].id,
      order: i,
      title: `渲染概念 ${i}`,
      body: "浏览器根据文档和样式计算页面中的元素。".repeat(25),
      status: "unseen",
    });
  const revision = JSON.stringify({
    nodes: board.nodes.map(({ id, parentId, order, title, body }) => ({
      id,
      parentId,
      order,
      title,
      body,
    })),
    relations: [],
  });
  const payloads: Record<string, any>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const payload = JSON.parse(init.body as string);
      payloads.push(payload);
      const probe = payload.messages.some(
        (message: any) => message.content === "Reply with: ok",
      );
      const budget = payload.max_tokens ?? payload.max_completion_tokens;
      const truncated = !probe && (scenario !== "normal" || budget <= 4096);
      let text = revision;
      if (probe) text = "ok";
      else if (truncated)
        text = scenario === "partial-limit" ? revision.slice(0, 100) : "";
      return providerReply(text, truncated);
    }),
  );
  const directory = await mkdtemp(join(tmpdir(), "organization-runtime-"));
  directories.push(directory);
  const updates: AIUpdate[] = [];
  const runtime = new AIRuntime(directory, (update) => updates.push(update));
  runtimes.push(runtime);
  const settings = {
    model: "deepseek-flash",
    baseUrl: "http://localhost:12345/v1",
    apiKey: "TEST_SECRET",
  };
  await runtime.setSettings(settings);
  const ask = () =>
    runtime.ask({
      boardId: board.id,
      stickyId: "organize-test",
      requestId: "request-organize",
      mode: "organize",
      prompt: "以起点为核心整理所有卡片。",
      context: organizationContext(board),
    });
  return { runtime, updates, ask, settings, payloads, board };
}

describe("organization through the real compatible-provider transport", () => {
  it("can organize when the connection probe succeeds but 4096 tokens only cover reasoning", async () => {
    const { runtime, settings, ask, updates, payloads, board } = await setup();
    expect((await runtime.testConnection(settings)).ok).toBe(true);
    await ask();
    await vi.waitFor(() => expect(updates.at(-1)?.status).toBe("done"));
    expect(payloads[1].max_tokens ?? payloads[1].max_completion_tokens).toBe(
      32768,
    );
    expect(applyOrganization(updates.at(-1)!.text, board).nodes).toHaveLength(
      39,
    );
  });
  it.each(["thinking-limit", "partial-limit"] as const)(
    "reports %s instead of a provider-configuration error, including after replay",
    async (scenario) => {
      const { ask, updates, payloads } = await setup(scenario);
      await ask();
      await vi.waitFor(() => expect(updates.at(-1)?.status).toBe("error"));
      expect(updates.at(-1)?.error).toContain("AI_OUTPUT_LIMIT");
      expect(updates.at(-1)?.error).not.toContain("AI_PROVIDER_ERROR");
      expect(JSON.stringify(updates)).not.toContain("TEST_SECRET");
      const count = payloads.length;
      await ask();
      expect(updates.at(-1)?.status).toBe("error");
      expect(updates.at(-1)?.error).toContain("AI_OUTPUT_LIMIT");
      expect(payloads).toHaveLength(count);
    },
  );
});
