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

test("a new question starts the 摸底; skipping it drafts a plan and the first level lands on the canvas", async ({
  page,
}) => {
  await installFakeAtlas(page);
  await newQuestion(page, "彩虹是怎么形成的？");
  const drawer = page.locator(".drawer");
  // The bisection probe replaces the open-ended kickoff questions.
  const probe = drawer.getByRole("region", { name: "摸底" });
  await expect(probe).toContainText("摸底 · 找到你的起点");
  await expect(probe).toContainText("第 1 题 / 约 3 题");
  await expect(probe.locator(".rung.asking")).toContainText("L3");
  await probe.getByRole("button", { name: "跳过摸底" }).click();
  await expect(probe).toContainText("跳过也没关系，我会从最基础的开始排。");
  // The plan is drafted for a beginner; the learner edits it, then confirms.
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
  expect(plans[0].prompt).toContain("跳过了摸底");
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
  const asks = await page.evaluate(() => (window as any).__atlasAsks);
  expect(asks.map((a: any) => a.mode)).toEqual(["map"]);
  // The map request lays the confirmed skeleton, with the ladder levels, and carries the plan.
  expect(asks[0].prompt).toContain("[b1] 白光由哪些颜色组成？");
  expect(asks[0].prompt).not.toContain("副虹");
  expect(asks[0].prompt).toContain("理解深度阶梯");
  expect(asks[0].context.plan).toContain("学习目标：学完后，能解释彩虹");
  // New cards get the quiet enrich follow-up.
  await expect
    .poll(() => page.evaluate(() => (window as any).__atlasEnriches.length))
    .toBe(1);
  expect(asks[0].context.topic).toBe("彩虹是怎么形成的？");
  expect(asks[0].context.review.radius).toBe(4);
  expect(asks[0].context.review.nodes).toHaveLength(1);
  expect(asks[0].context.review.nodes[0].body).toBeTruthy();
  await expect(
    page.locator(".react-flow").getByRole("button", { name: /AI 带我开始/ }),
  ).toHaveCount(0);
  await expect(
    drawer.getByRole("button", { name: "铺成第一层", exact: true }),
  ).toHaveCount(0);
});

test("closing the drawer mid-摸底 leaves it as the next step, and 开始 resumes the same question", async ({
  page,
}) => {
  await installFakeAtlas(page);
  await newQuestion(page, "彩虹是怎么形成的？");
  await expect(page.locator(".drawer .rung.asking")).toContainText("L3");
  await page.locator(".drawer").getByLabel("关闭").click();
  const bar = page.getByRole("region", { name: "下一步" });
  await expect(bar).toContainText("继续摸底，找到你的起点");
  await bar.getByRole("button", { name: /开始/ }).click();
  await expect(page.locator(".drawer .rung.asking")).toContainText("L3");
  const gates = await page.evaluate(() => (window as any).__atlasGates);
  expect(gates.filter((g: any) => g.mode === "probe")).toHaveLength(1);
  expect(await page.evaluate(() => (window as any).__atlasAsks.length)).toBe(0);
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
