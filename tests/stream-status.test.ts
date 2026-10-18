import { describe, expect, it } from "vitest";
import { elapsedLabel } from "../src/components/StreamStatus";

describe("streaming indicator", () => {
  it("formats elapsed time in tenths, then minutes", () => {
    expect(elapsedLabel(0)).toBe("0.0s");
    expect(elapsedLabel(2_440)).toBe("2.4s");
    expect(elapsedLabel(59_900)).toBe("59.9s");
    expect(elapsedLabel(75_000)).toBe("1m 15s");
    expect(elapsedLabel(-5)).toBe("0.0s");
  });
});
