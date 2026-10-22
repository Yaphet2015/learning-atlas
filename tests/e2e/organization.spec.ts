import { test, expect } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { insuranceBoard } from "./fixtures";
import { gotoApp } from "./ready";

for (const outcome of ["success", "failed", "cancel"] as const) {
  test(`canvas Agent preview: ${outcome}`, async ({ page }) => {
    const board = insuranceBoard(true);
    const draft = structuredClone(board);
    draft.nodes[1].title = "校对后的卡片";
    draft.nodes[2].parentId = draft.nodes[1].id;
    draft.nodes[2].order = 0;
    await installFakeAtlas(page, true, "web", [board]);
    await page.addInitScript(
      ({ draft, fail }) => {
        (window as any).__atlasCanvasDraft = draft;
        (window as any).__atlasCanvasFail = fail;
      },
      { draft, fail: outcome === "failed" },
    );
    await gotoApp(page);
    await page.getByRole("button", { name: "整理画布", exact: true }).click();
    await expect(page.locator(".canvas-run-progress")).toBeVisible();
    const card = page.locator('.react-flow__node[data-id="c-what"]');
    await expect(card).toContainText("校对后的卡片");
    await expect(page.locator(".canvas-edit-locked")).toBeVisible();
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("fake-atlas-disk")!),
    );
    expect(stored[0].nodes[1].title).toBe(board.nodes[1].title);
    if (outcome === "cancel")
      await page
        .locator(".canvas-run-progress")
        .getByRole("button", { name: "取消", exact: true })
        .click();
    await expect(page.locator(".canvas-run-progress")).toHaveCount(0);
    if (outcome === "success") {
      await expect(card).toContainText("校对后的卡片");
      await page.keyboard.press("ControlOrMeta+z");
      await expect(card).toContainText(board.nodes[1].title);
    } else {
      await expect(card).toContainText(board.nodes[1].title);
      if (outcome === "failed")
        await expect(
          page.getByText("本轮校对未完成，修改未提交。", { exact: true }),
        ).toBeVisible();
      await page.waitForTimeout(1000);
      await expect(card).toContainText(board.nodes[1].title);
    }
    await page.getByRole("button", { name: "画布操作" }).click();
    await page.getByRole("menuitem", { name: /整理记录与恢复/ }).click();
    await expect(page.getByRole("dialog", { name: "整理记录与恢复" })).toBeVisible();
    const requests = await page.evaluate(() => (window as any).__atlasAsks);
    expect(requests[0].context.review).toBeUndefined();
    expect(requests[0].context.references).toEqual([]);
  });
}

test("a rejected canvas task permits retry", async ({ page }) => {
  await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
  await page.addInitScript(() => {
    (window as any).__atlasOrganizationError = true;
  });
  await gotoApp(page);
  const organize = page.getByRole("button", { name: "整理画布", exact: true });
  await organize.click();
  await expect(
    page.getByText("整理请求失败，请重试。", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as any).__atlasOrganizationError = false;
  });
  await organize.click();
  await expect(page.locator(".canvas-run-progress")).toBeVisible();
  await expect(page.locator(".canvas-run-progress")).toHaveCount(0);
});

test("ordinary conversation previews edits and preserves the response after commit and undo", async ({
  page,
}) => {
  const board = insuranceBoard(true);
  const draft = structuredClone(board);
  draft.nodes[1].title = "对话校对后的卡片";
  await installFakeAtlas(page, true, "web", [board]);
  await page.addInitScript((draft) => {
    (window as any).__atlasChatCanvas = true;
    (window as any).__atlasCanvasDraft = draft;
  }, draft);
  await gotoApp(page);
  await page.locator('.react-flow__node[data-id="c-what"]').click();
  const drawer = page.locator(".drawer");
  await drawer.getByLabel("向 AI 提问").fill("请修改这张卡片的标题。");
  await drawer.getByLabel("发送提问").click();
  await expect(page.locator(".canvas-run-progress")).toBeVisible();
  await expect(
    page.locator('.react-flow__node[data-id="c-what"]'),
  ).toContainText("对话校对后的卡片");
  await expect(page.locator(".canvas-run-progress")).toHaveCount(0);
  await expect(drawer.locator(".msg.assistant")).not.toHaveCount(0);
  await page
    .locator(".react-flow__pane")
    .click({ position: { x: 800, y: 600 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(
    page.locator('.react-flow__node[data-id="c-what"]'),
  ).toContainText(board.nodes[1].title);
  const requests = await page.evaluate(() => (window as any).__atlasAsks);
  expect(requests[0].canvas).toBe(true);
  expect(requests[0].context.review).toBeUndefined();
});
