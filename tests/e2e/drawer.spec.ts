import { test, expect, type Page } from "@playwright/test";
import { insuranceBoard } from "./fixtures";

async function open(page: Page, board: unknown) {
  await page.addInitScript(
    (value) => {
      localStorage.setItem("studyboard-preview-boards-v1", value);
    },
    JSON.stringify([board]),
  );
  await page.goto("/");
  await page.locator(".react-flow__node-root").click();
  await page.keyboard.press("/");
  return page.locator(".drawer");
}

test("an answer renders as blocks, never as raw markdown", async ({ page }) => {
  const drawer = await open(page, insuranceBoard(false));
  const answer = drawer.locator(".msg.assistant");
  await expect(answer).not.toContainText("**");
  await expect(answer.locator(".ans-outline li")).toHaveCount(4);
  await expect(answer.locator(".ans-outline .bl")).toContainText("骨架 · 4 块");
  await expect(answer.locator(".analogy")).toContainText("租房合同");
  await expect(answer.getByRole("checkbox")).toHaveCount(3);
  await answer.getByRole("checkbox").first().click();
  await expect(answer.getByRole("checkbox").first()).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // The check question offers the outline heads as options.
  await expect(answer.locator(".check").getByRole("radio")).toHaveCount(4);
  // One title, one meta line; no separate eyebrow or delete text button.
  await expect(drawer.locator(".dhead .m")).toContainText("2 条消息");
  await expect(drawer.getByText("删除这张批注")).toHaveCount(0);
});

test("「铺成第一层」 lays the outline as unseen cards, undoably", async ({
  page,
}) => {
  const drawer = await open(page, insuranceBoard(false));
  await expect(page.locator(".react-flow__node-concept")).toHaveCount(0);
  await drawer.getByRole("button", { name: "铺成第一层" }).first().click();
  const cards = page.locator(".react-flow__node-concept");
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toContainText("保什么");
  await expect(
    page.locator(".react-flow__node-concept .card.s-unseen"),
  ).toHaveCount(4);
  await expect(drawer.locator(".lay.done")).toContainText("已铺成第一层");
  await page.locator(".react-flow__pane").click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cards).toHaveCount(0);
  await expect(drawer.locator(".lay.done")).toHaveCount(0);
});

test("the ⋯ menu deletes the note without a confirm, and ⌘Z brings it back", async ({
  page,
}) => {
  const drawer = await open(page, insuranceBoard(false));
  await drawer.getByRole("button", { name: "更多操作" }).click();
  await drawer.getByRole("menuitem", { name: /删除这张批注/ }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("⌘Z");
  await page.keyboard.press("ControlOrMeta+z");
  await page.locator(".react-flow__node-root").click();
  await page.keyboard.press("/");
  await expect(page.locator(".drawer .msg.assistant")).toHaveCount(1);
});

test("参考 is one line that opens into a checklist; unticked items are remembered", async ({
  page,
}) => {
  const drawer = await open(page, insuranceBoard(true));
  const ctx = drawer.locator(".ctx");
  await expect(ctx).toContainText("起点问题");
  await expect(drawer.locator(".ctx-list")).toHaveCount(0);
  await ctx.click();
  const list = drawer.locator(".ctx-list");
  await expect(list.getByRole("checkbox").first()).toBeDisabled();
  const item = list.getByRole("checkbox", { name: /保什么/ });
  await item.uncheck();
  await expect(drawer.locator(".cchip")).toContainText("第一层");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyboard-preview-boards-v1")!)[0]
            .notes[0].excludedRefs,
      ),
    )
    .toEqual(["node:c-what"]);
});

test("the composer shows its state: empty, typing", async ({ page }) => {
  const drawer = await open(page, insuranceBoard(false));
  const send = drawer.getByLabel("发送提问");
  await expect(send).toBeDisabled();
  await drawer.getByLabel("向 AI 提问").fill("等待期多长算正常？");
  await expect(send).toHaveClass(/ready/);
  await expect(drawer.locator(".hint-kbd")).toHaveText("⇧↵ 换行");
});

test("progress reads 「N / M 讲清楚」 and the long title keeps a tooltip", async ({
  page,
}) => {
  await open(page, insuranceBoard(true));
  await expect(page.locator(".progress .count")).toHaveText("1 / 6 讲清楚");
  await expect(page.locator(".progress .bar i")).toHaveCount(6);
  await expect(page.locator(".switcher-text strong")).toHaveAttribute(
    "title",
    /教会我 12 条及以上/,
  );
});

test("the drawer is a labelled region; Esc closes it and returns focus to the card", async ({
  page,
}) => {
  await open(page, insuranceBoard(true));
  const drawer = page.getByRole("complementary", { name: "批注：带我起步" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("向 AI 提问")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page.locator(".react-flow__node-root")).toBeFocused();
  // Hierarchical numbering and the bracketed subtitle on the root.
  await expect(
    page
      .locator(".react-flow__node-concept", { hasText: "等待期是什么" })
      .locator(".no"),
  ).toHaveText("§2.1");
  await expect(page.locator(".origin h2 .sub")).toHaveText(
    "（教会我 12 条及以上）",
  );
});

test("once the first level exists, 「铺成第一层」 turns into a locate, never a duplicate", async ({
  page,
}) => {
  // insuranceBoard(true): the root already has its 4 L1 cards.
  const drawer = await open(page, insuranceBoard(true));
  const cards = page.locator(".react-flow__node-concept");
  await expect(cards).toHaveCount(6);
  await expect(drawer.getByRole("button", { name: "铺成第一层" })).toHaveCount(
    0,
  );
  const done = drawer.locator(".ans-outline .lay.done");
  await expect(done).toHaveText("已铺成第一层 · 在画布上定位");
  await done.getByRole("button", { name: "在画布上定位" }).click();
  await expect(page.locator(".react-flow__node-root")).toHaveClass(/selected/);
  // The primary button falls back to 整段作为一张卡; the menu offers locate only.
  await drawer.getByRole("button", { name: "更多加入方式" }).click();
  await expect(
    drawer.getByRole("menuitem", { name: /已铺成第一层 · 在画布上定位/ }),
  ).toBeVisible();
  await drawer.getByRole("menuitem", { name: /已铺成第一层/ }).click();
  await expect(cards).toHaveCount(6);
});

test("laying the outline flips it to the done state right away", async ({
  page,
}) => {
  const drawer = await open(page, insuranceBoard(false));
  await drawer.getByRole("button", { name: "铺成第一层" }).first().click();
  await expect(page.locator(".react-flow__node-concept")).toHaveCount(4);
  await expect(drawer.getByRole("button", { name: "铺成第一层" })).toHaveCount(
    0,
  );
  await expect(drawer.locator(".lay.done")).toContainText("在画布上定位");
});

test("参考 keeps a trailing +N, and 我的笔记 is one quiet row when empty", async ({
  page,
}) => {
  const drawer = await open(page, insuranceBoard(true));
  const ctx = drawer.locator(".ctx");
  await expect(ctx.locator(".more")).toHaveText(/^\+\d+$/);
  const [items, more, box] = await Promise.all([
    ctx.locator(".items").boundingBox(),
    ctx.locator(".more").boundingBox(),
    ctx.boundingBox(),
  ]);
  // The count sits after the names and inside the row.
  expect(more!.x).toBeGreaterThanOrEqual(items!.x + items!.width - 1);
  expect(more!.x + more!.width).toBeLessThanOrEqual(box!.x + box!.width);
  const note = drawer.locator(".my-note");
  await expect(note).toContainText("我的笔记");
  const h = (await note.boundingBox())!.height;
  expect(h).toBeLessThan(36);
  const border = await note.evaluate(
    (e) => getComputedStyle(e).borderLeftWidth,
  );
  expect(border).toBe("0px");
});

test("the root's + stays off the connector origin unless hovered", async ({
  page,
}) => {
  await open(page, insuranceBoard(true));
  const plus = page.locator(".react-flow__node-root .plus.below");
  await page.mouse.move(5, 500);
  await expect(plus).toHaveCSS("opacity", "0");
  await page.locator(".react-flow__node-root").hover();
  await expect(plus).toHaveCSS("opacity", "1");
});
