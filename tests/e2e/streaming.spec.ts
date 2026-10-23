import { test, expect } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { insuranceBoard } from "./fixtures";
import { gotoApp } from "./ready";

test("the drawer shows thinking → streaming → settled, with elapsed time", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
  await gotoApp(page);
  await page.evaluate(() => ((window as any).__atlasSlow = 1200));
  await page.locator('.react-flow__node[data-id="c-how"]').click();
  await page.keyboard.press("/");
  const drawer = page.locator(".drawer");
  await drawer.getByLabel("向 AI 提问").fill("赔付次数怎么算？");
  await drawer.getByLabel("发送提问").click();
  const live = drawer.locator(".msg.streaming");
  // Thinking: pixel grid, shimmering label, ticking elapsed time; no caret yet.
  await expect(live.locator(".stream-status")).toHaveAttribute(
    "data-phase",
    "thinking",
  );
  await expect(live.locator(".shimmer")).toHaveText("正在思考");
  await expect(live.locator(".pixel-grid span")).toHaveCount(9);
  await expect(live.locator(".elapsed")).toHaveText(/^\d+\.\ds$/);
  await expect(live.locator(".streaming-caret")).toHaveCount(0);
  // Streaming: the label changes and text arrives with a caret.
  await expect(live.locator(".shimmer")).toHaveText("正在回答");
  await expect(live.locator(".streaming-caret")).toHaveCount(1);
  await expect(live).toContainText("等待期是合同生效后");
  await expect(drawer.getByRole("button", { name: "停止回答" })).toBeVisible();
  // Settled: the indicator is gone, the answer and its actions are there.
  await expect(live).toHaveCount(0);
  await expect(drawer.locator(".msg.assistant")).toHaveCount(1);
  await expect(drawer.locator(".msg.assistant .acts")).toBeVisible();
});

test("reduced motion: the loader holds still, the timer still ticks", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
  await gotoApp(page);
  await page.evaluate(() => ((window as any).__atlasSlow = 1500));
  await page.locator('.react-flow__node[data-id="c-how"]').click();
  await page.keyboard.press("/");
  const drawer = page.locator(".drawer");
  await drawer.getByLabel("向 AI 提问").fill("赔付次数怎么算？");
  await drawer.getByLabel("发送提问").click();
  const cell = drawer.locator(".pixel-grid span").first();
  await expect(cell).toBeVisible();
  expect(await cell.evaluate((e) => getComputedStyle(e).animationName)).toBe(
    "none",
  );
  const first = await drawer.locator(".elapsed").textContent();
  await page.waitForTimeout(400);
  expect(await drawer.locator(".elapsed").textContent()).not.toBe(first);
});
