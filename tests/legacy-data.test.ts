import { describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrateLegacyUserData } from "../electron/legacy-data";
import {
  migrateLegacyPreview,
  PREVIEW_KEY,
  LEGACY_PREVIEW_KEY,
} from "../src/preview-storage";

function setup() {
  const appData = mkdtempSync(path.join(tmpdir(), "sb-migrate-"));
  const legacy = path.join(appData, "Learning Atlas");
  mkdirSync(path.join(legacy, "boards"), { recursive: true });
  mkdirSync(path.join(legacy, "ai", "b1"), { recursive: true });
  writeFileSync(path.join(legacy, "boards", "b1.json"), '{"id":"b1"}');
  writeFileSync(path.join(legacy, "ai", "b1", "s.sqlite"), "db");
  return { appData, legacy, userData: path.join(appData, "Studyboard") };
}

describe("Learning Atlas → Studyboard userData migration", () => {
  it("copies boards and AI history when Studyboard has no data", () => {
    const { appData, legacy, userData } = setup();
    mkdirSync(path.join(userData, "Cache"), { recursive: true }); // Chromium junk is not "data"
    expect(migrateLegacyUserData(appData, userData)).toBe(legacy);
    expect(readFileSync(path.join(userData, "boards", "b1.json"), "utf8")).toBe(
      '{"id":"b1"}',
    );
    expect(
      readFileSync(path.join(userData, "ai", "b1", "s.sqlite"), "utf8"),
    ).toBe("db");
    expect(existsSync(path.join(legacy, "boards", "b1.json"))).toBe(true); // old copy kept
  });
  it("is a no-op once Studyboard has boards", () => {
    const { appData, userData } = setup();
    mkdirSync(path.join(userData, "boards"), { recursive: true });
    writeFileSync(path.join(userData, "boards", "new.json"), "{}");
    expect(migrateLegacyUserData(appData, userData)).toBeNull();
    expect(existsSync(path.join(userData, "boards", "b1.json"))).toBe(false);
  });
  it("does nothing without a legacy folder", () => {
    const appData = mkdtempSync(path.join(tmpdir(), "sb-migrate-"));
    expect(
      migrateLegacyUserData(appData, path.join(appData, "Studyboard")),
    ).toBeNull();
  });
});

function memoryStorage(initial: Record<string, string>): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("web preview storage key migration", () => {
  it("moves old boards to the new key", () => {
    const s = memoryStorage({ [LEGACY_PREVIEW_KEY]: "[1]" });
    migrateLegacyPreview(s);
    expect(s.getItem(PREVIEW_KEY)).toBe("[1]");
    expect(s.getItem(LEGACY_PREVIEW_KEY)).toBeNull();
  });
  it("never overwrites boards already under the new key", () => {
    const s = memoryStorage({
      [LEGACY_PREVIEW_KEY]: "[1]",
      [PREVIEW_KEY]: "[2]",
    });
    migrateLegacyPreview(s);
    expect(s.getItem(PREVIEW_KEY)).toBe("[2]");
  });
});
