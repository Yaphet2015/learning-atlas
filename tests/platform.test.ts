import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { windowChromeClasses } from "../src/model/platform";

describe("macOS window chrome inset", () => {
  it("insets and adds a drag strip only on macOS outside fullscreen", () => {
    expect(windowChromeClasses("darwin", false)).toEqual([
      "platform-mac",
      "mac-titlebar",
    ]);
    expect(windowChromeClasses("darwin", true)).toEqual(["platform-mac"]);
    for (const other of ["web", "win32", "linux", undefined])
      expect(windowChromeClasses(other, false)).toEqual([]);
  });
  it("clears the traffic lights configured in the main process", () => {
    const main = readFileSync("electron/main.ts", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const light = /trafficLightPosition: \{ x: (\d+), y: (\d+) \}/.exec(main);
    expect(main).toContain('titleBarStyle: "hiddenInset"');
    expect(light).not.toBeNull();
    const inset = Number(
      /\.mac-titlebar \{\s*--chrome-inset-left: (\d+)px;/.exec(css)?.[1],
    );
    // Three 14px lights with 6px gaps start at x; keep at least 12px of air after them.
    expect(inset).toBeGreaterThanOrEqual(
      Number(light![1]) + 3 * 14 + 2 * 6 + 12,
    );
    expect(css).toMatch(/\.switcher \{\s*left: var\(--chrome-inset-left\)/);
  });
});
