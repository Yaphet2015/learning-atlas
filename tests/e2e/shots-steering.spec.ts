import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { installFakeAtlas } from "./fake-atlas";
import { gotoApp } from "./ready";
import { plannedBoard } from "./fixtures";

/**
 * Steering UX screenshots (PR-E). Not a regression test.
 * Run with SHOTS_DIR=/path npx playwright test shots-steering
 */
const dir = process.env.SHOTS_DIR;
test.skip(!dir, "set SHOTS_DIR to shoot the design screenshots");

for (const mode of ["light", "dark"] as const)
  test(`steering · ${mode}`, async ({ page }) => {
    mkdirSync(dir!, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: mode });
    await installFakeAtlas(page, true, "web", [plannedBoard()]);
    await page.addInitScript(() => ((window as any).__atlasHintAngles = true));
    await gotoApp(page);
    const dark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    if (dark !== (mode === "dark")) await page.keyboard.press("d");
    const card = page.locator('.react-flow__node[data-id="c-what"]');
    await card.click();
    await page.getByRole("button", { name: "往哪挖" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/dig-menu-${mode}.png` });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const how = page.locator('.react-flow__node[data-id="c-how"]');
    await how.locator("article").hover();
    await expect(how.locator(".ghost-hint.alt")).toHaveCount(2);
    await page.waitForTimeout(400);
    const box = (await how.boundingBox())!;
    await page.screenshot({
      path: `${dir}/angle-hints-${mode}.png`,
      clip: { x: box.x - 60, y: box.y - 40, width: box.width + 420, height: box.height + 160 },
    });
    await page.mouse.move(1300, 820);
    const close = page.locator(".drawer").getByLabel("关闭");
    if (await close.isVisible()) await close.click();
    await page.getByRole("button", { name: /计划覆盖/ }).click();
    await page.getByRole("button", { name: "生成：等待期与免责" }).hover();
    await page.waitForTimeout(300);
    await page.locator(".coverage").screenshot({ path: `${dir}/coverage-${mode}.png` });
    await page.screenshot({ path: `${dir}/canvas-${mode}.png` });
  });
