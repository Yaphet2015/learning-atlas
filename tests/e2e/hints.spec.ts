import { test, expect, type Page } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { insuranceBoard } from "./fixtures";
import { gotoApp } from "./ready";

const card = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);
const hintAsks = (page: Page) =>
  page.evaluate(() => (window as any).__atlasHints as any[]);

test("ghost hints: one lazy, batched, cached request per card; a click grows the card", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
  await gotoApp(page);
  // Sweeping across cards quickly asks for nothing (debounced).
  for (const id of ["c-when-not", "c-how", "c-money"]) {
    await card(page, id).hover();
    await page.waitForTimeout(150);
  }
  await page.mouse.move(700, 900);
  await page.waitForTimeout(800);
  expect(await hintAsks(page)).toHaveLength(0);
  // Resting on a card asks once, for all its directions, with the board outline.
  await card(page, "c-how").hover();
  const below = card(page, "c-how").locator(".ghost-hint.below");
  await expect(below).toHaveText("提示·子0");
  await expect(card(page, "c-how").locator(".ghost-hint.right")).toHaveText(
    "提示·并列0",
  );
  await expect(card(page, "c-how").locator(".ghost-hint.above")).toHaveCount(0);
  const [ask] = await hintAsks(page);
  expect(ask).toMatchObject({ mode: "hint", stickyId: "hint-c-how" });
  expect(ask.prompt).toContain("below");
  expect(ask.context.structure).toContain("◀ 当前卡片");
  // Cached on the card: leaving and coming back does not ask again.
  await page.mouse.move(700, 900);
  await card(page, "c-how").hover();
  await page.waitForTimeout(900);
  expect(await hintAsks(page)).toHaveLength(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("fake-atlas-disk")!)[0].nodes.find(
            (n: any) => n.id === "c-how",
          ).hints?.below,
      ),
    )
    .toBe("提示·子0");
  // Clicking the ghost creates that card under 怎么赔.
  await below.click();
  const grown = page
    .locator(".react-flow__node-concept")
    .filter({ hasText: "提示·子0" });
  await expect(grown).toHaveCount(1);
  await expect(grown).toHaveClass(/selected/);
  await expect(grown.locator(".no")).toHaveText("§3.1");
  // The root offers all three directions.
  await page.mouse.move(700, 900);
  await card(page, "topic-ci").hover();
  await expect(card(page, "topic-ci").locator(".ghost-hint")).toHaveCount(3);
  await card(page, "topic-ci").locator(".ghost-hint.above").click();
  await expect(page.locator(".react-flow__node-root")).toContainText(
    /提示·更大\d/,
  );
});

test("ghost hints stay silent without an AI provider", async ({ page }) => {
  await installFakeAtlas(page, false, "web", [insuranceBoard(true)]);
  await gotoApp(page);
  await card(page, "c-how").hover();
  await page.waitForTimeout(1000);
  expect(await hintAsks(page)).toHaveLength(0);
  await expect(page.locator(".ghost-hint")).toHaveCount(0);
  // The '+' handles still work as before.
  await expect(
    card(page, "c-how").getByRole("button", { name: "加子概念" }),
  ).toBeVisible();
});
