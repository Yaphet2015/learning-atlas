import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { insuranceBoard, masteryBoard } from "./fixtures";
import { gotoApp } from "./ready";

/**
 * Design screenshots for review (not a regression test). Run with
 * SHOTS_DIR=/path npx playwright test shots
 */
const dir = process.env.SHOTS_DIR;
test.skip(!dir, "set SHOTS_DIR to shoot the design screenshots");

async function seed(page: Page, boards: unknown[]) {
  await page.addInitScript((value) => {
    localStorage.setItem("studyboard-preview-boards-v1", value);
  }, JSON.stringify(boards));
}
async function theme(page: Page, dark: boolean) {
  if (
    dark !==
    (await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    ))
  )
    await page.keyboard.press("d");
}

for (const mode of ["light", "dark"] as const) {
  test(`canvas + drawer · ${mode}`, async ({ page }) => {
    mkdirSync(dir!, { recursive: true });
    await page.emulateMedia({ colorScheme: mode });
    await seed(page, [insuranceBoard()]);
    await gotoApp(page);
    await expect(page.locator(".react-flow__node-concept")).toHaveCount(6);
    await theme(page, mode === "dark");
    await page.waitForTimeout(800);
    await page.locator(".react-flow__node-root").click();
    await page.keyboard.press("/");
    await expect(page.locator(".drawer")).toBeVisible();
    // Fit the whole map into the squeezed canvas (the mockup's state).
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "查看全图" }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${dir}/canvas-${mode}.png` });
    const drawer = page.locator(".drawer");
    await drawer.screenshot({ path: `${dir}/drawer-${mode}.png` });
  });
  test(`mastery states · ${mode}`, async ({ page }) => {
    mkdirSync(dir!, { recursive: true });
    await page.emulateMedia({ colorScheme: mode });
    await seed(page, [masteryBoard()]);
    await gotoApp(page);
    await expect(page.locator(".react-flow__node-concept")).toHaveCount(3);
    await theme(page, mode === "dark");
    await page.waitForTimeout(700);
    const boxes = await page
      .locator(".react-flow__node-concept")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    const x = Math.min(...boxes.map((b) => b.x)) - 30,
      y = Math.min(...boxes.map((b) => b.y)) - 30,
      r = Math.max(...boxes.map((b) => b.right)) + 30,
      bt = Math.max(...boxes.map((b) => b.bottom)) + 30;
    await page.screenshot({
      path: `${dir}/mastery-${mode}.png`,
      clip: { x, y, width: r - x, height: bt - y },
    });
  });
}
