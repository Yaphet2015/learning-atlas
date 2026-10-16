import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("macOS desktop bridge, edit flush on immediate close, and durable reopening", async () => {
  test.skip(
    process.platform !== "darwin",
    "Actual desktop acceptance runs on macOS.",
  );
  test.setTimeout(90_000);
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-e2e-"));
  const environment: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    ATLAS_E2E: "1",
    ATLAS_TEST_USERDATA: directory,
  };
  delete environment.ATLAS_DEV_SERVER;
  try {
    const app = await electron.launch({
      args: ["."],
      env: environment,
      timeout: 25_000,
    });
    const page = await app.firstWindow();
    await expect(page.getByText("一行 CSS，画面为什么变了？")).toBeVisible();
    await expect(page.getByText("白板保存在这台 Mac")).toBeVisible();
    await page.screenshot({
      path: "test-results/atlas-macos-desktop.png",
      fullPage: true,
    });
    await page.getByText("贴张批注", { exact: true }).click();
    await page
      .getByLabel("批注内容")
      .fill("Close immediately: this edit must survive.");
    const closed = app.waitForEvent("close");
    await page.evaluate(() => window.close());
    await closed;
    const reopened = await electron.launch({
      args: ["."],
      env: environment,
      timeout: 25_000,
    });
    const nextPage = await reopened.firstWindow();
    await expect(nextPage.getByLabel("批注内容")).toHaveValue(
      "Close immediately: this edit must survive.",
    );
    await nextPage.screenshot({
      path: "test-results/atlas-macos-sticky-reopened.png",
      fullPage: true,
    });
    await reopened.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
