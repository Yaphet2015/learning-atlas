import { test, expect, type Page } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { insuranceBoard } from "./fixtures";
import { gotoApp } from "./ready";

const card = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);
const asks = (page: Page) =>
  page.evaluate(() => (window as any).__atlasAsks as any[]);

export function plannedBoard() {
  const board: any = insuranceBoard(true);
  board.nodes.find((n: any) => n.id === "c-what").planBlock = "b-what";
  board.plan = {
    status: "confirmed",
    intent: "concept",
    goal: "学完后，能读懂一份重疾险条款的关键部分。",
    learner: "按初学者处理",
    blocks: [
      { id: "b-what", title: "保什么", why: "先知道保障范围", parent: null, prerequisites: [], core: true },
      { id: "b-tiers", title: "多次赔付的间隔期", why: "分层决定赔多少", parent: "b-what", prerequisites: [], core: true },
      { id: "b-wait", title: "等待期与免责", why: "决定会不会落空", parent: null, prerequisites: ["b-what"], core: true },
    ],
    outOfScope: [],
  };
  return board;
}

const oneCard = (id: string, title: string, block?: string) =>
  JSON.stringify({
    nodes: [{ id, title, body: "一张新卡片。", parent: "anchor", ...(block ? { block } : {}) }],
    relations: [],
  });

test("dig-which-way: the chosen angle drives the expand prompt", async ({ page }) => {
  await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
  await page.addInitScript((answer) => {
    (window as any).__atlasExpansionAnswers = [answer];
  }, oneCard("why1", "为什么要分轻重症"));
  await gotoApp(page);
  await card(page, "c-what").click();
  await page.getByRole("button", { name: "往哪挖" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(6);
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await menu.getByRole("menuitem", { name: /边界与例外/ }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "为什么要分轻重症" })).toHaveCount(1);
  const [ask] = await asks(page);
  expect(ask.mode).toBe("expand");
  expect(ask.prompt).toContain("挖掘方向「边界与例外」");
  expect(ask.prompt).toContain('depthType 写 "edge"');
  expect(ask.prompt).not.toContain("深度阶梯");
  // Esc closes the menu without asking.
  await card(page, "c-what").click();
  await page.getByRole("button", { name: "往哪挖" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await asks(page)).toHaveLength(1);
});

test("angle-labelled ghost hints: tags, extra angles, and the new card keeps the angle", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
  await page.addInitScript(() => ((window as any).__atlasHintAngles = true));
  await gotoApp(page);
  const owner = card(page, "c-how");
  await owner.locator("article").hover();
  const below = owner.locator(".ghost-hint.below");
  await expect(below).toHaveText("提示·子0");
  await expect(below).toHaveAttribute("data-angle-label", "为什么");
  await expect(owner.locator(".ghost-hint.right")).toHaveAttribute("data-angle", "compare");
  const alts = owner.locator(".ghost-hint.alt");
  await expect(alts).toHaveText(["例子·子0", "边界·子0"]);
  await expect(alts.first()).toHaveAccessibleName(/举个例子/);
  await alts.nth(1).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nodes = JSON.parse(localStorage.getItem("fake-atlas-disk")!)[0].nodes;
        const n = nodes.find((x: any) => x.title === "边界·子0");
        return n && [n.parentId, n.depthType];
      }),
    )
    .toEqual(["c-how", "edge"]);
});

test("coverage panel: covered vs missing, and a missing block generates its card", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", [plannedBoard()]);
  await page.addInitScript((answer) => {
    (window as any).__atlasExpansionAnswers = [answer];
  }, oneCard("tiers", "间隔期内再次确诊怎么办", "b-tiers"));
  await gotoApp(page);
  const head = page.getByRole("button", { name: /计划覆盖/ });
  await expect(head).toContainText("1 / 3");
  await head.click();
  const panel = page.locator(".coverage");
  await expect(panel.locator(".cov-item.covered")).toHaveCount(1);
  await expect(panel.locator(".cov-item.missing")).toHaveCount(2);
  await page.getByRole("button", { name: "生成：多次赔付的间隔期" }).click();
  await expect(head).toContainText("2 / 3");
  await expect(panel.locator('.cov-item.covered[data-block="b-tiers"]')).toHaveCount(1);
  const [ask] = await asks(page);
  expect(ask).toMatchObject({ mode: "expand", stickyId: "expand-c-what" });
  expect(ask.prompt).toContain('block 写 "b-tiers"');
  // A missing top-level block grows from the root.
  await page.evaluate(() => {
    (window as any).__atlasExpansionAnswers = [
      JSON.stringify({ nodes: [{ id: "w", title: "等待期", body: "x", parent: "anchor", block: "b-wait" }], relations: [] }),
    ];
  });
  await page.getByRole("button", { name: "生成：等待期与免责" }).click();
  await expect(head).toContainText("3 / 3");
  const second = (await asks(page))[1];
  expect(second.stickyId).toBe("expand-topic-ci");
  expect(second.prompt).toContain("保什么");
});
