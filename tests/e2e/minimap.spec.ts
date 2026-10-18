import { test, expect } from "@playwright/test";
import { gotoApp } from "./ready";

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
  await page.mouse.move(120, 880);
  await page.keyboard.down("Space");
  await expect(page.locator("main.space-pan")).toHaveCount(1);
  await page.mouse.down();
  await page.mouse.move(200, 820, { steps: 6 });
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
