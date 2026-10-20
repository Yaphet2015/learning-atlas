import { test, expect, type Locator } from "@playwright/test";
import { insuranceBoard } from "./fixtures";
import { installFakeAtlas } from "./fake-atlas";
import { gotoApp } from "./ready";

async function expectHeadingClear(card: Locator, titleSelector: string) {
  const gap = await card.evaluate((el, selector) => {
    const title = el.querySelector(selector)!;
    const number = el.querySelector(".no")!;
    const titleBox = title.getBoundingClientRect();
    const numberBox = number.getBoundingClientRect();
    const scale = titleBox.width / (title as HTMLElement).offsetWidth;
    const contentRight =
      titleBox.right - parseFloat(getComputedStyle(title).paddingRight) * scale;
    return numberBox.left - contentRight;
  }, titleSelector);
  expect(gap, "章节标记必须位于标题内容区域之外").toBeGreaterThanOrEqual(0);
}

test("nested section numbers leave room for long titles and title editing", async ({
  page,
}) => {
  const board = insuranceBoard();
  const child = board.nodes.find((node) => node.id === "c-wait")!;
  child.title = "等待期内确诊疾病时如何判断赔付条件";
  await installFakeAtlas(page, false, "web", [board]);
  await gotoApp(page);
  const card = page.locator('.react-flow__node[data-id="c-wait"] .card');
  await expect(card.locator(".no")).toHaveText("§2.1");
  await page.evaluate(() => document.fonts.ready);
  await expectHeadingClear(card, "h3");
  await card.locator("h3").dblclick();
  await expect(card.locator(".title-input")).toBeVisible();
  await expectHeadingClear(card, ".title-input");
});
