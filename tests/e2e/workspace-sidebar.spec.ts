import { test, expect, type Page } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { insuranceBoard } from "./fixtures";
import { gotoApp, reloadApp } from "./ready";

const sidebar = (page: Page) =>
  page.getByRole("complementary", { name: "学习空间", exact: true });
const card = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);

function boards() {
  const first = insuranceBoard(true);
  const second = insuranceBoard(false);
  first.title = "重疾险条款";
  second.id = "board-light";
  second.title = "光的折射";
  second.topic = "光为什么会折射？";
  second.nodes[0].title = second.topic;
  second.nodes[0].body = "光从空气进入水时会改变方向。";
  second.notes = [];
  second.updatedAt = "2026-01-01T00:00:00.000Z";
  return [first, second];
}

test("the sidebar switches the whole canvas, saves edits and clears the previous context", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", boards());
  await gotoApp(page);
  const nav = sidebar(page).getByRole("navigation", { name: "知识画布" });
  await expect(
    nav.getByRole("button", { name: "重疾险条款", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await card(page, "c-what").click();
  await page.getByLabel("批注内容").fill("切换前写下的理解");
  await page.getByRole("button", { name: "查看全图" }).click();
  await card(page, "c-how").click({ modifiers: ["Shift"] });
  await expect(page.getByRole("toolbar", { name: "多选" })).toBeVisible();
  await nav.getByRole("button", { name: "光的折射", exact: true }).click();
  await expect(page.locator(".react-flow__node-root h2")).toHaveText(
    "光为什么会折射？",
  );
  await expect(
    nav.getByRole("button", { name: "光的折射", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("toolbar", { name: "多选" })).toHaveCount(0);
  await expect(page.locator(".drawer")).toHaveCount(0);
  await expect(page.locator(".title-input")).toHaveCount(0);

  await card(page, "topic-ci").click();
  const content = page.getByRole("region", { name: "这张卡", exact: true });
  await expect(content.locator(".card-body")).toHaveText(
    "光从空气进入水时会改变方向。",
  );
  await page.getByLabel("向 AI 提问").fill("光为什么改变方向？");
  await page.getByLabel("发送提问").click();
  await expect(page.locator(".drawer .msg.assistant")).toHaveCount(1);
  const asks = await page.evaluate(() => (window as any).__atlasAsks);
  expect(asks[0].boardId).toBe("board-light");
  expect(asks[0].context.topic).toBe("光为什么会折射？");
  expect(JSON.stringify(asks[0].context)).not.toContain("重疾险");

  await nav.getByRole("button", { name: "重疾险条款", exact: true }).click();
  await card(page, "c-what").click();
  await expect(page.getByLabel("批注内容")).toHaveValue("切换前写下的理解");
});

test("collapse and expand persist, and both sidebars leave the canvas controls centered", async ({
  page,
}) => {
  const seed = boards();
  seed[0].title = insuranceBoard(true).title;
  await installFakeAtlas(page, true, "web", seed);
  await gotoApp(page);
  const panel = sidebar(page);
  const canvas = page.locator(".react-flow");
  const geometry = () =>
    page.evaluate(() => {
      const rect = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect();
      const flow = rect(".react-flow");
      const dock = rect(".dock");
      return {
        canvasLeft: flow.left,
        canvasWidth: flow.width,
        centerOffset: Math.abs(
          dock.x + dock.width / 2 - flow.x - flow.width / 2,
        ),
        dockInside: dock.left >= flow.left && dock.right <= flow.right,
      };
    });
  await expect(panel).toHaveCSS("width", "244px");
  await expect
    .poll(() =>
      panel.locator("nav").evaluate((el) => el.scrollWidth <= el.clientWidth),
    )
    .toBe(true);
  await expect.poll(async () => (await geometry()).canvasLeft).toBe(244);
  const expandedWidth = (await canvas.boundingBox())!.width;
  await panel.getByRole("button", { name: "收起左侧边栏" }).click();
  await expect(panel).toHaveCSS("width", "56px");
  await expect(
    panel.getByRole("button", { name: "展开左侧边栏" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeGreaterThan(expandedWidth + 180);
  await reloadApp(page);
  await expect(panel).toHaveCSS("width", "56px");
  await panel.getByRole("button", { name: "展开左侧边栏" }).click();
  await expect(panel).toHaveCSS("width", "244px");

  await page.setViewportSize({ width: 1060, height: 780 });
  await card(page, "topic-ci").click();
  await expect(page.locator(".drawer")).toBeVisible();
  await expect
    .poll(async () => (await geometry()).centerOffset)
    .toBeLessThan(1);
  await expect.poll(async () => (await geometry()).dockInside).toBe(true);
  await page.getByRole("button", { name: "查看全图" }).click();
  await page.keyboard.press("ControlOrMeta+\\");
  await expect(panel).toHaveCSS("width", "56px");
  await expect
    .poll(async () => (await geometry()).centerOffset)
    .toBeLessThan(1);
});

test("search filters canvases; keyboard selection and creating a canvas stay accessible", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", boards());
  await gotoApp(page);
  const panel = sidebar(page);
  const nav = panel.getByRole("navigation", { name: "知识画布" });
  const search = panel.getByRole("textbox", { name: "搜索知识画布" });
  await search.fill("光");
  await expect(nav.locator(".workspace-board")).toHaveCount(1);
  await expect(
    nav.getByRole("button", { name: "光的折射", exact: true }),
  ).toBeVisible();
  await search.fill("不存在的画布");
  await expect(nav).toContainText("没有找到画布");
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(nav.locator(".workspace-board")).toHaveCount(2);

  // Enter in navigation activates a canvas instead of adding a sibling card.
  await card(page, "c-what").click();
  await nav.getByRole("button", { name: "光的折射", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".react-flow__node-root h2")).toHaveText(
    "光为什么会折射？",
  );
  await expect(page.locator(".title-input")).toHaveCount(0);
  await panel.getByRole("button", { name: "新建画布", exact: true }).click();
  await page.getByLabel("新白板问题").fill("树为什么长高？");
  await page.getByRole("button", { name: "开始探索", exact: true }).click();
  await expect(
    nav.getByRole("button", { name: "树为什么长高？", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".react-flow__node-root h2")).toHaveText(
    "树为什么长高？",
  );
});

test("reduced motion disables sidebar resizing and hover movement", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoApp(page);
  await expect(sidebar(page)).toHaveCSS("transition-duration", "0s");
  await sidebar(page).getByRole("button", { name: "收起左侧边栏" }).click();
  await expect(sidebar(page)).toHaveCSS("width", "56px");
  await expect(page.locator(".react-flow")).toHaveCSS(
    "transition-duration",
    "0s",
  );
});

test("dragging the sidebar resizes the canvas, clamps width and remembers it after reload", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", boards());
  await gotoApp(page);
  const panel = sidebar(page);
  const handle = panel.getByRole("separator", { name: "调整左侧栏宽度" });
  await expect(panel.locator(".workspace-footer")).toHaveCount(0);
  await expect(panel.locator(".workspace-board svg")).toHaveCount(0);
  const firstRow = panel.locator(".workspace-board-row").first();
  const arrow = (await firstRow
    .locator(".workspace-disclosure")
    .boundingBox())!;
  const title = (await firstRow
    .locator(".workspace-board-title")
    .boundingBox())!;
  expect(title.x - arrow.x - arrow.width).toBeLessThanOrEqual(3);

  async function dragBy(delta: number) {
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + delta, y, { steps: 5 });
  }

  await dragBy(80);
  await expect(panel).toHaveCSS("width", "324px");
  await expect(panel).toHaveCSS("transition-duration", "0s");
  expect((await page.locator(".react-flow").boundingBox())!.x).toBe(324);
  const flow = (await page.locator(".react-flow").boundingBox())!;
  const dock = (await page.locator(".dock").boundingBox())!;
  expect(
    Math.abs(dock.x + dock.width / 2 - flow.x - flow.width / 2),
  ).toBeLessThan(1);
  await page.mouse.up();
  await expect(page.locator(".app")).not.toHaveClass(/sidebar-resizing/);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("studyboard-sidebar-width")),
    )
    .toBe("324");
  await reloadApp(page);
  await expect(panel).toHaveCSS("width", "324px");
  await panel.getByRole("button", { name: "收起左侧边栏" }).click();
  await expect(panel).toHaveCSS("width", "56px");
  await expect(handle).toHaveCount(0);
  await expect(panel.locator(".workspace-board").first()).toContainText("重");
  await panel.getByRole("button", { name: "展开左侧边栏" }).click();
  await expect(panel).toHaveCSS("width", "324px");

  await dragBy(500);
  await expect(panel).toHaveCSS("width", "400px");
  await page.mouse.up();
  await dragBy(-500);
  await expect(panel).toHaveCSS("width", "200px");
  await page.mouse.up();
  await handle.focus();
  await handle.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "210");
  await handle.press("End");
  await expect(handle).toHaveAttribute("aria-valuenow", "400");
  // Let the width transition land before double-clicking the moving handle (macOS CI flake).
  await expect(panel).toHaveCSS("width", "400px");
  await handle.dblclick();
  await expect(panel).toHaveCSS("width", "244px");
});

test("collapsed sidebar entries center their visible content", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", boards());
  await gotoApp(page);
  const panel = sidebar(page);
  await panel.getByRole("button", { name: "收起左侧边栏" }).click();
  await expect(panel).toHaveCSS("width", "56px");
  const offsets = await panel.evaluate((el) =>
    [
      ...el.querySelectorAll(
        ".workspace-toggle, .workspace-action, .workspace-board",
      ),
    ].map((button) => {
      const content = button.querySelector(
        "svg, span:not(.workspace-copy):not(.workspace-current)",
      )!;
      const a = button.getBoundingClientRect();
      const b = content.getBoundingClientRect();
      return {
        x: Math.abs(a.x + a.width / 2 - b.x - b.width / 2),
        y: Math.abs(a.y + a.height / 2 - b.y - b.height / 2),
      };
    }),
  );
  for (const offset of offsets) {
    expect(offset.x).toBeLessThan(1);
    expect(offset.y).toBeLessThan(1);
  }
});

test("the application sidebar fills the window and the canvas starts at its divider", async ({
  page,
}) => {
  await gotoApp(page);
  const panel = sidebar(page);
  await expect(panel).not.toHaveClass(/chrome/);
  await expect(panel).toHaveCSS("border-radius", "0px");
  await expect(panel).toHaveCSS("box-shadow", "none");
  for (const collapsed of [false, true]) {
    if (collapsed)
      await panel.getByRole("button", { name: "收起左侧边栏" }).click();
    await expect(panel).toHaveCSS("width", collapsed ? "56px" : "244px");
    const box = (await panel.boundingBox())!;
    expect([box.x, box.y, box.height]).toEqual([
      0,
      0,
      page.viewportSize()!.height,
    ]);
    await expect
      .poll(async () => (await page.locator(".react-flow").boundingBox())!.x)
      .toBe(box.width);
  }
});

test("same-name canvases archive independently, persist after reload and restore from settings", async ({
  page,
}) => {
  const seed = boards();
  seed[1].title = seed[0].title;
  await installFakeAtlas(page, true, "web", seed);
  await gotoApp(page);
  const entries = sidebar(page).locator(".workspace-board");
  await entries.nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "归档", exact: true }).click();
  await expect(entries).toHaveCount(1);
  await expect(entries).toHaveAttribute("aria-current", "page");
  await reloadApp(page);
  await expect(entries).toHaveCount(1);
  await sidebar(page)
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await page.getByRole("button", { name: "已归档画布", exact: true }).click();
  const row = page.locator(".settings-section .setting-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(seed[1].title);
  await row.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(
    page.getByText("还没有归档的画布。", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(entries).toHaveCount(2);
  // Restoration sorts the second canvas first; verify its actual content.
  await entries.nth(0).click();
  await expect(page.locator(".react-flow__node-root h2")).toHaveText(
    seed[1].topic,
  );
});

test("archiving the current canvas switches away and archiving the last creates a fresh canvas", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", boards());
  await gotoApp(page);
  const entries = sidebar(page).locator(".workspace-board");
  await entries.filter({ hasText: "重疾险条款" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "归档", exact: true }).click();
  await expect(entries).toHaveCount(1);
  await expect(entries).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".react-flow__node-root h2")).toHaveText(
    "光为什么会折射？",
  );
  await entries.click({ button: "right" });
  await page.getByRole("menuitem", { name: "归档", exact: true }).click();
  await expect(entries).toHaveCount(1);
  await expect(entries).toHaveText("新的知识主题");
  await reloadApp(page);
  await expect(entries).toHaveCount(1);
  await expect(entries).toHaveText("新的知识主题");
  await sidebar(page)
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await page.getByRole("button", { name: "已归档画布", exact: true }).click();
  await expect(page.locator(".settings-section .setting-row")).toHaveCount(2);
});

test("archive menu dismisses with Escape and failed saves leave the canvas active", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", boards());
  await gotoApp(page);
  const current = sidebar(page).locator(
    '.workspace-board[aria-current="page"]',
  );
  await current.click({ button: "right" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(current).toBeFocused();
  await page.evaluate(() => {
    const api = window.atlas!;
    const save = api.saveBoard;
    api.saveBoard = async (board) => {
      if (board.archivedAt) throw new Error("归档保存失败");
      await save(board);
    };
  });
  await current.click({ button: "right" });
  await page.getByRole("menuitem", { name: "归档", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("归档保存失败");
  await expect(sidebar(page).locator(".workspace-board")).toHaveCount(2);
  await expect(current).toHaveText("重疾险条款");
  await reloadApp(page);
  await expect(sidebar(page).locator(".workspace-board")).toHaveCount(2);
});
