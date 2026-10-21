import { test, expect } from "@playwright/test";
import { gotoApp, reloadApp } from "./ready";

const savedPrediction = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const boards = JSON.parse(
      localStorage.getItem("studyboard-preview-boards-v1") ?? "[]",
    );
    return boards[0]?.nodes.find((n: { id: string }) => n.id === "concept-dom")
      ?.prediction;
  });

test("prediction survives focused Escape, reopening, reload, navigation and clearing", async ({
  page,
}) => {
  await gotoApp(page);
  await page.keyboard.press("f");
  const input = page.getByPlaceholder("我猜……");
  await expect(input).toHaveAttribute("maxlength", "2000");
  await input.fill("我猜会产出 DOM 树");
  // Escape closes while the input still has focus; blur must not be required.
  await input.press("Escape");
  await expect(page.getByRole("dialog", { name: "走一遍" })).toHaveCount(0);
  await page.keyboard.press("f");
  await expect(input).toHaveValue("我猜会产出 DOM 树");
  await expect.poll(() => savedPrediction(page)).toBe("我猜会产出 DOM 树");
  await reloadApp(page);
  await page.keyboard.press("f");
  await expect(input).toHaveValue("我猜会产出 DOM 树");
  await page.getByRole("button", { name: /下一站/ }).click();
  await input.fill("另一张卡片的预测");
  await page.locator(".study-steps button").first().click();
  await expect(input).toHaveValue("我猜会产出 DOM 树");
  await input.fill("   ");
  await input.press("Escape");
  await expect.poll(() => savedPrediction(page)).toBeUndefined();
  await reloadApp(page);
  await page.keyboard.press("f");
  await expect(input).toHaveValue("");
});
