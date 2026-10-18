import { cpSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** Folder names Electron used for userData before the app became Studyboard. */
export const LEGACY_USER_DATA_NAMES = ["Learning Atlas"];
/** Entries that hold the user's own data; Chromium caches are not copied. */
const DATA_ENTRIES = ["boards", "ai"];

/**
 * One-time copy of boards and AI history from the old "Learning Atlas"
 * userData folder. Runs only when the new folder has none of its own data,
 * and never deletes the old folder, so a failed or partial copy loses nothing.
 */
export function migrateLegacyUserData(
  appData: string,
  userData: string,
  log: (message: string) => void = () => {},
): string | null {
  const hasData = (dir: string) =>
    DATA_ENTRIES.some((entry) => {
      const target = path.join(dir, entry);
      return existsSync(target) && readdirSync(target).length > 0;
    });
  if (hasData(userData)) return null;
  for (const name of LEGACY_USER_DATA_NAMES) {
    const legacy = path.join(appData, name);
    if (path.resolve(legacy) === path.resolve(userData) || !hasData(legacy))
      continue;
    for (const entry of DATA_ENTRIES) {
      const from = path.join(legacy, entry);
      if (existsSync(from))
        cpSync(from, path.join(userData, entry), {
          recursive: true,
          force: false,
          errorOnExist: false,
        });
    }
    log(`[migrate] copied boards and AI history from ${legacy}`);
    return legacy;
  }
  return null;
}
