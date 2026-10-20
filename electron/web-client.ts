import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

export const DEEPSEEK_URL = "https://api.deepseek.com";
const EXA_URL = "https://mcp.exa.ai/mcp";
export const WEB_OUTPUT_LIMIT = 24_000;
const TIMEOUT_MS = 20_000;

export const searchInput = z.object({
  query: z
    .string()
    .trim()
    .refine((s) => [...s].length >= 1 && [...s].length <= 128),
  count: z.number().int().min(1).max(10).default(5),
});
export const fetchInput = z.object({
  url: z
    .string()
    .max(8192)
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !!url.hostname &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    }),
});
type WebRequest =
  | { kind: "search"; query: string; count: number }
  | { kind: "fetch"; url: string };
export interface WebResult {
  provider: "exa" | "deepseek";
  text: string;
  sources: string[];
  truncated: boolean;
}
export class WebError extends Error {
  constructor(
    readonly kind: "auth" | "rate" | "timeout" | "network" | "response",
  ) {
    super(`联网服务请求失败：${kind}`);
  }
}

function result(
  provider: WebResult["provider"],
  text: string,
  sources: string[],
): WebResult {
  const value: WebResult = {
    provider,
    text: "",
    sources: [...new Set(sources)].slice(0, 10),
    truncated: false,
  };
  while (JSON.stringify(value).length > WEB_OUTPUT_LIMIT) value.sources.pop();
  value.text = text.slice(
    0,
    Math.max(0, WEB_OUTPUT_LIMIT - JSON.stringify(value).length),
  );
  let excess = JSON.stringify(value).length - WEB_OUTPUT_LIMIT;
  while (excess > 0) {
    value.text = value.text.slice(0, Math.max(0, value.text.length - excess));
    excess = JSON.stringify(value).length - WEB_OUTPUT_LIMIT;
  }
  value.truncated =
    value.text.length < text.length ||
    value.sources.length < new Set(sources).size;
  return value;
}
function urlsIn(text: string): string[] {
  // Exa labels each result URL. Links inside excerpts are not additional search results.
  return [...text.matchAll(/^URL:[ \t]*(https?:\/\/\S+)[ \t]*$/gm)].flatMap(
    (match) =>
      fetchInput.safeParse({ url: match[1] }).success ? [match[1]] : [],
  );
}

/** Each operation owns its transport. Closing or cancelling it cannot affect another conversation. */
async function exa(
  request: WebRequest,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<WebResult> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const combined = AbortSignal.any([signal, deadline]);
  const client = new Client({ name: "studyboard", version: "0.1.0" });
  // The SDK supplies its own request signal. Combine it instead of relying on requestInit.signal.
  const transport = new StreamableHTTPClientTransport(new URL(EXA_URL), {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([
          combined,
          ...(init?.signal ? [init.signal] : []),
        ]),
      }),
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
  });
  const close = () => {
    void transport.close().catch(() => {});
  };
  combined.addEventListener("abort", close, { once: true });
  try {
    combined.throwIfAborted();
    await client.connect(transport);
    const response = await client.callTool(
      {
        name: request.kind === "search" ? "web_search_exa" : "web_fetch_exa",
        arguments:
          request.kind === "search"
            ? { query: request.query, numResults: request.count }
            : { urls: [request.url], maxCharacters: WEB_OUTPUT_LIMIT },
      },
      undefined,
      { signal: combined, timeout: timeoutMs },
    );
    if (response.isError) throw new WebError("response");
    const text = (response.content as { type: string; text?: string }[])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
    // The hosted tool exposes formatted text, not a stable structured result schema.
    if (request.kind === "fetch" && (!text.trim() || urlsIn(text).length === 0))
      throw new WebError("response");
    return result(
      "exa",
      text,
      request.kind === "fetch" ? [request.url] : urlsIn(text),
    );
  } catch (error) {
    signal.throwIfAborted();
    if (deadline.aborted) throw new WebError("timeout");
    throw error instanceof WebError ? error : new WebError("network");
  } finally {
    combined.removeEventListener("abort", close);
    await transport.close().catch(() => {});
  }
}

const deepseekSearchResponse = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      summary: z.string(),
    }),
  ),
});
const deepseekFetchResponse = z.object({
  title: z.string(),
  content: z.string().trim().min(1),
});
async function deepseek(
  request: WebRequest,
  key: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<WebResult> {
  const deadline = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetch(`${DEEPSEEK_URL}/v1/tools/${request.kind}`, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        request.kind === "search"
          ? { query: request.query, count: request.count, need_content: false }
          : { url: request.url },
      ),
      signal: AbortSignal.any([signal, deadline]),
    });
    if (!response.ok) {
      let kind: WebError["kind"] = "network";
      if (response.status === 401 || response.status === 403) kind = "auth";
      else if (response.status === 429) kind = "rate";
      throw new WebError(kind);
    }
    const raw: unknown = await response.json();
    if (request.kind === "search") {
      const parsed = deepseekSearchResponse.safeParse(raw);
      if (!parsed.success) throw new WebError("response");
      const results = parsed.data.results
        .slice(0, request.count)
        .filter((item) => fetchInput.safeParse({ url: item.url }).success);
      return result(
        "deepseek",
        results
          .map((item) => `${item.title}\nURL: ${item.url}\n${item.summary}`)
          .join("\n\n"),
        results.map((item) => item.url),
      );
    }
    const parsed = deepseekFetchResponse.safeParse(raw);
    if (!parsed.success) throw new WebError("response");
    return result("deepseek", `${parsed.data.title}\n${parsed.data.content}`, [
      request.url,
    ]);
  } catch (error) {
    signal.throwIfAborted();
    if (deadline.aborted) throw new WebError("timeout");
    throw error instanceof WebError ? error : new WebError("network");
  }
}

export async function requestWeb(
  request: WebRequest,
  key: string | undefined,
  signal: AbortSignal,
  timeoutMs = TIMEOUT_MS,
): Promise<WebResult> {
  try {
    return await exa(request, signal, timeoutMs);
  } catch (error) {
    signal.throwIfAborted();
    if (!key) throw error;
    return deepseek(request, key, signal, timeoutMs);
  }
}
