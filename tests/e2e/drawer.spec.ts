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
