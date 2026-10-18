import { test, expect } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { gotoApp } from "./ready";

// Chromium on Linux cannot draw real traffic lights; this checks the inset logic and drag strip.
test("macOS keeps the sidebar below the traffic lights and drops the inset in fullscreen", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "darwin");
  await gotoApp(page);
  const sidebar = page.getByRole("complementary", {
    name: "学习空间",
    exact: true,
  });
  await expect(sidebar).toBeVisible();
  expect((await sidebar.boundingBox())!.y).toBe(56);
  await sidebar.getByRole("button", { name: "收起左侧边栏" }).click();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(56);
  expect((await sidebar.boundingBox())!.y).toBe(56);
  const strip = page.locator(".titlebar-drag");
  await expect(strip).toHaveCount(1);
  expect(
    await strip.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("-webkit-app-region"),
    ),
  ).toBe("drag");
  expect(
    await sidebar.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("-webkit-app-region"),
    ),
  ).toBe("no-drag");
  await page.evaluate(() => (window as any).__setFullscreen(true));
  await expect(strip).toHaveCount(0);
  await expect.poll(async () => (await sidebar.boundingBox())!.y).toBe(12);
  await page.evaluate(() => (window as any).__setFullscreen(false));
  await expect.poll(async () => (await sidebar.boundingBox())!.y).toBe(56);
});

test("web preview and other platforms keep the sidebar at the window gutter", async ({
  page,
}) => {
  await gotoApp(page);
  const sidebar = page.locator(".workspace-sidebar");
  await expect(sidebar).toBeVisible();
  expect((await sidebar.boundingBox())!.y).toBe(12);
  await expect(page.locator(".titlebar-drag")).toHaveCount(0);
  await installFakeAtlas(page, true, "win32");
  await gotoApp(page);
  await expect(sidebar).toBeVisible();
  expect((await sidebar.boundingBox())!.y).toBe(12);
  await expect(page.locator(".titlebar-drag")).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const)
  test(`floating chrome sits 12px from the window edges · ${scheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await gotoApp(page);
    // The spacing token must not shadow a colour token (it once overrode --edge).
    const dark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    if (dark !== (scheme === "dark")) await page.keyboard.press("d");
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return [
        cs.getPropertyValue("--gutter").trim(),
        cs.getPropertyValue("--edge").trim(),
      ];
    });
    expect(tokens[0]).toBe("12px");
    expect(tokens[1]).toMatch(/^rgba\(/);
    const vw = page.viewportSize()!.width,
      vh = page.viewportSize()!.height;
    const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
    const sw = await box(".workspace-sidebar");
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
