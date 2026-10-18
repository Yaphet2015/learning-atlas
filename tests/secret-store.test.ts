import { describe, expect, it } from "vitest";
import { maskKey } from "../electron/secret-store";

describe("maskKey", () => {
  it("shows a prefix and the last four characters only", () => {
    expect(maskKey("sk-proj-abcdefghijkl1234")).toBe("sk-••••1234");
    expect(maskKey("abcdefghijklmnop")).toBe("••••mnop");
    expect(maskKey("short")).toBe("••••");
  });
});
