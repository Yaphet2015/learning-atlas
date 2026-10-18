import { net } from "electron";

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Route every main-process `fetch` through Chromium's network stack.
 *
 * Node's bundled fetch (undici) connects directly: it reads neither the OS
 * proxy settings nor HTTP(S)_PROXY environment variables. Chromium's stack
 * follows the OS proxy configuration (system proxy, PAC, SOCKS, bypass list)
 * in dev and packaged builds alike. All AI provider traffic funnels through
 * `globalThis.fetch` (pi-ai falls back to it), so replacing it here is the
 * single point that makes outbound requests proxy-aware.
 */
export function installSystemFetch(): void {
  const nodeFetch = globalThis.fetch;
  const systemFetch: typeof fetch = function (input, init) {
    // net.fetch only speaks http(s); anything else stays on Node fetch.
    if (!/^https?:/i.test(requestUrl(input))) return nodeFetch(input, init);
    // net.fetch accepts string | Request; only URL needs converting.
    const request = input instanceof URL ? input.href : input;
    return net.fetch(request, init);
  };
  globalThis.fetch = systemFetch;
}
