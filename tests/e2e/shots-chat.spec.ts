import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { installFakeAtlas } from "./fake-atlas";
import { gotoApp } from "./ready";
import { chatBoard } from "./fixtures";

/**
 * v2 chat screenshots, matching mockups 01–03. Not a regression test.
 * Run with SHOTS_DIR=/path npx playwright test shots-chat
 */
const dir = process.env.SHOTS_DIR;
test.skip(!dir, "set SHOTS_DIR to shoot the design screenshots");

const json = (p: unknown) => "\n```json\n" + JSON.stringify({ proposal: p }) + "\n```";
const shots: [string, string, string][] = [
  [
    "01-adjust-plan",
    "第三站太浅了，换成讲等待期的坑",
    "好，等待期的定义你已经懂了，可以把第三站改成讲实际会踩的坑：等待期内确诊不算、续保会不会重新计算、带病投保时怎么处理。" +
      json({ type: "editRoute", ops: [{ op: "replace", stop: 3, title: "等待期里最容易踩的坑" }] }),
  ],
  [
    "02-question",
    "等待期是什么？",
    "等待期是合同生效后的一段观察时间，通常 90 或 180 天（以条款为准）。这段时间里首次确诊的重疾一般不赔，只退已交保费；它防的是“知道自己要病了才去买”。",
  ],
  [
    "03-go-ahead",
    "豁免我懂了，往下走吧",
    "好。下一站讲保额怎么定：不是简单的「年收入几倍」，而是要算清治疗费和几年的收入缺口。" + json({ type: "startStop", stop: 2 }),
  ],
];

async function theme(page: Page, mode: "light" | "dark") {
  const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  if (dark !== (mode === "dark")) await page.keyboard.press("d");
}

for (const mode of ["light", "dark"] as const)
  for (const [name, said, answer] of shots)
    test(`chat ${name} · ${mode}`, async ({ page }) => {
      mkdirSync(dir!, { recursive: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: mode });
      await installFakeAtlas(page, true, "web", [chatBoard()]);
      await gotoApp(page);
      await theme(page, mode);
      await page.evaluate((a) => ((window as any).__atlasChatAnswers = [a]), answer);
      await page.locator(".react-flow__node-root").click();
      await page.keyboard.press("/");
      const drawer = page.locator(".drawer");
      await drawer.getByLabel("向 AI 提问").fill(said);
      await drawer.getByLabel("向 AI 提问").press("Enter");
      await expect(drawer.locator(".msg.chat")).toHaveCount(1);
      await page.mouse.move(700, 850);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/${name}-${mode}.png` });
    });
