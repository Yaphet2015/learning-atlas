import { test, expect, type Page } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { gotoApp } from "./ready";

async function newQuestion(page: Page, topic: string) {
  await gotoApp(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("button", { name: /新的问题/ }).click();
  await page.getByLabel("新白板问题").fill(topic);
  await page.getByRole("button", { name: "开始探索", exact: true }).click();
}

test("a new question starts the guided kickoff and accepts the first level onto the canvas", async ({
  page,
}) => {
  await installFakeAtlas(page);
  await newQuestion(page, "彩虹是怎么形成的？");
  const drawer = page.locator(".drawer");
  // The AI asks what the learner already knows; the long instructions stay out of the thread.
  await expect(drawer.locator(".msg.user")).toHaveText(
    "我想从这里开始学，带我起步吧。",
  );
  await expect(drawer.locator(".msg.assistant")).toContainText("你听说过光的");
  await drawer.getByLabel("向 AI 提问").fill("知道折射，但不懂为什么是弯的");
  await drawer.getByLabel("发送提问").click();
  await expect(drawer.locator(".msg.assistant")).toHaveCount(2);
  // The primary action drafts a learning plan first; the learner edits it, then confirms.
  await drawer.getByRole("button", { name: "拟定学习计划", exact: true }).click();
  const plan = drawer.locator(".plan-editor");
  await expect(plan).toContainText("学完后，能解释彩虹");
  await expect(plan.locator(".plan-block")).toHaveCount(5);
  await plan.getByRole("button", { name: "删除「副虹从哪来？」" }).click();
  await expect(plan.locator(".plan-block")).toHaveCount(4);
  await plan.getByRole("button", { name: "阳光里有哪些颜色？", exact: true }).click();
  await plan.getByLabel("块标题").fill("白光由哪些颜色组成？");
  await plan.getByLabel("块标题").press("Enter");
  await expect(plan).toContainText("白光由哪些颜色组成？");
  const plans = await page.evaluate(() => (window as any).__atlasPlans);
  expect(plans).toHaveLength(1);
  expect(plans[0].prompt).toContain("知道折射，但不懂为什么是弯的");
  await plan.getByRole("button", { name: "确认计划，铺成第一层" }).click();
  await expect(page.locator(".react-flow__node-concept")).toHaveCount(3);
  // Side by side on the first level, not a vertical chain.
  await expect
    .poll(async () => {
      const ys = await page
        .locator(".react-flow__node-concept")
        .evaluateAll((els) =>
          els.map((e) => Math.round(e.getBoundingClientRect().y)),
        );
      return new Set(ys).size;
    })
    .toBe(1);
  await expect(page.locator(".react-flow__node-concept").first()).toContainText(
    "阳光里有哪些颜色？",
  );
  // The map request carries what the learner said; the kickoff entry is gone once the level exists.
  const asks = await page.evaluate(() => (window as any).__atlasAsks);
  expect(asks.map((a: any) => a.mode)).toEqual(["answer", "answer", "map"]);
  // The map request lays the confirmed skeleton, and later requests carry the plan.
  expect(asks[2].prompt).toContain("[b1] 白光由哪些颜色组成？");
  expect(asks[2].prompt).not.toContain("副虹");
  expect(asks[2].context.plan).toContain("学习目标：学完后，能解释彩虹");
  // New cards get one quiet critique pass, then the enrich follow-up for the survivors.
  await expect
    .poll(() => page.evaluate(() => (window as any).__atlasCritiques.length))
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => (window as any).__atlasEnriches.length))
    .toBe(1);
  // Conversation requests carry the outline; card bodies are read through tools.
  expect(asks[1].canvas).toBe(true);
  expect(asks[1].context.structure).toContain("白板结构");
  expect(asks[1].context.review).toBeUndefined();
  expect(asks[1].context.review).toBeUndefined();
  expect(asks[2].context.topic).toBe("彩虹是怎么形成的？");
  expect(asks[2].context.review.radius).toBe(4);
  expect(asks[2].context.review.nodes).toHaveLength(1);
  expect(asks[2].context.review.nodes[0].body).toBeTruthy();
  await expect(
    page.locator(".react-flow").getByRole("button", { name: /AI 带我开始/ }),
  ).toHaveCount(0);
  await expect(
    drawer.getByRole("button", { name: "铺成第一层", exact: true }),
  ).toHaveCount(0);
});

test("the lone root offers 「让 AI 带我开始」 and resumes the same conversation", async ({
  page,
}) => {
  await installFakeAtlas(page);
  await newQuestion(page, "彩虹是怎么形成的？");
  await expect(page.locator(".drawer .msg.assistant")).toHaveCount(1);
  await page.locator(".drawer").getByLabel("关闭").click();
  const kickoff = page.getByRole("button", { name: "继续：AI 带我开始" });
  await expect(kickoff).toBeVisible();
  await kickoff.click();
  await expect(page.locator(".drawer .msg.assistant")).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__atlasAsks.length)).toBe(1);
});

test("without an AI provider the kickoff leads to settings", async ({
  page,
}) => {
  await newQuestion(page, "How does a rainbow form?");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("关闭设置").click();
  await page.getByRole("button", { name: "让 AI 带我开始" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#settings-title")).toHaveText("设置");
  await expect(page.getByRole("heading", { name: "AI 服务" })).toBeVisible();
});

test("「测试连接」 shows success with model and latency, then a readable failure", async ({
  page,
}) => {
  await installFakeAtlas(page, false);
  await gotoApp(page);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/API 密钥/).fill("good");
  await dialog.getByRole("button", { name: "测试连接" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "连接成功 · 已连到 gpt-4o-mini · 用时 0.8 秒",
  );
  await dialog.getByLabel(/API 密钥/).fill("bad");
  await expect(dialog.getByRole("status")).toHaveText("");
  await dialog.getByRole("button", { name: "测试连接" }).click();
  await expect(dialog.getByRole("status")).toContainText("鉴权失败");
});
