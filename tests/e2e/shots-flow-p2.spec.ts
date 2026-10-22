import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { installFakeAtlas } from "./fake-atlas";
import { routedBoard } from "./fixtures";
import { gotoApp } from "./ready";

/**
 * Flow redesign screenshots, phase 2 (摸底, stuck, 合起来讲). Not a regression test.
 * Run with SHOTS_DIR=/path npx playwright test shots-flow-p2
 */
const dir = process.env.SHOTS_DIR;
test.skip(!dir, "set SHOTS_DIR to shoot the design screenshots");

async function theme(page: Page, mode: "light" | "dark") {
  const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  if (dark !== (mode === "dark")) await page.keyboard.press("d");
}
async function setup(page: Page, mode: "light" | "dark") {
  mkdirSync(dir!, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: mode });
}

for (const mode of ["light", "dark"] as const) {
  test(`摸底 · ${mode}`, async ({ page }) => {
    await setup(page, mode);
    await installFakeAtlas(page);
    await page.addInitScript(() => ((window as any).__atlasHold = true));
    await gotoApp(page);
    await theme(page, mode);
    const step = async () => {
      await page.waitForFunction(() => typeof (window as any).__atlasRelease === "function");
      await page.evaluate(() => {
        const r = (window as any).__atlasRelease;
        (window as any).__atlasRelease = undefined;
        r();
      });
    };
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("button", { name: /新的问题/ }).click();
    await page.getByLabel("新白板问题").fill("重疾险有哪些重要条款？");
    await page.getByRole("button", { name: "开始探索", exact: true }).click();
    const probe = page.locator(".drawer").getByRole("region", { name: "摸底" });
    // (a) first question skeleton.
    await expect(probe).toContainText("正在为「重疾险有哪些重要条款？」出第一道题…");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/probe-skeleton-a-${mode}.png` });
    await step();
    // Question.
    await expect(probe).toContainText("第 1 题");
    await probe.getByRole("radio", { name: /说法乙/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/probe-question-${mode}.png` });
    await probe.getByRole("button", { name: "确定" }).click();
    await probe.getByRole("radio", { name: /说法甲/ }).click();
    await probe.getByRole("button", { name: "确定" }).click();
    await probe.getByRole("radio", { name: /等待期/ }).click();
    await probe.getByRole("button", { name: "确定" }).click();
    // Refine skeleton (b, 在缩小范围…).
    await expect(probe).toContainText("在缩小范围…");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/probe-skeleton-b-refine-${mode}.png` });
    await step();
    await probe.getByRole("radio", { name: /说法甲/ }).click();
    await probe.getByRole("button", { name: "确定" }).click();
    // (c) computing the result (plan held).
    await expect(probe).toContainText("正在确定你的起点…");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/probe-skeleton-c-${mode}.png` });
    await step();
    await expect(probe).toContainText("你已经懂到");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/probe-result-${mode}.png` });
  });

  test(`摸底 expert · ${mode}`, async ({ page }) => {
    await setup(page, mode);
    await installFakeAtlas(page);
    await page.addInitScript(() => ((window as any).__atlasHold = true));
    await gotoApp(page);
    await theme(page, mode);
    const step = async () => {
      await page.waitForFunction(() => typeof (window as any).__atlasRelease === "function");
      await page.evaluate(() => {
        const r = (window as any).__atlasRelease;
        (window as any).__atlasRelease = undefined;
        r();
      });
    };
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("button", { name: /新的问题/ }).click();
    await page.getByLabel("新白板问题").fill("重疾险有哪些重要条款？");
    await page.getByRole("button", { name: "开始探索", exact: true }).click();
    const probe = page.locator(".drawer").getByRole("region", { name: "摸底" });
    await step();
    // Expert: always right. Never shown the intro point first; expands deeper.
    await expect(probe).toContainText("给付型 vs 报销型");
    let shotB = false;
    for (let i = 0; i < 60; i++) {
      if (await probe.getByText("答对了，在往更深处找…").count()) {
        if (!shotB) {
          await page.waitForTimeout(500);
          await page.screenshot({ path: `${dir}/probe-skeleton-b-${mode}.png` });
          shotB = true;
        }
        await step();
          }
      if (await probe.getByText("正在确定你的起点…").count()) break;
      const radio = probe.getByRole("radio", { name: /说法乙|等待期/ });
      if (!(await radio.count())) {
        await page.waitForTimeout(150);
        continue;
      }
      await radio.first().click();
      await probe.getByRole("button", { name: "确定" }).click();
      await page.waitForTimeout(150);
    }
    await step();
    await expect(probe).toContainText(/你懂得挺深|你已经懂到/);
    await expect(probe.locator(".probe-start")).not.toContainText("生病了保险给钱");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/probe-expert-result-${mode}.png` });
  });

  test(`卡住 · ${mode}`, async ({ page }) => {
    await setup(page, mode);
    const b = routedBoard();
    b.nodes = b.nodes.filter((n: any) => n.parentId !== "c-when-not");
    Object.assign(b.nodes.find((n: any) => n.id === "c-when-not"), { status: "exploring", beat: "test", fails: 1, guess: "怕带病投保", explain: "等待期内确诊一般不赔" });
    await installFakeAtlas(page, true, "web", [b]);
    await gotoApp(page);
    await theme(page, mode);
    await page.getByRole("region", { name: "下一步" }).getByRole("button", { name: /开始/ }).click();
    const stop = page.getByRole("region", { name: "这一站" });
    await stop.getByRole("radio", { name: /疾病定义/ }).click();
    await stop.getByLabel("再用一句话说说为什么").fill("因为已经交过保费了");
    await stop.getByRole("button", { name: /提交/ }).click();
    await expect(stop.getByRole("group", { name: "卡住了" })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1240 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/05-stuck-${mode}.png` });
  });

  test(`合起来讲 · ${mode}`, async ({ page }) => {
    await setup(page, mode);
    const b = routedBoard();
    for (const n of b.nodes) if (n.parentId) Object.assign(n, { status: "explained", seal: "test", beat: "done" });
    await installFakeAtlas(page, true, "web", [b]);
    await gotoApp(page);
    await theme(page, mode);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/06-wrap-bar-${mode}.png` });
    await page.getByRole("region", { name: "下一步" }).getByRole("button", { name: /开始讲/ }).click();
    const wrap = page.getByRole("region", { name: "合起来讲" });
    await wrap.getByLabel("合起来讲").fill("看重疾险条款，先看它保哪些病、定义严不严。再看等待期，别刚买就出险。然后看怎么赔、能赔几次。最后看保额够不够、保到几岁。");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/06-wrap-${mode}.png` });
    await wrap.getByRole("button", { name: /讲完了/ }).click();
    await expect(page.locator(".card.lit")).toHaveCount(4);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/06-wrap-lit-${mode}.png` });
  });
}
