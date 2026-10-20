import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestWeb,
  searchInput,
  fetchInput,
  WEB_OUTPUT_LIMIT,
} from "../electron/web-client";

afterEach(() => vi.unstubAllGlobals());
const search = { kind: "search" as const, query: "系统代理", count: 5 };
function fixture(
  toolResult: unknown = {
    content: [
      {
        type: "text",
        text: "Title\nURL: https://example.com/page\nUseful facts",
      },
    ],
  },
) {
  const requests: {
    url: string;
    body?: any;
    signal?: AbortSignal | null;
    headers?: HeadersInit;
  }[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ url, body, signal: init?.signal, headers: init?.headers });
    if (!body) return new Response(null, { status: 405 });
    if (body.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    const result =
      body.method === "initialize"
        ? {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: { name: "test", version: "1" },
          }
        : toolResult;
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  });
  vi.stubGlobal("fetch", mock);
  return { mock, requests };
}
describe("web providers through the injected global fetch", () => {
  it("uses anonymous Exa MCP, maps arguments and preserves sources", async () => {
    const { requests } = fixture();
    const result = await requestWeb(
      search,
      "DEEPSEEK_SECRET",
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      provider: "exa",
      sources: ["https://example.com/page"],
    });
    expect(
      requests.find((r) => r.body?.method === "tools/call")?.body.params,
    ).toEqual({
      name: "web_search_exa",
      arguments: { query: search.query, numResults: 5 },
    });
    expect(JSON.stringify(requests)).not.toContain("DEEPSEEK_SECRET");
  });
  it("falls back on MCP tool errors even with HTTP 200", async () => {
    const { mock, requests } = fixture({
      isError: true,
      content: [{ type: "text", text: "failed" }],
    });
    const exaFetch = mock.getMockImplementation()!;
    mock.mockImplementation(async (input, init) => {
      if (String(input).startsWith("https://api.deepseek.com/")) {
        requests.push({
          url: String(input),
          body: JSON.parse(init!.body as string),
          headers: init?.headers,
        });
        expect(init?.redirect).toBe("error");
        return Response.json({
          results: [
            {
              title: "Source",
              url: "https://example.com/",
              summary: "Confirmed",
            },
          ],
        });
      }
      return exaFetch(input, init);
    });
    expect(
      await requestWeb(search, "SECRET", new AbortController().signal),
    ).toMatchObject({ provider: "deepseek" });
    expect(new Headers(requests.at(-1)?.headers).get("Authorization")).toBe(
      "Bearer SECRET",
    );
  });
  it("keeps empty search results and does not switch providers", async () => {
    const { requests } = fixture({
      content: [{ type: "text", text: "No results found" }],
    });
    expect(
      await requestWeb(search, "SECRET", new AbortController().signal),
    ).toMatchObject({ provider: "exa", sources: [] });
    expect(requests.every((r) => r.url.startsWith("https://mcp.exa.ai/"))).toBe(
      true,
    );
  });
  it("uses DeepSeek Fetch when Exa cannot return page content", async () => {
    const { mock } = fixture({
      content: [
        { type: "text", text: "No content found for the provided URL(s)." },
      ],
    });
    const original = mock.getMockImplementation()!;
    mock.mockImplementation(async (input, init) => {
      if (String(input) === "https://api.deepseek.com/v1/tools/fetch") {
        expect(JSON.parse(init!.body as string)).toEqual({
          url: "https://example.com/page",
        });
        return Response.json({
          title: "Fetched page",
          content: "Full Markdown body",
        });
      }
      return original(input, init);
    });
    expect(
      await requestWeb(
        { kind: "fetch", url: "https://example.com/page" },
        "SECRET",
        new AbortController().signal,
      ),
    ).toMatchObject({
      provider: "deepseek",
      sources: ["https://example.com/page"],
    });
  });
  it("does not treat URLs in article excerpts as search result sources", async () => {
    fixture({
      content: [
        {
          type: "text",
          text: "Title: API docs\nURL: https://example.com/docs\nText: fetch('https://demo.app')",
        },
      ],
    });
    const result = await requestWeb(
      search,
      undefined,
      new AbortController().signal,
    );
    expect(result.sources).toEqual(["https://example.com/docs"]);
  });
  it("maps fetch URLs and truncates content without losing the source", async () => {
    const { requests } = fixture({
      content: [
        {
          type: "text",
          text: `Title\nURL: https://example.com/page\n${"x".repeat(WEB_OUTPUT_LIMIT + 100)}`,
        },
      ],
    });
    const result = await requestWeb(
      { kind: "fetch", url: "https://example.com/page" },
      undefined,
      new AbortController().signal,
    );
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(WEB_OUTPUT_LIMIT);
    expect(result.sources).toEqual(["https://example.com/page"]);
    expect(
      requests.find((r) => r.body?.method === "tools/call")?.body.params
        .arguments,
    ).toEqual({
      urls: ["https://example.com/page"],
      maxCharacters: WEB_OUTPUT_LIMIT,
    });
  });
  it("aborts an in-flight request without starting DeepSeek", async () => {
    const { mock, requests } = fixture();
    const original = mock.getMockImplementation()!;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    mock.mockImplementation(async (input, init) => {
      if (
        typeof init?.body === "string" &&
        JSON.parse(init.body).method === "tools/call"
      ) {
        started();
        return new Promise<Response>((_, reject) => {
          init.signal!.addEventListener(
            "abort",
            () => reject(init.signal!.reason),
            { once: true },
          );
        });
      }
      return original(input, init);
    });
    const controller = new AbortController();
    const pending = requestWeb(search, "SECRET", controller.signal);
    const rejected = expect(pending).rejects.toThrow();
    await ready;
    controller.abort();
    await rejected;
    expect(requests.every((r) => !r.url.includes("deepseek"))).toBe(true);
  });
  it("times out network work and returns a classified error", async () => {
    const { mock } = fixture();
    mock.mockImplementation(
      async (_input, init) =>
        new Promise<Response>((_, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(init!.signal!.reason),
            { once: true },
          );
        }),
    );
    await expect(
      requestWeb(search, undefined, new AbortController().signal, 20),
    ).rejects.toMatchObject({ kind: "timeout" });
  });
  it("validates Unicode query length and fetch destinations", () => {
    expect(searchInput.safeParse({ query: "😀".repeat(128) }).success).toBe(
      true,
    );
    expect(searchInput.safeParse({ query: "a".repeat(129) }).success).toBe(
      false,
    );
    expect(searchInput.safeParse({ query: "  " }).success).toBe(false);
    for (const url of [
      "file:///tmp/a",
      "https://user:pass@example.com/",
      "javascript:alert(1)",
    ])
      expect(fetchInput.safeParse({ url }).success).toBe(false);
  });
});
