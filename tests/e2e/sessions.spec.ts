import { test, expect, type Page } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { insuranceBoard } from "./fixtures";
import { gotoApp, reloadApp } from "./ready";

const card = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);

async function ask(page: Page, text: string, answers: number) {
  const drawer = page.locator(".drawer");
  await drawer.getByLabel("向 AI 提问").fill(text);
  await drawer.getByLabel("发送提问").click();
  await expect(drawer.locator(".msg.assistant")).toHaveCount(answers);
}

const list = (page: Page) => page.getByLabel("这张白板的对话");

/** The insurance board with its kickoff conversation dated well before the test runs. */
function seeded() {
  const board = insuranceBoard(true);
  for (const m of board.notes[0].messages)
    m.createdAt = "2026-01-05T09:00:00.000Z";
  return board;
}

test("the session list shows this board's conversations newest first and reopens one where it hangs", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", [seeded()]);
  await gotoApp(page);
  const drawer = page.locator(".drawer");
  await card(page, "c-how").click();
  await page.keyboard.press("/");
  await ask(page, "赔付次数怎么算？", 1);
  // A second conversation on the same card.
  await drawer.getByRole("button", { name: "对话列表" }).click();
  await list(page).getByRole("button", { name: "新对话" }).click();
  await expect(drawer.locator(".msg")).toHaveCount(0);
  await ask(page, "间隔期是多久？", 1);
  await drawer.getByRole("button", { name: "对话列表" }).click();
  const entries = list(page).locator(".session");
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toContainText("间隔期是多久？");
  await expect(entries.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(entries.nth(0)).toContainText("怎么赔");
  await expect(entries.nth(0)).toContainText("2 条消息");
  await expect(entries.nth(1)).toContainText("赔付次数怎么算？");
  await expect(entries.nth(2)).toContainText("带我起步");
  await expect(entries.nth(2)).toContainText("起点问题");
  await expect(entries.nth(2).locator("time")).toHaveText(/\S/);

  // Survives a reload (boards live on the fake "disk", like the Electron files).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("fake-atlas-disk")!)[0].notes.length,
      ),
    )
    .toBe(3);
  await reloadApp(page);
  await card(page, "c-what").click();
  await page.keyboard.press("/");
  await drawer.getByRole("button", { name: "对话列表" }).click();
  await expect(entries).toHaveCount(4);
  await expect(entries.nth(0)).toContainText("保什么");
  await expect(entries.nth(1)).toContainText("间隔期是多久？");
  // Reopening the older one shows its thread and locates its card.
  await entries.nth(2).click();
  await expect(list(page)).toHaveCount(0);
  await expect(drawer.locator(".msg.user")).toHaveText("赔付次数怎么算？");
  await expect(card(page, "c-how")).toHaveClass(/selected/);
  // "/" on a card with several conversations opens the latest one.
  await drawer.getByRole("button", { name: "关闭" }).click();
  await card(page, "c-how").click();
  await page.keyboard.press("/");
  await expect(drawer.locator(".msg.user")).toHaveText("间隔期是多久？");
});

test("sessions persist across reloads in the web preview", async ({ page }) => {
  await page.addInitScript(
    (value) => {
      // Seed once; later reloads read what the app saved.
      if (!localStorage.getItem("studyboard-preview-boards-v1"))
        localStorage.setItem("studyboard-preview-boards-v1", value);
    },
    JSON.stringify([seeded()]),
  );
  await gotoApp(page);
  const drawer = page.locator(".drawer");
  await card(page, "c-money").click();
  await page.keyboard.press("/");
  await drawer.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "在这张卡上新开对话" }).click();
  await drawer.getByLabel("批注标题").fill("犹豫期的问题");
  await drawer.getByRole("button", { name: "对话列表" }).click();
  await expect(list(page).locator(".session")).toHaveCount(3);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("studyboard-preview-boards-v1")!)[0]
            .notes.length,
      ),
    )
    .toBe(3);
  await reloadApp(page);
  await card(page, "c-money").click();
  await page.keyboard.press("/");
  await expect(drawer.getByLabel("批注标题")).toHaveValue("犹豫期的问题");
  await drawer.getByRole("button", { name: "对话列表" }).click();
  const entries = list(page).locator(".session");
  await expect(entries).toHaveCount(3);
  await expect(entries.filter({ hasText: "犹豫期的问题" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(entries.filter({ hasText: "钱和手续" })).toHaveCount(2);
});

test("the drawer's session strip switches conversations; ⌘K lists only boards", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", [seeded()]);
  await gotoApp(page);
  const drawer = page.locator(".drawer");
  await card(page, "c-how").click();
  await page.keyboard.press("/");
  await ask(page, "赔付次数怎么算？", 1);
  const strip = drawer.getByRole("group", { name: "对话标签" });
  const tabs = strip.getByRole("button");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(tabs.nth(0)).toContainText("赔付次数怎么算？");
  // + starts a fresh conversation on the same card; it becomes the first tab.
  await drawer.getByRole("button", { name: "新对话" }).click();
  await expect(drawer.locator(".msg")).toHaveCount(0);
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveAttribute("aria-current", "true");
  // Switching tabs reopens that thread.
  await tabs.nth(2).click();
  await expect(drawer.locator(".msg.user").first()).toContainText("带我");
  await expect(tabs.nth(2)).toHaveAttribute("aria-current", "true");
  // Closed, with nothing selected: N returns to the latest conversation.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await page
    .locator(".react-flow__pane")
    .click({ position: { x: 40, y: 600 } });
  await page.keyboard.press("n");
  await expect(drawer).toBeVisible();
  // The board switcher (⌘K) is for boards only; conversations live in the drawer.
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "切换地图" });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("button", { name: /^批注/ })).toHaveCount(0);
});
