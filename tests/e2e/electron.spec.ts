import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("macOS desktop bridge, edit flush on immediate close, and durable reopening", async ({}, testInfo) => {
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
  delete environment.OPENAI_API_KEY;
  const diagnostics: string[] = [];
  const applications: ElectronApplication[] = [];
  const pages: Page[] = [];
  async function launch() {
    const app = await electron.launch({
      args: ["."],
      env: environment,
      timeout: 25_000,
    });
    applications.push(app);
    app.on("console", (message) =>
      diagnostics.push(`[main ${message.type()}] ${message.text()}`),
    );
    app
      .process()
      .stderr?.on("data", (chunk) =>
        diagnostics.push(`[stderr] ${String(chunk)}`),
      );
    const page = await app.firstWindow();
    pages.push(page);
    page.on("console", (message) =>
      diagnostics.push(`[renderer ${message.type()}] ${message.text()}`),
    );
    page.on("pageerror", (error) =>
      diagnostics.push(`[pageerror] ${error.message}`),
    );
    page.on("close", () => diagnostics.push("[test] native window closed"));
    return { app, page };
  }
  try {
    const { app, page } = await launch();
    await expect(page.getByText("一行 CSS，画面为什么变了？")).toBeVisible();
    await expect(page.getByText("白板保存在这台 Mac")).toBeVisible();
    await page.screenshot({
      path: "test-results/atlas-macos-desktop.png",
      fullPage: true,
    });
    await page.getByText("贴张批注", { exact: true }).click();
    const nativeWindow = await app.browserWindow(page);
    await page
      .getByLabel("批注内容")
      .fill("Close immediately: this edit must survive.");

    // Trigger the same native close event as the macOS window button. Do not wait
    // for autosave, call destroy(), or force the process to exit for this check.
    const windowClosed = page.waitForEvent("close", { timeout: 15_000 });
    await nativeWindow.evaluate((window) => window.close());
    await windowClosed;

    // Playwright owns a Node inspector connection. Its supported close method
    // disconnects that debugger so a naturally quitting Electron process can exit.
    await app.close();
    const boardDirectory = path.join(directory, "boards");
    const boardFiles = (await readdir(boardDirectory)).filter((file) =>
      file.endsWith(".json"),
    );
    expect(boardFiles).toHaveLength(1);
    const persisted = JSON.parse(
      await readFile(path.join(boardDirectory, boardFiles[0]), "utf8"),
    );
    expect(persisted.notes.at(-1).text).toBe(
      "Close immediately: this edit must survive.",
    );

    const { app: reopened, page: nextPage } = await launch();
    await expect(nextPage.getByLabel("批注内容")).toHaveValue(
      "Close immediately: this edit must survive.",
    );
    await nextPage.screenshot({
      path: "test-results/atlas-macos-sticky-reopened.png",
      fullPage: true,
    });
    await reopened.close();
  } catch (error) {
    for (const [index, page] of pages.entries()) {
      if (!page.isClosed()) {
        await page
          .screenshot({
            path: testInfo.outputPath(`electron-failure-${index}.png`),
            fullPage: true,
          })
          .catch(() => {});
        await writeFile(
          testInfo.outputPath(`electron-dom-${index}.html`),
          await page.content().catch(() => "Page content unavailable"),
        ).catch(() => {});
      }
    }
    throw error;
  } finally {
    // Failure cleanup is separate from the assertion above and never makes a
    // failed close/reopen check pass. Do not leave the test's own app orphaned.
    for (const app of applications) {
      if (app.process().exitCode === null && !app.process().killed) {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          app.close().catch(() => {}),
          new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, 5000);
          }),
        ]);
        if (timeout) clearTimeout(timeout);
        if (app.process().exitCode === null && !app.process().killed)
          app.process().kill("SIGTERM");
      }
    }
    await writeFile(
      testInfo.outputPath("electron-diagnostics.txt"),
      diagnostics.join("\n"),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
