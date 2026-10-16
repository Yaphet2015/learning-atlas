import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("先有画面，")).toBeVisible();
});
test("walkthrough renders and real experiment changes width and color", async ({
  page,
}) => {
  await expect(page.getByText("一行 CSS，画面为什么变了？")).toBeVisible();
  const box = page.locator(".preview-box");
  const previous = await box.evaluate((el) => getComputedStyle(el).width);
  await page.getByLabel("盒子宽度").fill("110");
  await expect(box).toHaveCSS("width", "110px");
  expect(previous).not.toBe("110px");
  await page.getByLabel("颜色 #789b8d").click();
  await expect(box).toHaveCSS("background-color", "rgb(120, 155, 141)");
  await expect(page.getByText("颜色改变 → 几何不变，更新绘制")).toBeVisible();
  await page.screenshot({
    path: "test-results/atlas-walkthrough.png",
    fullPage: true,
  });
});
test("notes persist, retain input without AI, and allow context attachments", async ({
  page,
}) => {
  await page.getByText("贴张批注", { exact: true }).click();
  await page.getByLabel("批注内容").fill("What changes when width changes?");
  await page.getByLabel("向 AI 提问").fill("Help me compare the two changes");
  await page.getByLabel("发送提问").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("关闭设置").click();
  await expect(page.getByLabel("向 AI 提问")).toHaveValue(
    "Help me compare the two changes",
  );
  await page.getByLabel("关联到").selectOption("node:concept-render");
  await expect(
    page
      .locator(".context-reference-list")
      .getByText("布局与绘制", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("批注内容")).toHaveValue(
    "What changes when width changes?",
  );
});
test("expand is progressive, user self-assessment stays separate, relation edit and undo work", async ({
  page,
}) => {
  await page.getByText("拆开「布局与绘制」").click();
  await expect(
    page.getByRole("heading", { name: "布局：放在哪里？" }),
  ).toBeVisible();
  await page.getByRole("heading", { name: "布局：放在哪里？" }).click();
  await expect(page.locator(".status-picker .active")).toHaveText("待探索");
  await page.getByRole("button", { name: "我能解释", exact: true }).click();
  await expect(page.locator(".status-picker .active")).toHaveText("我能解释");
  await page.getByText("移除概念", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "布局：放在哪里？" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "布局：放在哪里？" }),
  ).toBeVisible();
});
test("arbitrary topic stays a real AI setup state and keeps the new board", async ({
  page,
}) => {
  await page.getByRole("button", { name: /新的问题/ }).click();
  await page.getByLabel("新白板问题").fill("How does a rainbow form?");
  await page.getByRole("button", { name: "开始探索", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("关闭设置").click();
  await expect(page.locator(".question-bar h1")).toHaveText(
    "How does a rainbow form?",
  );
  await expect(page.locator(".react-flow__node-concept")).toHaveCount(1);
  await page.getByRole("button", { name: /^生成起点/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("关闭设置").click();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".question-bar h1")).toHaveText(
    "How does a rainbow form?",
  );
});
