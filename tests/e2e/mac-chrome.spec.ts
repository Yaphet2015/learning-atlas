import { test, expect } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { gotoApp } from "./ready";

// Chromium on Linux cannot draw real traffic lights; this checks the inset logic and drag strip.
test("macOS insets the map switcher past the traffic lights and drops it in fullscreen", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "darwin");
  await gotoApp(page);
  const switcher = page.locator(".switcher");
  await expect(switcher).toBeVisible();
  expect((await switcher.boundingBox())!.x).toBe(80);
  const strip = page.locator(".titlebar-drag");
  await expect(strip).toHaveCount(1);
  expect(
    await strip.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("-webkit-app-region"),
    ),
  ).toBe("drag");
  expect(
    await switcher.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("-webkit-app-region"),
    ),
  ).toBe("no-drag");
  await page.evaluate(() => (window as any).__setFullscreen(true));
  await expect(strip).toHaveCount(0);
  await expect.poll(async () => (await switcher.boundingBox())!.x).toBe(12);
  await page.evaluate(() => (window as any).__setFullscreen(false));
  await expect.poll(async () => (await switcher.boundingBox())!.x).toBe(80);
});

test("web preview and other platforms keep the original top-left layout", async ({
  page,
}) => {
  await gotoApp(page);
  await expect(page.locator(".switcher")).toBeVisible();
  expect((await page.locator(".switcher").boundingBox())!.x).toBe(12);
  await expect(page.locator(".titlebar-drag")).toHaveCount(0);
  await installFakeAtlas(page, true, "win32");
  await gotoApp(page);
  await expect(page.locator(".switcher")).toBeVisible();
  expect((await page.locator(".switcher").boundingBox())!.x).toBe(12);
  await expect(page.locator(".titlebar-drag")).toHaveCount(0);
});

test("floating chrome sits 12px from the window edges", async ({ page }) => {
  await gotoApp(page);
  const vw = page.viewportSize()!.width,
    vh = page.viewportSize()!.height;
  const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
  const sw = await box(".switcher");
  expect([sw.x, sw.y]).toEqual([12, 12]);
  const pr = await box(".progress");
  expect([Math.round(vw - pr.x - pr.width), pr.y]).toEqual([12, 12]);
  const dock = await box(".dock");
  expect(Math.round(vh - dock.y - dock.height)).toBe(12);
  const map = await box(".map-unit");
  expect([
    Math.round(vw - map.x - map.width),
    Math.round(vh - map.y - map.height),
  ]).toEqual([12, 12]);
  await page.locator(".react-flow__node-root").click();
  await page.keyboard.press("/");
  const drawer = await box(".drawer");
  expect([
    Math.round(vw - drawer.x - drawer.width),
    drawer.y,
    Math.round(vh - drawer.y - drawer.height),
  ]).toEqual([12, 12, 12]);
});
