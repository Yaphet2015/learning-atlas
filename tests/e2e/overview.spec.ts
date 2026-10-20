import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./ready";
import { insuranceBoard } from "./fixtures";
import { installFakeAtlas } from "./fake-atlas";

async function zoomOut(page: Page, targetPercent = 30): Promise<void> {
  // Initial fitView runs after the app readiness signal.
  await page.waitForTimeout(400);
  for (let i = 0; i < 18; i++) {
    const percent = Number(
      (await page.locator(".zoom .lab").innerText()).replace("%", ""),
    );
    if (percent <= targetPercent) return;
    await page.getByRole("button", { name: "缩小", exact: true }).click();
    await expect
      .poll(async () =>
        Number((await page.locator(".zoom .lab").innerText()).replace("%", "")),
      )
      .toBeLessThan(percent);
    // The zoom animation lasts 200ms; let it finish before the next step.
    await page.waitForTimeout(230);
  }
}

test("overviews start below 30% and annotate cards without covering or disabling them", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
  await gotoApp(page);
  const card = page.locator('.react-flow__node[data-id="c-what"]');
  const original = await card.getAttribute("style");
  const count = await page.locator(".react-flow__node").count();
  const active = page.locator('.topic-overview[data-active="true"]');
  await zoomOut(page, 60);
  await expect(active).toHaveCount(0);
  await expect(card).toHaveCSS("opacity", "1");
  await zoomOut(page);
  await expect(active).toHaveCount(4);
  await expect(card).toHaveCSS("opacity", "1");
  await expect(card).not.toHaveAttribute("inert", "");
  await expect(page.locator("[data-overview-faded]")).toHaveCount(0);
  await expect(active.first()).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(
    active.first().locator(".topic-overview-outline > path").first(),
  ).toHaveAttribute("fill", "none");
  const summary = page.locator(
    '.topic-overview[data-topic-id="c-what"] .topic-overview-summary',
  );
  await expect(summary).toBeVisible();
  await expect(summary).toHaveCSS("font-size", "12px");
  expect(await summary.innerText()).toContain("病种数量");
  await page.screenshot({ path: test.info().outputPath("overview.png") });
  await expect(page.locator(".react-flow__node")).toHaveCount(count);
  const requests = await page.evaluate(() => [
    (window as any).__atlasAsks.length,
    (window as any).__atlasHints.length,
  ]);
  expect(requests).toEqual([0, 0]);
  const geometry = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".react-flow__node")].map(
      (node) => node.getBoundingClientRect(),
    );
    const labels = [
      ...document.querySelectorAll(
        '.topic-overview[data-active="true"] .topic-overview-content',
      ),
    ].map((node) => node.getBoundingClientRect());
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top;
    const card = document
      .querySelector('.react-flow__node[data-id="c-what"]')!
      .getBoundingClientRect();
    return {
      coversCards: labels.some((label) =>
        cards.some((card) => overlaps(label, card)),
      ),
      overlappingLabels: labels.some((label, i) =>
        labels.slice(i + 1).some((other) => overlaps(label, other)),
      ),
      hit: document
        .elementFromPoint(card.x + card.width / 2, card.y + card.height / 2)
        ?.closest(".react-flow__node")
        ?.getAttribute("data-id"),
    };
  });
  expect(geometry).toEqual({
    coversCards: false,
    overlappingLabels: false,
    hit: "c-what",
  });
  await zoomOut(page, 12);
  await expect(active).toHaveCount(4);
  for (const region of await active.all())
    await expect(region).toHaveAttribute("data-depth", "1");
  await expect(card).toHaveCSS("opacity", "1");
  await page.screenshot({ path: test.info().outputPath("overview-far.png") });
  await page
    .getByRole("button", { name: "放大主题：保什么", exact: true })
    .click();
  await expect
    .poll(async () =>
      Number((await page.locator(".zoom .lab").innerText()).replace("%", "")),
    )
    .toBeGreaterThanOrEqual(85);
  await expect(card).not.toHaveAttribute("inert", "");
  await expect(card).toHaveAttribute("style", original!);
  await expect(active).toHaveCount(0);
});

test("an AI overview is ready when cards arrive and survives reload", async ({
  page,
}) => {
  await installFakeAtlas(page, true, "web", [insuranceBoard(true)]);
  await page.addInitScript(() => {
    (window as any).__atlasExpansionAnswers = [
      JSON.stringify({
        nodes: [
          {
            id: "detail",
            title: "疾病定义写在哪里",
            body: "合同中的定义决定保障范围。",
            parent: "anchor",
          },
        ],
        relations: [],
        overviews: [
          { id: "anchor", summary: "先看病种分层，再核对合同的疾病定义。" },
        ],
      }),
    ];
  });
  await gotoApp(page);
  await page.locator('.react-flow__node[data-id="c-what"]').click();
  await page.getByRole("button", { name: "再看一层", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(8);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("fake-atlas-disk")!)[0].nodes.find(
            (node: any) => node.id === "c-what",
          ).overview?.summary,
      ),
    )
    .toBe("先看病种分层，再核对合同的疾病定义。");
  await page.reload();
  await page.locator("html[data-app-ready]").waitFor();
  await zoomOut(page);
  await expect(
    page.locator(
      '.topic-overview[data-topic-id="c-what"] .topic-overview-summary',
    ),
  ).toHaveText("先看病种分层，再核对合同的疾病定义。");
});

test("PNG export keeps full cards while transparent overview annotations stay on screen", async ({
  page,
}) => {
  const board = insuranceBoard(true);
  await installFakeAtlas(page, true, "web", [board]);
  await gotoApp(page);
  await zoomOut(page);
  const result = await page.evaluate(async () => {
    const path = "/src/canvas-image.ts";
    const { canvasImage } = await import(path);
    const nodes = [
      ...document.querySelectorAll<HTMLElement>(".react-flow__node"),
    ].map((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return {
        id: element.dataset.id!,
        data: {},
        position: { x: matrix.e, y: matrix.f },
        measured: { width: element.offsetWidth, height: element.offsetHeight },
      };
    });
    const serialize = XMLSerializer.prototype.serializeToString;
    let snapshot = "";
    XMLSerializer.prototype.serializeToString = function (root: Node) {
      snapshot = serialize.call(this, root);
      return snapshot;
    };
    try {
      const png = await canvasImage(nodes);
      const clone = new DOMParser().parseFromString(
        snapshot,
        "application/xml",
      );
      return {
        png: png.startsWith("data:image/png;base64,"),
        regions: clone.querySelectorAll(".topic-overviews").length,
        faded: clone.querySelectorAll("[data-overview-faded]").length,
        cards: clone.querySelectorAll(".react-flow__node").length,
      };
    } finally {
      XMLSerializer.prototype.serializeToString = serialize;
    }
  });
  expect(result).toEqual({
    png: true,
    regions: 0,
    faded: 0,
    cards: board.nodes.length,
  });
  await expect(page.locator('.topic-overview[data-active="true"]')).toHaveCount(
    4,
  );
  await expect(page.locator('.react-flow__node[data-id="c-what"]')).toHaveCSS(
    "opacity",
    "1",
  );
});
