import { test, expect, type Page } from "@playwright/test";
const card = (page: Page, title: string) =>
  page.locator(".react-flow__node", { hasText: title }).first();
const stored = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("studyboard-preview-boards-v1") ?? "[]"),
  );
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(card(page, "样式计算")).toBeVisible();
});
test("walkthrough renders on the tree and the experiment still works", async ({
  page,
}) => {
  await expect(page.locator(".react-flow__node-root h2")).toHaveText(
    "浏览器如何把 HTML、CSS 变成屏幕上的页面？",
  );
  expect(
    await page.evaluate(() => document.fonts.check('700 22px "LXGW WenKai"')),
  ).toBe(true);
  await page.getByText("动手看一看").click();
  const box = page.locator(".preview-box");
  await page.getByLabel("盒子宽度").fill("110");
  await expect(box).toHaveCSS("width", "110px");
  await page.getByLabel("颜色 #789b8d").click();
  await expect(box).toHaveCSS("background-color", "rgb(120, 155, 141)");
  await expect(page.getByText("颜色改变 → 几何不变，更新绘制")).toBeVisible();
});
test("siblings sit left to right in one row; Tab adds a child, Enter a sibling", async ({
  page,
}) => {
  const xs = await Promise.all(
    ["DOM", "样式计算", "布局与绘制"].map(async (t) => {
      const b = (await card(page, t).boundingBox())!;
      return [b.x, b.y] as const;
    }),
  );
  expect(xs[0][0]).toBeLessThan(xs[1][0]);
  expect(xs[1][0]).toBeLessThan(xs[2][0]);
  expect(Math.abs(xs[0][1] - xs[2][1])).toBeLessThan(1);
  await card(page, "DOM").click();
  await page.keyboard.press("Tab");
  await expect(page.locator(".title-input")).toBeFocused();
  await page.locator(".title-input").fill("标签树");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.locator(".title-input")).toBeFocused();
  await page.locator(".title-input").fill("文本节点");
  await page.keyboard.press("Enter");
  const a = (await card(page, "标签树").boundingBox())!;
  const b = (await card(page, "文本节点").boundingBox())!;
  expect(b.x).toBeGreaterThan(a.x);
  expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  expect(a.y).toBeGreaterThan(xs[0][1] + 100);
  // Poll the debounced autosave instead of sleeping a fixed time.
  await expect
    .poll(async () => {
      const [board] = await stored(page);
      return (board?.nodes ?? [])
        .filter((n: { parentId: string }) => n.parentId === "concept-dom")
        .map((n: { title: string; order: number }) => [n.title, n.order]);
    })
    .toEqual([
      ["标签树", 0],
      ["文本节点", 1],
    ]);
});
test("mastery lives on the card, is undoable, and the note drawer keeps input without AI", async ({
  page,
}) => {
  await card(page, "样式计算").click();
  await page.getByRole("radio", { name: "我能解释" }).click();
  await expect(
    card(page, "样式计算").getByRole("img", { name: "我能解释" }),
  ).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card(page, "样式计算").locator(".seal")).toHaveCount(0);
  await card(page, "样式计算").click();
  await page.keyboard.press("/");
  await page.getByLabel("批注内容").fill("What changes when width changes?");
  await page.getByLabel("向 AI 提问").fill("Help me compare the two changes");
  await page.getByLabel("发送提问").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("关闭设置").click();
  await expect(page.getByLabel("向 AI 提问")).toHaveValue(
    "Help me compare the two changes",
  );
  await expect(
    page.locator(".drawer .ctx", { hasText: "样式计算" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await stored(page)).some((b: { notes?: { text: string }[] }) =>
        b.notes?.some((n) => n.text === "What changes when width changes?"),
      ),
    )
    .toBe(true);
  await page.reload();
  await card(page, "样式计算").click();
  await page.keyboard.press("n");
  await expect(page.getByLabel("批注内容")).toHaveValue(
    "What changes when width changes?",
  );
});
test("走一遍 steps through a level: predict → explain → self-rate", async ({
  page,
}) => {
  await page.getByRole("button", { name: /走一遍/ }).click();
  const study = page.getByRole("dialog", { name: "走一遍" });
  await expect(study.locator("h1")).toHaveText("DOM");
  await study.getByPlaceholder("我猜……").fill("变成一棵树");
  await study
    .getByPlaceholder("讲给一个刚接触的人听……")
    .fill("HTML 标签按嵌套关系变成树");
  await study.getByRole("button", { name: "能讲给别人" }).click();
  await study.getByRole("button", { name: /下一站/ }).click();
  await expect(study.locator("h1")).toHaveText("样式计算");
  await page.keyboard.press("Escape");
  await expect(card(page, "DOM").locator(".seal")).toBeVisible();
  await expect(card(page, "DOM").locator(".hand")).toContainText("HTML 标签");
});
test("arbitrary topic stays a real AI setup state and keeps the new board", async ({
  page,
}) => {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("button", { name: /新的问题/ }).click();
  await page.getByLabel("新白板问题").fill("How does a rainbow form?");
  await page.getByRole("button", { name: "开始探索", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("关闭设置").click();
  await expect(page.locator(".react-flow__node-root h2")).toHaveText(
    "How does a rainbow form?",
  );
  await expect(page.locator(".react-flow__node-concept")).toHaveCount(0);
  await expect
    .poll(async () =>
      (await stored(page)).some((b: { nodes?: { title: string }[] }) =>
        b.nodes?.some((n) => n.title === "How does a rainbow form?"),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.locator(".react-flow__node-root h2")).toHaveText(
    "How does a rainbow form?",
  );
});
test("mobile shows an indented outline", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".outline .row")).toHaveCount(3);
  await expect(page.locator(".outline .row").first()).toContainText("DOM");
});
