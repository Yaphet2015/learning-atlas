import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { installFakeAtlas } from "./fake-atlas";
import { insuranceBoard } from "./fixtures";
import { gotoApp } from "./ready";

/**
 * Round-2 design screenshots (multi-select, context picker, session list).
 * Not a regression test. Run with SHOTS_DIR=/path npx playwright test shots-round2
 */
const dir = process.env.SHOTS_DIR;
test.skip(!dir, "set SHOTS_DIR to shoot the design screenshots");

const card = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);

async function open(page: Page, mode: "light" | "dark") {
  mkdirSync(dir!, { recursive: true });
  await page.emulateMedia({ colorScheme: mode });
  const board = insuranceBoard(true);
  for (const m of board.notes[0].messages)
    m.createdAt = "2026-10-17T13:20:00.000Z";
  await installFakeAtlas(page, true, "web", [board]);
  await gotoApp(page);
  await expect(page.locator(".react-flow__node-concept")).toHaveCount(6);
  const dark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  if (dark !== (mode === "dark")) await page.keyboard.press("d");
  await page.waitForTimeout(900);
}

async function ask(page: Page, text: string, answers: number) {
  const drawer = page.locator(".drawer");
  await drawer.getByLabel("向 AI 提问").fill(text);
  await drawer.getByLabel("发送提问").click();
  await expect(drawer.locator(".msg.assistant")).toHaveCount(answers);
}

for (const mode of ["light", "dark"] as const) {
  test(`multi-select + 问 AI · ${mode}`, async ({ page }) => {
    await open(page, mode);
    await card(page, "c-when-not").click();
    await card(page, "c-how").click({ modifiers: ["Shift"] });
    await card(page, "c-money").click({ modifiers: ["Shift"] });
    await expect(page.getByRole("toolbar", { name: "多选" })).toBeVisible();
    await page.getByRole("button", { name: /问 AI/ }).hover();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/multiselect-${mode}.png` });
    // Mid-marquee, for the drag affordance.
    await page.keyboard.press("Escape");
    const a = await card(page, "c-tiers").boundingBox();
    const b = await card(page, "c-wait").boundingBox();
    await page.mouse.move(a!.x - 40, a!.y + a!.height + 30);
    await page.mouse.down();
    await page.mouse.move(b!.x + b!.width * 0.6, b!.y + 20, { steps: 10 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${dir}/marquee-${mode}.png` });
    await page.mouse.up();
    await page.getByRole("button", { name: /问 AI/ }).click();
    await ask(page, "这两条有什么关系？", 1);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/multiselect-asked-${mode}.png` });
  });

  test(`context picker · ${mode}`, async ({ page }) => {
    await open(page, mode);
    await card(page, "c-how").click();
    await page.keyboard.press("/");
    const drawer = page.locator(".drawer");
    await drawer.locator(".ctx").click();
    await drawer.getByRole("button", { name: "添加卡片" }).click();
    const picker = drawer.getByRole("group", { name: "添加卡片" });
    await picker
      .locator("label", { hasText: "等待期是什么" })
      .getByRole("checkbox")
      .check();
    await picker.getByLabel("搜索卡片").fill("赔");
    await page.waitForTimeout(400);
    await drawer.screenshot({ path: `${dir}/picker-${mode}.png` });
    await page.screenshot({ path: `${dir}/picker-full-${mode}.png` });
  });

  test(`session list · ${mode}`, async ({ page }) => {
    await open(page, mode);
    const drawer = page.locator(".drawer");
    await card(page, "c-how").click();
    await page.keyboard.press("/");
    await ask(page, "赔付次数怎么算？", 1);
    await drawer.getByRole("button", { name: "对话列表" }).click();
    await drawer.getByRole("button", { name: "新对话" }).click();
    await ask(page, "间隔期是多久？", 1);
    await card(page, "c-when-not").click();
    await card(page, "c-wait").click({ modifiers: ["Shift"] });
    await page.getByRole("button", { name: /问 AI/ }).click();
    await ask(page, "等待期内确诊怎么办？", 1);
    await drawer.getByRole("button", { name: "对话列表" }).click();
    await page.waitForTimeout(400);
    await drawer.screenshot({ path: `${dir}/sessions-${mode}.png` });
    await page.screenshot({ path: `${dir}/sessions-full-${mode}.png` });
  });
}
