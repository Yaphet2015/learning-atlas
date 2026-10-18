import { net } from "electron";

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
  const chromiumFetch: typeof fetch = (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    // net.fetch only speaks http(s); keep Node fetch for anything else.
    if (!/^https?:/i.test(url)) return nodeFetch(input, init);
    return net.fetch(
      typeof input === "string" || input instanceof Request
        ? input
        : url,
      init,
    );
  };
  globalThis.fetch = chromiumFetch;
}
