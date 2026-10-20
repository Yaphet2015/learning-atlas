import { test, expect } from "@playwright/test";
import { installFakeAtlas } from "./fake-atlas";
import { insuranceBoard } from "./fixtures";
import { gotoApp } from "./ready";

test("an expanded AI card can add more concepts and report no useful additions", async ({
  page,
}) => {
  const board = insuranceBoard(true);
  Object.assign(board.nodes.find((node) => node.id === "c-what")!, {
    expanded: true,
  });
  await installFakeAtlas(page, true, "web", [board]);
  await page.addInitScript(() => {
    (window as any).__atlasExpansionAnswers = [
      JSON.stringify({
        nodes: [
          {
            id: "claim",
            title: "理赔需要什么证明",
            body: "核对合同要求的证明材料。",
            parent: "anchor",
          },
        ],
        relations: [],
      }),
      JSON.stringify({ nodes: [], relations: [] }),
    ];
  });
  await gotoApp(page);
  await page.locator('.react-flow__node[data-id="c-what"]').click();
  const expand = page.getByRole("button", { name: "再看一层", exact: true });
  await expect(expand).toBeVisible();
  const cards = page.locator(".react-flow__node");
  const count = await cards.count();
  await expand.click();
  await expect(expand).toBeDisabled();
  await expect(cards).toHaveCount(count + 1);
  await expect(expand).toBeEnabled();
  await expand.click();
  await expect(
    page.getByText(
      "这次没有找到值得补充的新概念。你仍可以继续提问或稍后再试。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(cards).toHaveCount(count + 1);
  await expect(expand).toBeEnabled();
  const requests = await page.evaluate(() => (window as any).__atlasAsks);
  expect(requests).toHaveLength(2);
  expect(requests[1].context.structure).toContain("理赔需要什么证明");
  expect(requests[0].context.topic).toBe(board.topic);
  expect(requests[0].context.review).toMatchObject({
    radius: 4,
    anchors: ["c-what"],
  });
  expect(requests[0].context.review.nodes).toHaveLength(board.nodes.length);
  expect(requests[1].context.review.nodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: "理赔需要什么证明",
        body: "核对合同要求的证明材料。",
        parentId: "c-what",
      }),
      expect.objectContaining({
        id: "c-when-not",
        body: board.nodes.find((n) => n.id === "c-when-not")!.body,
      }),
    ]),
  );
});
