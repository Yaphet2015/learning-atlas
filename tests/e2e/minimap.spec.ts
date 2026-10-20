import { test, expect } from "@playwright/test";
import { gotoApp } from "./ready";
import { insuranceBoard } from "./fixtures";
import { installFakeAtlas } from "./fake-atlas";

test("the minimap shows only while panning or with the hand tool; zoom stays", async ({
  page,
}) => {
  await gotoApp(page);
  const map = page.locator(".minimap-card");
  const zoom = page.locator(".map-unit .zoom");
  await expect(map).toHaveAttribute("data-visible", "false");
  await expect(map).toBeHidden();
  await expect(zoom).toBeVisible();
  // Space-drag pans: visible while held, fades after release.
  const canvas = (await page.locator(".react-flow").boundingBox())!;
  await page.mouse.move(canvas.x + 40, 880);
  await page.keyboard.down("Space");
  await expect(page.locator("main.space-pan")).toHaveCount(1);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 120, 820, { steps: 6 });
  await expect(map).toHaveAttribute("data-visible", "true");
  await expect(map).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(map).toHaveAttribute("data-visible", "false");
  await expect(map).toBeHidden();
  // Two-finger scroll pans too.
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 120);
  await expect(map).toHaveAttribute("data-visible", "true");
  await expect(map).toHaveAttribute("data-visible", "false");
  // The hand tool keeps it up.
  await page.keyboard.press("h");
  await expect(map).toBeVisible();
  await page.keyboard.press("v");
  await expect(map).toBeHidden();
  await expect(zoom).toBeVisible();
});

test("reduced motion: the minimap appears and hides without a fade", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoApp(page);
  const duration = await page
    .locator(".minimap-card")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(duration.split(",").every((d) => parseFloat(d) === 0)).toBe(true);
});

test("the minimap shows canvas relationships and follows dragged nodes", async ({
  page,
}) => {
  const board = insuranceBoard(true);
  await installFakeAtlas(page, true, "web", [
    {
      ...board,
      relations: [
        {
          id: "cross-test",
          source: "c-what",
          target: "c-how",
          label: "关联",
          kind: "cross",
        },
      ],
    },
  ]);
  await gotoApp(page);
  await page.keyboard.press("h");
  const map = page.locator(".atlas-minimap");
  await expect(map).toBeVisible();
  for (const kind of ["tree", "seq", "cross"]) {
    const main = page.locator(`.react-flow__edges .${kind}-edge`);
    const mini = map.locator(`.${kind}-edge`);
    await expect(main.first()).toBeAttached();
    await expect(mini).toHaveCount(await main.count());
  }
  await expect(map.locator(".cross-label")).toBeHidden();
  const mainPath = page
    .locator('.react-flow__edge[data-id="tree-c-what"] .tree-edge > path')
    .first();
  const miniPath = map
    .locator('.mini-edges[data-node-id="c-what"] .tree-edge > path')
    .first();
  await expect
    .poll(() => miniPath.getAttribute("d"))
    .toBe(await mainPath.getAttribute("d"));
  await expect(miniPath).toHaveCSS("vector-effect", "non-scaling-stroke");
  const before = await miniPath.getAttribute("d");
  await page.keyboard.press("v");
  const card = (await page
    .locator('.react-flow__node[data-id="c-what"]')
    .boundingBox())!;
  await page.mouse.move(card.x + 40, card.y + 25);
  await page.mouse.down();
  try {
    await page.mouse.move(card.x + 110, card.y + 65, { steps: 6 });
    await expect.poll(() => miniPath.getAttribute("d")).not.toBe(before);
    await expect
      .poll(
        async () =>
          (await miniPath.getAttribute("d")) ===
          (await mainPath.getAttribute("d")),
      )
      .toBe(true);
  } finally {
    await page.mouse.up();
  }
});
