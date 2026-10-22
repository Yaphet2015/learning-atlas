import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { installFakeAtlas } from "./fake-atlas";
import { gotoApp } from "./ready";

/**
 * Plan editor screenshots (PR-B). Not a regression test.
 * Run with SHOTS_DIR=/path npx playwright test shots-plan
 */
const dir = process.env.SHOTS_DIR;
test.skip(!dir, "set SHOTS_DIR to shoot the design screenshots");

for (const mode of ["light", "dark"] as const)
  test(`plan editor · ${mode}`, async ({ page }) => {
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
    // The 摸底 now opens the kickoff; skip it once the first question is up to reach the plan.
    const probe = drawer.getByRole("region", { name: "摸底" });
    await expect(probe.locator(".beat-q")).toBeVisible();
    await probe.getByRole("button", { name: "跳过摸底" }).click();
    const plan = drawer.locator(".plan-editor");
    await expect(plan.locator(".plan-block")).toHaveCount(5);
    await expect(plan.locator(".plan-kind")).toHaveCount(0);
    await plan.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/plan-draft-${mode}.png` });
    await plan.screenshot({ path: `${dir}/plan-editor-${mode}.png` });
    await plan.getByRole("button", { name: "水滴怎样让光拐弯？", exact: true }).click();
    await page.waitForTimeout(200);
    await plan.screenshot({ path: `${dir}/plan-editing-${mode}.png` });
    await plan.getByLabel("块标题").press("Enter");
    await plan.getByRole("button", { name: "确认计划，铺成第一层" }).click();
    await expect(page.locator(".react-flow__node-concept")).toHaveCount(3);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${dir}/plan-laid-${mode}.png` });
  });
