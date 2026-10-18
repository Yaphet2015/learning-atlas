import type { Page } from "@playwright/test";

/**
 * The page's load event fires before React has mounted, so a shortcut pressed
 * right after goto() can be lost (seen on the macOS CI runner). Wait for the
 * app's own readiness signal: a board is shown and the key listener is attached.
 */
export async function waitForApp(page: Page) {
  await page.locator("html[data-app-ready]").waitFor({ state: "attached" });
}
export async function gotoApp(page: Page, path = "/") {
  await page.goto(path);
  await waitForApp(page);
}
export async function reloadApp(page: Page) {
  await page.reload();
  await waitForApp(page);
}
