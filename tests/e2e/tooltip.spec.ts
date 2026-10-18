import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./ready";

/** Every visible icon-only button must carry a name (and so a tooltip). */
async function unnamedIconButtons(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        if (getComputedStyle(b).visibility === "hidden") return false;
        const text = (b.textContent ?? "").replace(/\s+/g, "");
        return text.length <= 1 && !b.getAttribute("aria-label");
      })
      .map((b) => b.outerHTML.slice(0, 120)),
  );
}

test("icon buttons show a tooltip with name and shortcut on hover and focus", async ({
  page,
}) => {
  await gotoApp(page);
  const tooltip = page.getByRole("tooltip");
  await page.getByRole("button", { name: "平移" }).hover();
  await expect(tooltip).toHaveText("平移H");
  await expect(tooltip.locator("kbd")).toHaveText("H");
  // Warm: the next control shows at once.
  await page.getByRole("button", { name: "批注", exact: true }).hover();
  await expect(tooltip).toHaveText("批注N");
  await page.mouse.move(700, 900);
  await expect(tooltip).toHaveCount(0);
  // Keyboard focus shows it immediately; Esc hides it.
  // (Tab itself adds a card on the canvas, so move focus programmatically after a key press.)
  await page.keyboard.press("Shift");
  await page.getByRole("button", { name: "查看全图" }).focus();
  await expect(tooltip).toHaveText("查看全图0");
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  // The accessible name stays the aria-label; the shortcut is exposed too.
  await expect(page.getByRole("button", { name: "设置" })).toHaveAttribute(
    "aria-keyshortcuts",
    /Meta\+\.|Control\+\./,
  );
});

test("audit: no unnamed icon-only buttons on the canvas, drawer or settings", async ({
  page,
}) => {
  await gotoApp(page);
  expect(await unnamedIconButtons(page)).toEqual([]);
  await page.locator(".react-flow__node-concept").first().click();
  expect(await unnamedIconButtons(page)).toEqual([]);
  await page.keyboard.press("/");
  await expect(page.locator(".drawer")).toBeVisible();
  expect(await unnamedIconButtons(page)).toEqual([]);
  await page.keyboard.press("ControlOrMeta+.");
  expect(await unnamedIconButtons(page)).toEqual([]);
});
