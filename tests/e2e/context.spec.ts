import { test, expect, type Page } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { insuranceBoard } from "./fixtures";
import { gotoApp } from "./ready";

const card = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);

async function open(page: Page) {
  await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
  await gotoApp(page);
  await expect(page.locator(".react-flow__node-concept")).toHaveCount(6);
}

/** The card's box once the opening fit has settled (two equal reads in a row). */
async function box(page: Page, id: string) {
  let last = "";
  await expect
    .poll(async () => {
      const b = await card(page, id).boundingBox();
      const now = JSON.stringify(b);
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
  return JSON.parse(last) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

test("a marquee on empty canvas picks cards and 问 AI sends them all", async ({
  page,
}) => {
  await open(page);
  const how = await box(page, "c-how");
  const money = await box(page, "c-money");
  // From empty canvas below-right of 钱和手续 to the middle of 怎么赔.
  await page.mouse.move(
    money.x + money.width + 30,
    money.y + money.height + 40,
  );
  await page.mouse.down();
  await page.mouse.move(how.x + how.width / 2, how.y + how.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  const bar = page.getByRole("toolbar", { name: "多选" });
  await expect(bar).toContainText("已选 2 张卡");
  await expect(card(page, "c-how")).toHaveClass(/selected/);
  await expect(card(page, "c-money")).toHaveClass(/selected/);
  await expect(card(page, "c-what")).not.toHaveClass(/selected/);
  // The per-card toolbar steps aside while several cards are picked.
  await expect(page.locator(".select-toolbar:visible")).toHaveCount(0);
  await bar.getByRole("button", { name: /问 AI/ }).click();
  const drawer = page.locator(".drawer");
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("向 AI 提问").fill("这两块有什么关系？");
  await drawer.getByLabel("发送提问").click();
  await expect(drawer.locator(".msg.assistant")).toHaveCount(1);
  const asks = await page.evaluate(() => (window as any).__atlasAsks);
  const ids = asks[0].context.references.map((r: any) => r.id);
  expect(ids).toEqual(expect.arrayContaining(["c-how", "c-money"]));
  expect(asks[0].context.structure).toMatch(/当前卡片：§\d+ (怎么赔|钱和手续)/);
  expect(asks[0].context.structure).toContain("◀ 已选入");
  await expect(bar).toHaveCount(0);
});

test("Shift/⌘-click toggles cards; a plain click or Esc goes back to one", async ({
  page,
}) => {
  await open(page);
  const bar = page.getByRole("toolbar", { name: "多选" });
  await card(page, "c-what").click();
  await card(page, "c-how").click({ modifiers: ["Shift"] });
  await card(page, "c-money").click({ modifiers: ["ControlOrMeta"] });
  await expect(bar).toContainText("已选 3 张卡");
  await card(page, "c-how").click({ modifiers: ["Shift"] });
  await expect(bar).toContainText("已选 2 张卡");
  await expect(card(page, "c-how")).not.toHaveClass(/selected/);
  await page.keyboard.press("Escape");
  await expect(bar).toHaveCount(0);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
  await card(page, "c-what").click();
  await card(page, "c-how").click({ modifiers: ["Shift"] });
  await expect(bar).toContainText("已选 2 张卡");
  await card(page, "c-wait").click();
  await expect(bar).toHaveCount(0);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
  // "/" with several cards picked asks about all of them.
  await card(page, "c-how").click({ modifiers: ["Shift"] });
  await page.keyboard.press("/");
  await expect(page.getByLabel("批注标题")).toHaveValue(
    "关于「等待期是什么」等 2 张卡",
  );
  await expect(page.locator(".drawer .dhead")).toContainText("另带 1 张卡");
});

test("Space-drag pans instead of drawing a marquee", async ({ page }) => {
  await open(page);
  const viewport = page.locator(".react-flow__viewport");
  const before = await viewport.getAttribute("style");
  const money = await box(page, "c-money");
  await page.mouse.move(
    money.x + money.width + 30,
    money.y + money.height + 40,
  );
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(money.x - 80, money.y - 40, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(page.getByRole("toolbar", { name: "多选" })).toHaveCount(0);
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(before);
});

test("「添加卡片」 searches the board and adds or removes context cards", async ({
  page,
}) => {
  await open(page);
  await card(page, "c-how").click();
  await page.keyboard.press("/");
  const drawer = page.locator(".drawer");
  await drawer.locator(".ctx").click();
  await drawer.getByRole("button", { name: "添加卡片" }).click();
  const picker = drawer.getByRole("group", { name: "添加卡片" });
  await picker.getByLabel("搜索卡片").fill("等待期");
  await expect(picker.locator("li")).toHaveCount(1);
  await picker.getByRole("checkbox").check();
  await picker.getByLabel("搜索卡片").fill("");
  await expect(picker.locator("li")).toHaveCount(6);
  // The card now shows in the reference list as well.
  await expect(drawer.locator(".ctx-list").first()).toContainText(
    "等待期是什么",
  );
  await drawer.getByLabel("向 AI 提问").fill("等待期算在哪一块？");
  await drawer.getByLabel("发送提问").click();
  await expect(drawer.locator(".msg.assistant")).toHaveCount(1);
  let asks = await page.evaluate(() => (window as any).__atlasAsks);
  expect(asks[0].context.references.map((r: any) => r.id)).toContain("c-wait");
  expect(asks[0].context.structure).toContain("等待期是什么 [待探索] ◀ 已选入");
  // Unticking takes it out of the next request.
  await picker.getByLabel("搜索卡片").fill("等待期");
  await picker.getByRole("checkbox").uncheck();
  await drawer.getByLabel("向 AI 提问").fill("那怎么赔呢？");
  await drawer.getByLabel("发送提问").click();
  await expect(drawer.locator(".msg.assistant")).toHaveCount(2);
  asks = await page.evaluate(() => (window as any).__atlasAsks);
  expect(asks[1].context.references.map((r: any) => r.id)).not.toContain(
    "c-wait",
  );
});
