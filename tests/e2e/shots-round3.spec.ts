import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { installFakeAtlas } from "./fake-atlas";
import { insuranceBoard } from "./fixtures";
import { gotoApp } from "./ready";

/**
 * Round-3 design screenshots (items 2, 3, 4, 5, 6, 9, 10). Not a regression test.
 * Run with SHOTS_DIR=/path npx playwright test shots-round3
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
const shot = (page: Page, name: string, mode: string) =>
  page.screenshot({ path: `${dir}/${name}-${mode}.png` });

async function ask(page: Page, text: string, answers: number) {
  const drawer = page.locator(".drawer");
  await drawer.getByLabel("向 AI 提问").fill(text);
  await drawer.getByLabel("发送提问").click();
  await expect(drawer.locator(".msg.assistant")).toHaveCount(answers);
}

for (const mode of ["light", "dark"] as const) {
  test(`2 · session strip in the drawer · ${mode}`, async ({ page }) => {
    await open(page, mode);
    await card(page, "c-how").click();
    await page.keyboard.press("/");
    await ask(page, "赔付次数怎么算？", 1);
    await page
      .locator(".drawer")
      .getByRole("button", { name: "新对话" })
      .click();
    await ask(page, "间隔期是多久？", 1);
    await page.mouse.move(10, 600);
    await page.waitForTimeout(300);
    await shot(page, "02-session-strip", mode);
    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+k");
    await page.waitForTimeout(300);
    await shot(page, "02-palette-boards-only", mode);
  });

  test(`3 · ghost hints · ${mode}`, async ({ page }) => {
    await open(page, mode);
    await card(page, "c-how").hover();
    await expect(
      card(page, "c-how").locator(".ghost-hint.below"),
    ).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, "03-ghost-hints-card", mode);
    await page.mouse.move(10, 600);
    await card(page, "topic-ci").hover();
    await expect(
      card(page, "topic-ci").locator(".ghost-hint.above"),
    ).toBeVisible();
    await page.locator(".ghost-hint.below").first().hover();
    await page.waitForTimeout(300);
    await shot(page, "03-ghost-hints-root", mode);
  });

  test(`4 · roots up and sideways · ${mode}`, async ({ page }) => {
    await open(page, mode);
    const root = card(page, "topic-ci");
    await root.hover();
    await root
      .getByRole("button", { name: "加并列的起点", exact: true })
      .hover();
    await page.waitForTimeout(700);
    await shot(page, "04-root-handles", mode);
    await root
      .getByRole("button", { name: "加并列的起点", exact: true })
      .click();
    await page.getByLabel("概念标题").fill("医疗险怎么选");
    await page.getByLabel("概念标题").press("Enter");
    const side = page
      .locator(".react-flow__node-root")
      .filter({ hasText: "医疗险怎么选" });
    await side.hover();
    await side.getByRole("button", { name: "加子概念", exact: true }).click();
    await page.getByLabel("概念标题").fill("免赔额");
    await page.getByLabel("概念标题").press("Enter");
    await page
      .locator(".react-flow__pane")
      .click({ position: { x: 20, y: 640 } });
    await page.keyboard.press("0");
    await page.waitForTimeout(700);
    await shot(page, "04-forest", mode);
    await root.hover();
    await root
      .getByRole("button", { name: "加更大的问题", exact: true })
      .click();
    await page.getByLabel("概念标题").fill("保险怎么配");
    await page.getByLabel("概念标题").press("Enter");
    await page
      .locator(".react-flow__pane")
      .click({ position: { x: 20, y: 640 } });
    await page.keyboard.press("0");
    await page.waitForTimeout(700);
    await shot(page, "04-grown-upward", mode);
  });

  test(`5 · minimap while panning · ${mode}`, async ({ page }) => {
    await open(page, mode);
    await shot(page, "05-minimap-hidden", mode);
    await page.keyboard.press("h");
    await page.mouse.move(10, 600);
    await page.waitForTimeout(400);
    await shot(page, "05-minimap-hand-tool", mode);
  });

  test(`6 · tooltips · ${mode}`, async ({ page }) => {
    await open(page, mode);
    await page.getByRole("button", { name: "平移" }).hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.waitForTimeout(200);
    await shot(page, "06-tooltip-dock", mode);
    await card(page, "c-how").hover();
    await card(page, "c-how")
      .getByRole("button", { name: "加子概念", exact: true })
      .hover();
    await expect(page.getByRole("tooltip")).toHaveText("加子概念Tab");
    await page.waitForTimeout(200);
    await shot(page, "06-tooltip-card", mode);
  });

  test(`9 · drawer streaming · ${mode}`, async ({ page }) => {
    await open(page, mode);
    await page.evaluate(() => ((window as any).__atlasSlow = 1800));
    await card(page, "c-how").click();
    await page.keyboard.press("/");
    const drawer = page.locator(".drawer");
    await drawer.getByLabel("向 AI 提问").fill("赔付次数怎么算？");
    await drawer.getByLabel("发送提问").click();
    await expect(drawer.locator(".shimmer")).toHaveText("正在思考");
    await page.waitForTimeout(500);
    await shot(page, "09-thinking", mode);
    await expect(drawer.locator(".shimmer")).toHaveText("正在回答");
    await page.waitForTimeout(200);
    await shot(page, "09-streaming", mode);
    await expect(drawer.locator(".msg.streaming")).toHaveCount(0);
    await drawer.getByLabel("向 AI 提问").click();
    await page.waitForTimeout(500);
    await shot(page, "09-settled-composer", mode);
  });

  test(`10 · settings page · ${mode}`, async ({ page }) => {
    await open(page, mode);
    await page.keyboard.press("ControlOrMeta+.");
    const settings = page.getByRole("dialog", { name: "设置" });
    await expect(settings).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, "10-settings-ai", mode);
    await settings.getByRole("button", { name: "快捷键" }).click();
    await page.waitForTimeout(200);
    await shot(page, "10-settings-shortcuts", mode);
    await settings.getByRole("button", { name: "关于与许可" }).click();
    await page.waitForTimeout(200);
    await shot(page, "10-settings-about", mode);
  });
}
