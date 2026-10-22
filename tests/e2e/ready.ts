import type { Page } from "@playwright/test";

/**
 * The page's load event fires before React has mounted, so a shortcut pressed
 * right after goto() can be lost (seen on the macOS CI runner). Wait for the
 * app's own readiness signal: a board is shown and the key listener is attached.
 */
export async function waitForApp(page: Page) {
  await page.locator("html[data-app-ready]").waitFor({ state: "attached" });
  await viewportSettled(page);
}
/**
 * The next-step bar can auto-pan the canvas just after load; a hover made before it lands misses
 * the card (seen on the macOS CI runner). Wait until the viewport transform has held for 500ms.
 */
export async function viewportSettled(page: Page) {
  await page
    .waitForFunction(
      () => {
        const w = window as any;
        const t = document.querySelector(".react-flow__viewport")?.getAttribute("style") ?? "";
        const now = performance.now();
        if (w.__vpLast !== t) {
          w.__vpLast = t;
          w.__vpSince = now;
        }
        return now - w.__vpSince >= 500;
      },
      undefined,
      { polling: 100, timeout: 3000 },
    )
    .catch(() => undefined);
}
export async function gotoApp(page: Page, path = "/") {
  await page.goto(path);
  await waitForApp(page);
}
export async function reloadApp(page: Page) {
  await page.reload();
  await waitForApp(page);
}
