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
  it("hangs macOS traffic lights just below the title bar centre", () => {
    const main = readFileSync("electron/main.ts", "utf8");
    expect(main).toContain('titleBarStyle: "hiddenInset"');
    const css = readFileSync("src/styles.css", "utf8");
    const position = /trafficLightPosition: \{ x: (\d+), y: (\d+) \}/.exec(
      main,
    );
    const height = /\.titlebar-drag \{[\s\S]*?height: (\d+)px;/.exec(css);
    expect(position).not.toBeNull();
    expect(height).not.toBeNull();
    // Optical centring: the buttons sit slightly below the strip's geometric centre.
    expect(Number(position![2]) + 14 / 2).toBe(Number(height![1]) / 2 + 4);
  });
});
