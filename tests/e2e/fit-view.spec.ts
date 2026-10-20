import { test, expect } from "@playwright/test";
import { gotoApp } from "./ready";
import { insuranceBoard } from "./fixtures";

for (const height of [600, 982]) {
  test(`fit view keeps a deep map above the dock at height ${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height });
    const board = insuranceBoard(false);
    const root = board.nodes[0];
    for (let i = 0; i < 6; i++) {
      board.nodes.push({
        ...root,
        id: `deep-${i}`,
        title: `层 ${i}`,
        parentId: i ? `deep-${i - 1}` : root.id,
        order: 0,
      });
    }
    board.nodes.push({
      ...root,
      id: "deep-peer",
      title: "同行",
      parentId: "deep-4",
      order: 1,
    });
    (board.relations as unknown[]) = [
      {
        id: "bottom-link",
        source: "deep-5",
        target: "deep-peer",
        label: "底部关系",
        kind: "cross",
      },
    ];
    await page.addInitScript(
      (board) =>
        localStorage.setItem(
          "studyboard-preview-boards-v1",
          JSON.stringify([board]),
        ),
      board,
    );
    await gotoApp(page);
    const clearOfDock = async () => {
      const card = await page
        .locator('.react-flow__node[data-id="deep-5"]')
        .boundingBox();
      const dock = await page.locator(".dock").boundingBox();
      // Includes space for cross-link arcs, label and its halo below the last row.
      const label = await page
        .locator(".react-flow__edges .cross-label")
        .boundingBox();
      return (
        !!card &&
        !!dock &&
        !!label &&
        card.y + card.height + 90 <= dock.y &&
        label.y + label.height + 8 <= dock.y
      );
    };
    await expect.poll(clearOfDock).toBe(true);
    await page.keyboard.press("0");
    await expect.poll(clearOfDock).toBe(true);
    await page.getByLabel("查看全图").click();
    await expect.poll(clearOfDock).toBe(true);
  });
}
