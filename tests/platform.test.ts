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
    const top = Number(
      /\.mac-titlebar \{\s*--sidebar-top: (\d+)px;/.exec(css)?.[1],
    );
    // Leave 12px below the traffic lights even when the sidebar is collapsed.
    expect(top).toBeGreaterThanOrEqual(Number(light![2]) + 14 + 12);
    expect(css).toMatch(
      /\.workspace-sidebar \{[\s\S]*?top: var\(--sidebar-top\)/,
    );
  });
});
