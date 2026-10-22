import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { installFakeAtlas } from "./fake-atlas";
import { routedBoard } from "./fixtures";
import { gotoApp } from "./ready";

/** Sidebar redesign + canvas ⋯ menu (studyboard-sidebar/SPEC.md). Shoots when SHOTS_DIR is set. */
const dir = process.env.SHOTS_DIR;
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString();

function boards() {
  const current: any = routedBoard();
  current.updatedAt = day(0);
  const other: any = structuredClone(current);
  Object.assign(other, { id: "b-rates", title: "为什么利率上升债券价格会下跌", topic: "为什么利率上升债券价格会下跌", updatedAt: day(1) });
  other.nodes.forEach((n: any, i: number) => n.parentId && (n.status = i % 2 ? "explained" : "unseen"));
  const done: any = structuredClone(current);
  Object.assign(done, { id: "b-done", title: "复利和单利的区别", topic: "复利和单利的区别", updatedAt: day(9) });
  done.nodes.forEach((n: any) => n.parentId && (n.status = "explained"));
  done.wrap = { text: "讲通了", lit: [], done: true };
  // An old save without stored progress: the list backfills it.
  delete current.progress;
  return [current, other, done];
}

async function open(page: Page, scheme: "light" | "dark", paused = false) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: scheme });
  const list = boards();
  if (paused)
    await page.addInitScript((boardId) => {
      (window as any).__atlasSeedRuns = [
        { id: "run-1", boardId, stickyId: "canvas-run-1", origin: "organize", status: "paused", phase: "editing", revision: 1, reviewed: 3, total: 9, changed: true, summary: "整理到一半", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ];
    }, list[0].id);
  await installFakeAtlas(page, true, "web", list);
  await gotoApp(page);
  const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  if (dark !== (scheme === "dark")) await page.keyboard.press("d");
}

test("sidebar groups canvases with progress; the current row has a tint and bar, no dot", async ({ page }) => {
  await open(page, "light");
  const side = page.getByRole("complementary", { name: "学习空间" });
  await expect(side.getByRole("region", { name: "进行中" })).toContainText("进行中 2");
  await expect(side.getByRole("region", { name: "已完成" })).toContainText("全部讲通");
  const current = side.locator('.workspace-board[aria-current="page"]');
  await expect(current.locator(".workspace-segs i")).not.toHaveCount(0);
  await expect(current.locator(".workspace-count")).toHaveText(/^\d+\/\d+$/);
  await expect(current.locator(".workspace-date")).toHaveText("今天");
  await expect(side.locator(".workspace-current")).toHaveCount(0);
  // Footer: only 设置.
  await expect(side.locator(".workspace-settings button")).toHaveCount(1);
  await expect(side.locator(".workspace-settings")).toHaveText("设置");
});

test("canvas ⋯ menu holds 整理记录与恢复, 导出 and 归档; a paused run shows one pill", async ({ page }) => {
  await open(page, "light", true);
  const pill = page.getByRole("button", { name: /整理已暂停/ });
  await expect(pill).toBeVisible();
  await page.getByRole("button", { name: "画布操作" }).click();
  // 重新摸底 is always the first item; this AI board has no probe yet, so it starts one.
  await expect(page.locator(".canvas-menu [role=menuitem]").first()).toHaveText("重新摸底");
  await expect(page.getByRole("menuitem", { name: "重新摸底" })).toBeEnabled();
  await expect(page.getByRole("menuitem", { name: /整理记录与恢复/ })).toContainText("1 次暂停");
  await expect(page.getByRole("menuitem", { name: "导出画布…" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "归档画布" })).toBeVisible();
  await page.keyboard.press("Escape");
  await pill.click();
  await expect(page.getByRole("dialog", { name: "整理记录与恢复" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  test(`sidebar shots · ${scheme}`, async ({ page }) => {
    test.skip(!dir, "set SHOTS_DIR to shoot the design screenshots");
    mkdirSync(dir!, { recursive: true });
    await open(page, scheme, true);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/sidebar-${scheme}.png` });
    await page.getByRole("button", { name: "画布操作" }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${dir}/canvas-menu-${scheme}.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "收起左侧边栏" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/collapsed-rail-${scheme}.png` });
    await page.getByRole("button", { name: "展开左侧边栏" }).click();
  });

test("重新摸底 stays listed but disabled, with the reason, when it can't run", async ({ page }) => {
  await installFakeAtlas(page, false, "web", [boards()[0]]);
  await gotoApp(page);
  await page.getByRole("button", { name: "画布操作" }).click();
  const item = page.getByRole("menuitem", { name: "重新摸底" });
  await expect(item).toBeDisabled();
  await expect(item).toHaveAttribute("title", "先在设置里连接 AI");
});
