import { test, expect, type Page } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { insuranceBoard } from "./fixtures";
import { gotoApp } from "./ready";

const card = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);
const hintAsks = (page: Page) =>
  page.evaluate(() => (window as any).__atlasHints as any[]);

for (const [id, side] of [
  ["c-how", "below"],
  ["c-how", "right"],
  ["topic-ci", "above"],
] as const) {
  test(`ghost hint ${side}: cross the gaps from card to plus to hint and click`, async ({
    page,
  }) => {
    await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
    await gotoApp(page);
    const owner = card(page, id);
    const hint = owner.locator(`.ghost-hint.${side}`);
    const plus = owner.locator(`.plus.${side}`);
    // A neighbour with cached hints must not cover the controls during transit.
    if (side === "right") {
      await card(page, "c-money").locator("article").hover();
      await expect(
        card(page, "c-money").locator(".ghost-hint.right"),
      ).toHaveCSS("opacity", "1");
    }
    await owner.locator("article").hover();
    await expect(hint).toHaveCSS("opacity", "1");
    const title = (await hint.innerText()).trim();
    const body = (await owner.locator("article").boundingBox())!;
    const handle = (await plus.boundingBox())!;
    const center = {
      x: handle.x + handle.width / 2,
      y: handle.y + handle.height / 2,
    };
    const gap =
      side === "right"
        ? { x: (body.x + body.width + handle.x) / 2, y: center.y }
        : {
            x: center.x,
            y:
              side === "above"
                ? (handle.y + handle.height + body.y) / 2
                : (body.y + body.height + handle.y) / 2,
          };
    // Stop inside the empty space: a direct locator.click() skips this failure.
    await page.mouse.move(gap.x, gap.y, { steps: 4 });
    await page.waitForTimeout(60);
    await expect(hint).toHaveCSS("pointer-events", "auto");
    await expect(plus).toHaveCSS("opacity", "1");
    await expect(owner).toHaveCSS("z-index", "1000");
    await page.mouse.move(center.x, center.y, { steps: 3 });
    // Hovering the lower '+' can change the insertion-preview layout.
    const handleNow = (await plus.boundingBox())!;
    const target = (await hint.boundingBox())!;
    const between =
      side === "right"
        ? {
            x: target.x + target.width / 2,
            y: (handleNow.y + handleNow.height + target.y) / 2,
          }
        : {
            x: (handleNow.x + handleNow.width + target.x) / 2,
            y: target.y + target.height / 2,
          };
    await page.mouse.move(between.x, between.y, { steps: 3 });
    await page.waitForTimeout(60);
    await expect(hint).toHaveCSS("pointer-events", "auto");
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 3 },
    );
    // Entering the hint must cancel dismissal, even after the original 300 ms.
    await page.waitForTimeout(400);
    await expect(hint).toHaveCSS("opacity", "1");
    await page.mouse.click(
      target.x + target.width / 2,
      target.y + target.height / 2,
    );
    const grown = page.locator(".react-flow__node").filter({
      has: page.getByRole("heading", { name: title, exact: true }),
    });
    await expect(grown).toHaveCount(1);
    await expect(grown).toHaveClass(/selected/);
    await expect
      .poll(() =>
        page.evaluate(
          ({ title, id, side }) => {
            const nodes = JSON.parse(
              localStorage.getItem("fake-atlas-disk")!,
            )[0].nodes;
            const added = nodes.filter((n: any) => n.title === title);
            const source = nodes.find((n: any) => n.id === id);
            return (
              added.length === 1 &&
              (side === "above"
                ? added[0].parentId === null && source.parentId === added[0].id
                : added[0].parentId ===
                  (side === "below" ? id : source.parentId))
            );
          },
          { title, id, side },
        ),
      )
      .toBe(true);
  });
}

test("ghost hints dismiss after leaving, stay on return, and remain usable with keyboard focus", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
  await gotoApp(page);
  const owner = card(page, "c-how");
  const hint = owner.locator(".ghost-hint.below");
  await owner.locator("article").hover();
  await expect(hint).toHaveCSS("opacity", "1");
  await page.mouse.move(700, 900);
  await page.waitForTimeout(80);
  await expect(hint).toHaveCSS("pointer-events", "auto");
  await owner.locator("article").hover();
  await page.waitForTimeout(400);
  await expect(hint).toHaveCSS("opacity", "1");
  await page.mouse.move(700, 900);
  await expect(hint).toHaveCSS("pointer-events", "none");
  await expect(hint).toHaveCSS("opacity", "0");
  await hint.focus();
  await expect(hint).toHaveCSS("opacity", "1");
  await expect(hint).toHaveCSS("pointer-events", "auto");
  await page.waitForTimeout(400);
  await expect(hint).toHaveCSS("opacity", "1");
  const title = (await hint.innerText()).trim();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(1);
});

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
  expect(ask.context.topic).toBe(insuranceBoard(true).topic);
  expect(ask.context.review).toMatchObject({ radius: 4, anchors: ["c-how"] });
  expect(ask.context.review.nodes).toHaveLength(
    insuranceBoard(true).nodes.length,
  );
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
  // Let the selected new card's hint request finish before hovering another card.
  await expect(grown.locator(".ghost-hint")).toHaveCount(2);
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
    card(page, "c-how").getByRole("button", { name: "加子概念", exact: true }),
  ).toBeVisible();
});
