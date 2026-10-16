import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const electronMock = vi.hoisted(() => ({
  setName: vi.fn(),
  setPath: vi.fn(),
  requestSingleInstanceLock: vi.fn(() => true),
  on: vi.fn(),
  quit: vi.fn(),
  exit: vi.fn(),
  whenReady: vi.fn(() => new Promise<void>(() => {})),
}));
vi.mock("electron", () => ({
  app: electronMock,
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn() },
  dialog: {},
}));

describe("Electron ESM entry bootstrap", () => {
  it("finishes importing while app.whenReady is unresolved", async () => {
    // Electron gates appCodeLoaded/ready on entry-module completion. A top-level
    // await app.whenReady() deadlocks real GUI startup but not RUN_AS_NODE tests.
    await expect(
      Promise.race([
        import("../electron/main"),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Entry import awaited readiness")),
            1500,
          ),
        ),
      ]),
    ).resolves.toBeDefined();
    expect(electronMock.whenReady).toHaveBeenCalledOnce();
    expect(electronMock.exit).not.toHaveBeenCalled();
  });
  it("has no entry-level await expression and keeps readiness in the callback", async () => {
    const source = await readFile(
      new URL("../electron/main.ts", import.meta.url),
      "utf8",
    );
    const tree = ts.createSourceFile(
      "main.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const topLevelAwaits: ts.Node[] = [];
    function visit(node: ts.Node, insideFunction = false) {
      const functionScope = insideFunction || ts.isFunctionLike(node);
      if (ts.isAwaitExpression(node) && !functionScope)
        topLevelAwaits.push(node);
      ts.forEachChild(node, (child) => visit(child, functionScope));
    }
    visit(tree);
    expect(topLevelAwaits).toHaveLength(0);
    expect(source).toContain(".then(bootstrap)");
  });
});
