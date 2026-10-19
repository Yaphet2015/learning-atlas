import { test, expect, type Page } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { insuranceBoard } from "./fixtures";
import { gotoApp, reloadApp } from "./ready";

const roots = (page: Page) => page.locator(".react-flow__node-root");
const card = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);
const disk = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("fake-atlas-disk")!)[0].nodes as {
        id: string;
        title: string;
        parentId: string | null;
        order: number;
      }[],
  );

test("the root grows upward: a broader question above, the old root becomes its child", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
  await gotoApp(page);
  const root = card(page, "topic-ci");
  await root.hover();
  await root.getByRole("button", { name: "加更大的问题", exact: true }).click();
  const input = page.getByLabel("概念标题");
  await expect(input).toBeFocused();
  await input.fill("保险怎么选");
  await input.press("Enter");
  await expect(roots(page)).toHaveCount(1);
  await expect(roots(page)).toContainText("保险怎么选");
  // The old question is now a first-level card (§1) with its subtree under it.
  await expect(card(page, "topic-ci")).toHaveClass(/react-flow__node-concept/);
  await expect(card(page, "topic-ci").locator(".no")).toHaveText("§1");
  await expect(card(page, "c-how").locator(".no")).toHaveText("§1.3");
  await expect
    .poll(async () => (await disk(page)).find((n) => n.id === "topic-ci"))
    .toMatchObject({ parentId: expect.stringMatching(/^root_/), order: 0 });
  // It survives a reload.
  await reloadApp(page);
  await expect(roots(page)).toContainText("保险怎么选");
});

test("roots side by side: a new root beside, its own tree, 走一遍 and the outline see both", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
  await gotoApp(page);
  const root = card(page, "topic-ci");
  const before = {
    root: (await root.boundingBox())!,
    how: (await card(page, "c-how").boundingBox())!,
  };
  await root.hover();
  await root.getByRole("button", { name: "加并列的起点", exact: true }).click();
  const input = page.getByLabel("概念标题");
  await input.fill("医疗险怎么选");
  await input.press("Enter");
  await expect(roots(page)).toHaveCount(2);
  const side = roots(page).filter({ hasText: "医疗险怎么选" });
  // Grow a child under the new root: it is numbered §B1.
  await side.hover();
  await side.getByRole("button", { name: "加子概念", exact: true }).click();
  await page.getByLabel("概念标题").fill("免赔额");
  await page.getByLabel("概念标题").press("Enter");
  const child = page
    .locator(".react-flow__node-concept")
    .filter({ hasText: "免赔额" });
  await expect(child.locator(".no")).toHaveText("§B1");
  // The original tree keeps its shape: 怎么赔 sits where it did relative to the root.
  const [r0, how] = [
    await root.boundingBox(),
    await card(page, "c-how").boundingBox(),
  ];
  expect(Math.round(how!.x - r0!.x)).toBe(
    Math.round(before.how.x - before.root.x),
  );
  // The new root sits to the right on the same row as the first one.
  const sb = (await side.boundingBox())!;
  expect(Math.abs(sb.y - r0!.y)).toBeLessThan(2);
  expect(sb.x).toBeGreaterThan(r0!.x + r0!.width);
  // A request's outline lists both roots.
  await child.click();
  await page.keyboard.press("/");
  const drawer = page.locator(".drawer");
  await drawer.getByLabel("向 AI 提问").fill("免赔额是什么？");
  await drawer.getByLabel("发送提问").click();
  await expect(drawer.locator(".msg.assistant")).toHaveCount(1);
  const asks = await page.evaluate(() => (window as any).__atlasAsks);
  const outline = asks.at(-1).context.structure as string;
  expect(outline).toContain("L0 起点 重疾险有哪些比较重要的条款");
  expect(outline).toContain("§B L0 起点 医疗险怎么选");
  expect(outline).toContain("§B1 L1 免赔额");
  await page.keyboard.press("Escape");
  // 走一遍 walks the cards of both trees.
  // Clear the selected card with Escape: a fixed pane coordinate can hit a
  // ghost add-card hint while the closing drawer moves the viewport.
  await page.keyboard.press("Escape");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
  await page.getByRole("button", { name: /走一遍/ }).click();
  const study = page.getByRole("dialog", { name: "走一遍" });
  await expect(study).toBeVisible();
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    seen.push((await study.locator("h1").textContent()) ?? "");
    await page.keyboard.press("ArrowRight");
  }
  expect(seen).toContain("免赔额");
  await page.keyboard.press("Escape");
  // With two roots, one can be removed; the last one cannot.
  await side.click();
  await page.keyboard.press("Backspace");
  await expect(roots(page)).toHaveCount(2); // 免赔额 became a root in its place
  await expect(roots(page).filter({ hasText: "免赔额" })).toHaveCount(1);
});
