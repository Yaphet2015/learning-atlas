import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { insuranceBoard } from "./fixtures";
import { gotoApp } from "./ready";

/**
 * Right-panel screenshots for the 我的笔记 removal. Not a regression test.
 * Run with SHOTS_DIR=/path npx playwright test shots-notes
 */
const dir = process.env.SHOTS_DIR;
test.skip(!dir, "set SHOTS_DIR to shoot the design screenshots");

for (const mode of ["light", "dark"] as const)
  test(`card panel · ${mode}`, async ({ page }) => {
    test.setTimeout(120_000);
    mkdirSync(dir!, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: mode });
    await page.addInitScript(
      (value) => localStorage.setItem("studyboard-preview-boards-v1", value),
      JSON.stringify([insuranceBoard(true)]),
    );
    await gotoApp(page);
    const dark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    if (dark !== (mode === "dark")) await page.keyboard.press("d");
    await page.locator('.react-flow__node[data-id="c-what"]').click();
    const drawer = page.locator(".drawer");
    await expect(drawer).toBeVisible();
    await page.waitForTimeout(600);
    await drawer.screenshot({ path: `${dir}/panel-${mode}.png` });
  });
