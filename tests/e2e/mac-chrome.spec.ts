import { test, expect } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";

// Chromium on Linux cannot draw real traffic lights; this checks the inset logic and drag strip.
test("macOS insets the map switcher past the traffic lights and drops it in fullscreen", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "darwin");
  await page.goto("/");
  const switcher = page.locator(".switcher");
  await expect(switcher).toBeVisible();
  expect((await switcher.boundingBox())!.x).toBe(92);
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
  await expect.poll(async () => (await switcher.boundingBox())!.x).toBe(20);
  await page.evaluate(() => (window as any).__setFullscreen(false));
  await expect.poll(async () => (await switcher.boundingBox())!.x).toBe(92);
});

test("web preview and other platforms keep the original top-left layout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".switcher")).toBeVisible();
  expect((await page.locator(".switcher").boundingBox())!.x).toBe(20);
  await expect(page.locator(".titlebar-drag")).toHaveCount(0);
  await installFakeAtlas(page, true, "win32");
  await page.goto("/");
  await expect(page.locator(".switcher")).toBeVisible();
  expect((await page.locator(".switcher").boundingBox())!.x).toBe(20);
  await expect(page.locator(".titlebar-drag")).toHaveCount(0);
});
