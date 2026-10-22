import { test, expect, type Page } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { routedBoard } from "./fixtures";
import { gotoApp } from "./ready";

const card = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const gates = (page: Page) => page.evaluate(() => (window as any).__atlasGates as any[]);
/** The routed board without the fixture's own child under 第 2 站, so a stuck stop has none yet. */
const bare = () => {
  const b = routedBoard();
  b.nodes = b.nodes.filter((n: any) => n.parentId !== "c-when-not");
  return b;
};
const disk = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("fake-atlas-disk")!)[0]);

async function newQuestion(page: Page, topic: string) {
  await gotoApp(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("button", { name: /新的问题/ }).click();
  await page.getByLabel("新白板问题").fill(topic);
  await page.getByRole("button", { name: "开始探索", exact: true }).click();
}

test("二分摸底: L3 ✗ → L1 ✓ → L2 ✓ converges on L3; stations below it get the light seal", async ({ page }) => {
  await installFakeAtlas(page);
  await page.addInitScript(() => {
    (window as any).__atlasMarkAnswers = [
      JSON.stringify({ verdict: "wrong", missing: "定义决定能不能赔" }),
      JSON.stringify({ verdict: "correct", missing: "" }),
    ];
  });
  await newQuestion(page, "重疾险有哪些重要条款？");
  const probe = page.locator(".drawer").getByRole("region", { name: "摸底" });
  // From the middle: L3 first.
  await expect(probe.locator(".rung")).toHaveCount(6);
  await expect(probe.locator(".rung.asking")).toContainText("L3");
  await expect(probe).toContainText("一句话解释");
  await probe.getByLabel("我的回答").fill("确诊了就能赔");
  await probe.getByRole("button", { name: /确定/ }).click();
  // Wrong → shallower: L1.
  await expect(probe.locator(".rung.asking")).toContainText("L1");
  await expect(probe).toContainText("第 2 题 / 约 3 题");
  await expect(probe.locator(".rung.wrong")).toContainText("L3");
  await probe.getByLabel("我的回答").fill("给付型是确诊就给一笔钱，报销型按花费报");
  await probe.getByRole("button", { name: /确定/ }).click();
  // Right → deeper: L2, a scenario question with 不知道 at the end.
  await expect(probe.locator(".rung.asking")).toContainText("L2");
  await expect(probe).toContainText("情境题");
  await expect(probe.getByRole("radio")).toHaveCount(4);
  await expect(probe.getByRole("radio").last()).toHaveText("不知道");
  await probe.getByRole("radio", { name: /等待期/ }).click();
  await probe.getByRole("button", { name: /确定/ }).click();
  // Converged: frontier L3; L0 inferred; L4/L5 not asked.
  await expect(probe).toContainText("3 题 · 已收敛");
  await expect(probe.locator(".rung.frontier")).toContainText("L3");
  await expect(probe.locator(".rung.frontier")).toContainText("← 前沿");
  await expect(probe.locator(".rung.inferred")).toContainText("L0");
  await expect(probe.locator(".rung.unasked")).toHaveCount(2);
  await expect(probe.locator(".rung.unasked").first()).toContainText("先不问");
  await expect(probe).toContainText("你已经懂「合同结构」了。所以我们从「条款细读」开始。");
  // Grading: one short call each for the two free-text answers; the right option without a reason is local.
  const marks = (await gates(page)).filter((r) => r.mode === "mark");
  expect(marks).toHaveLength(2);
  expect(marks[0].prompt).toContain("要点3");
  expect(marks[0].prompt.length).toBeLessThan(600);
  // The plan is written for this learner, and the map is asked for ladder levels.
  const plan = page.locator(".drawer .plan-editor");
  await expect(plan).toContainText("学完后");
  const plans = await page.evaluate(() => (window as any).__atlasPlans);
  expect(plans[0].prompt).toContain("二分摸底结果：学习者已经懂到 L2「合同结构」，路线从 L3「条款细读」开始");
  await plan.getByRole("button", { name: "确认计划，铺成第一层" }).click();
  await expect(page.locator(".react-flow__node-concept")).toHaveCount(3);
  const first = page.locator(".react-flow__node-concept").first();
  await expect(first.locator(".seal.light")).toHaveCount(1);
  await page.locator(".drawer").getByLabel("关闭").click();
  const bar = page.getByRole("region", { name: "下一步" });
  await expect(bar).toContainText("下一步 · 第 2 站");
  // 重新摸底 lives in the root card's ⋯ menu, not the drawer.
  await page.locator(".react-flow__node-root").click();
  await page.locator(".select-toolbar").getByRole("button", { name: "更多操作" }).click();
  await expect(page.getByRole("menuitem", { name: "重新摸底" })).toBeVisible();
  await page.keyboard.press("Escape");
  // 我想从头学: the light seals go, the route starts at 第 1 站.
  await page.locator(".react-flow__node-root").click();
  await page.keyboard.press("n");
  const drawer = page.locator(".drawer");
  await expect(drawer.getByRole("region", { name: "摸底" })).toContainText("共 3 站");
  await drawer.getByRole("button", { name: "我想从头学" }).click();
  await expect(page.locator(".seal.light")).toHaveCount(0);
  await drawer.getByLabel("关闭").click();
  await expect(bar).toContainText("下一步 · 第 1 站");
});

test("a light-sealed stop can be rechecked; failing it removes the seal and queues it next", async ({ page }) => {
  const b = routedBoard();
  const what = b.nodes.find((n: any) => n.id === "c-what");
  Object.assign(what, {
    seal: "probe",
    check: { q: "医疗费全报销了，重疾险还赔吗？", options: ["不赔", "照样赔", "只赔一半"] },
    meta: { check: { keyPoints: ["给付型与报销无关"], answer: 1 } },
  });
  await installFakeAtlas(page, true, "web", [b]);
  await gotoApp(page);
  await expect(card(page, "c-what").locator(".seal.light")).toHaveCount(1);
  await card(page, "c-what").click();
  await page.keyboard.press("n");
  const stop = page.getByRole("region", { name: "这一站" });
  await expect(stop).toContainText("你已经会了 · 可跳过");
  await stop.getByRole("button", { name: "复查一下" }).click();
  await stop.getByRole("radio", { name: /不赔/ }).click();
  await stop.getByRole("button", { name: /提交/ }).click();
  await expect(page.getByText(/去掉了浅印/)).toBeVisible();
  await expect
    .poll(async () => {
      const d = await disk(page);
      return [d.nodes.find((n: any) => n.id === "c-what").seal ?? "none", d.route.join(",")];
    })
    .toEqual(["none", "c-when-not,c-what,c-how,c-money"]);
});

test("stuck after two wrong answers: three exits; 换个类比 goes back to 学, 往下拆 drafts two children", async ({ page }) => {
  const b = bare();
  Object.assign(b.nodes.find((n: any) => n.id === "c-when-not"), { status: "exploring", beat: "test", fails: 1 });
  await installFakeAtlas(page, true, "web", [b]);
  await page.addInitScript(() => {
    (window as any).__atlasExpansionAnswers = [
      JSON.stringify({
        nodes: [
          { id: "s1", parent: "anchor", title: "观察期从哪天开始算", body: "从合同生效日起算，不是从交钱那天。续保的保单通常不再重新计算。" },
          { id: "s2", parent: "anchor", title: "健康告知没问到的不用说", body: "保险公司只就书面询问的事项要求如实回答，问卷外的情况不构成隐瞒。" },
        ],
        relations: [],
      }),
    ];
  });
  await gotoApp(page);
  const bar = page.getByRole("region", { name: "下一步" });
  await bar.getByRole("button", { name: /开始/ }).click();
  const stop = page.getByRole("region", { name: "这一站" });
  await stop.getByRole("radio", { name: /疾病定义/ }).click();
  await stop.getByRole("button", { name: /提交/ }).click();
  const exits = stop.getByRole("group", { name: "卡住了" });
  await expect(stop).toContainText("没关系，这说明这里藏着更小的概念。");
  await expect(exits.getByRole("button")).toHaveCount(3);
  await expect(exits.getByRole("button").first()).toContainText("推荐");
  // 换个类比: one short call; back to 学 with the analogy shown.
  await exits.getByRole("button", { name: /换个类比/ }).click();
  await expect(stop.locator(".beat.on")).toHaveText("学");
  await expect(stop.locator(".beat-analogy")).toContainText("健身卡");
  expect((await gates(page)).filter((r) => r.mode === "probe")).toHaveLength(1);
  // Stuck again → 往下拆.
  await stop.getByRole("button", { name: /读完了/ }).click();
  await stop.getByLabel("用我的话讲").fill("等待期里确诊一般不赔");
  await stop.getByRole("button", { name: /提交/ }).click();
  for (let i = 0; i < 2; i++) {
    await stop.getByRole("radio", { name: /疾病定义/ }).click();
    await stop.getByRole("button", { name: /提交/ }).click();
  }
  await exits.getByRole("button", { name: /往下拆/ }).click();
  await expect(page.locator(".react-flow__node", { hasText: "观察期从哪天开始算" })).toBeVisible();
  const asks = await page.evaluate(() => (window as any).__atlasAsks);
  expect(asks.at(-1).mode).toBe("expand");
  expect(asks.at(-1).prompt).toContain("只拆出 2 个更小、更基础的子问题");
  await expect
    .poll(async () => (await disk(page)).nodes.filter((n: any) => n.meta?.split).map((n: any) => n.parentId))
    .toEqual(["c-when-not", "c-when-not"]);
  await page.locator(".drawer").getByLabel("关闭").click();
  await expect(bar).toContainText("卡住了，先学拆出来的小问题");
  await expect(bar).toContainText("观察期从哪天开始算");
});

test("稍后 puts the stuck stop off to the end of the route", async ({ page }) => {
  const b = bare();
  Object.assign(b.nodes.find((n: any) => n.id === "c-when-not"), { status: "exploring", beat: "test", fails: 2 });
  await installFakeAtlas(page, true, "web", [b]);
  await gotoApp(page);
  const bar = page.getByRole("region", { name: "下一步" });
  await bar.getByRole("button", { name: /开始/ }).click();
  await page.getByRole("group", { name: "卡住了" }).getByRole("button", { name: /稍后/ }).click();
  await expect(bar).toContainText("下一步 · 第 2 站");
  await expect(bar).not.toContainText("等待期");
  await expect(card(page, "c-when-not").locator(".station")).toHaveText("4");
});

test("合起来讲: with every stop sealed, the root asks for the wrap-up; the stations it reaches light up", async ({ page }) => {
  const b = routedBoard();
  for (const n of b.nodes) if (n.parentId && n.parentId !== null) Object.assign(n, { status: "explained", seal: "test", beat: "done" });
  await installFakeAtlas(page, true, "web", [b]);
  await gotoApp(page);
  const bar = page.getByRole("region", { name: "下一步" });
  await expect(bar).toContainText("★ 下一步 · 收尾");
  await bar.getByRole("button", { name: /开始讲/ }).click();
  const wrap = page.getByRole("region", { name: "合起来讲" });
  await expect(wrap).toContainText("不看卡片，用 5 句话回答起点问题");
  await wrap.getByLabel("合起来讲").fill("先看保哪些病。再看等待期。然后看怎么赔。最后看保额和保费。");
  await expect(wrap).toContainText("4 句");
  await wrap.getByRole("button", { name: /讲完了/ }).click();
  await expect(wrap).toContainText("全图讲通了");
  await expect(page.locator(".card.lit")).toHaveCount(4);
  const mark = (await gates(page)).filter((r) => r.mode === "mark").at(-1);
  expect(mark.prompt).not.toContain("SECRET-KEYPOINT");
  await page.locator(".drawer").getByLabel("关闭").click();
  await expect(bar).toContainText("全部讲清楚了");
});
