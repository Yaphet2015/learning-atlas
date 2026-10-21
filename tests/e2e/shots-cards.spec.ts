import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { installFakeAtlas } from "./fake-atlas";
import { gotoApp } from "./ready";

/**
 * Rich card screenshots (PR-C). Not a regression test.
 * Run with SHOTS_DIR=/path npx playwright test shots-cards
 */
const dir = process.env.SHOTS_DIR;
test.skip(!dir, "set SHOTS_DIR to shoot the design screenshots");

for (const mode of ["light", "dark"] as const)
  test(`rich card · ${mode}`, async ({ page }) => {
    mkdirSync(dir!, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: mode });
    await installFakeAtlas(page);
    await gotoApp(page);
    const dark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    if (dark !== (mode === "dark")) await page.keyboard.press("d");
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("button", { name: /新的问题/ }).click();
    await page.getByLabel("新白板问题").fill("彩虹是怎么形成的？");
    await page.getByRole("button", { name: "开始探索", exact: true }).click();
    const drawer = page.locator(".drawer");
    await expect(drawer.locator(".msg.assistant")).toHaveCount(1);
    await drawer.getByRole("button", { name: "拟定学习计划", exact: true }).click();
    await drawer.getByRole("button", { name: "确认计划，铺成第一层" }).click();
    await expect(page.locator(".react-flow__node-concept")).toHaveCount(3);
    await drawer.getByLabel("关闭").click();
    await page.waitForTimeout(700);
    const card = page.locator(".react-flow__node-concept").first();
    await card.screenshot({ path: `${dir}/card-face-${mode}.png` });
    await page.screenshot({ path: `${dir}/canvas-${mode}.png` });
    await card.click();
    await card.getByRole("button", { name: "查看全文" }).click();
    await expect(drawer.locator(".card-detail")).toBeVisible();
    await page.waitForTimeout(500);
    await drawer.locator(".this-card").screenshot({ path: `${dir}/card-detail-${mode}.png` });
    await page.screenshot({ path: `${dir}/detail-drawer-${mode}.png` });
  });
