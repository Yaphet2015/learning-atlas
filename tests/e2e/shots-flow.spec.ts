import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { installFakeAtlas } from "./fake-atlas";
import { routedBoard } from "./fixtures";
import { gotoApp } from "./ready";

/**
 * Flow redesign screenshots, phase 1. Not a regression test.
 * Run with SHOTS_DIR=/path npx playwright test shots-flow
 */
const dir = process.env.SHOTS_DIR;
test.skip(!dir, "set SHOTS_DIR to shoot the design screenshots");

for (const mode of ["light", "dark"] as const)
  test(`flow p1 · ${mode}`, async ({ page }) => {
    mkdirSync(dir!, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: mode });
    await installFakeAtlas(page, true, "web", [routedBoard()]);
    await gotoApp(page);
    const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    if (dark !== (mode === "dark")) await page.keyboard.press("d");
    const bar = page.getByRole("region", { name: "下一步" });
    await expect(bar).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/canvas-next-step-${mode}.png` });
    await bar.getByRole("button", { name: /开始/ }).click();
    const stop = page.getByRole("region", { name: "这一站" });
    await stop.getByLabel("我的猜测").fill("怕有人生病了才去买");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/beat-guess-${mode}.png` });
    await stop.getByRole("button", { name: /记下猜测/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/beat-learn-${mode}.png` });
    await stop.getByRole("button", { name: /读完了/ }).click();
    await stop.getByLabel("用我的话讲").fill("等待期里确诊一般不赔，防止带病投保");
    await stop.getByRole("button", { name: /提交/ }).click();
    await stop.getByRole("radio", { name: /等待期/ }).click();
    await stop.getByLabel("再用一句话说说为什么").fill("第 2 个月还在等待期内");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/beat-test-${mode}.png` });
    await stop.getByRole("button", { name: /提交/ }).click();
    await expect(stop).toContainText("这一站讲清楚了");
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${dir}/canvas-sealed-${mode}.png` });
  });
