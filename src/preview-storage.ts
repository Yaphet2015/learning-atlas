export const PREVIEW_KEY = "studyboard-preview-boards-v1";
export const LEGACY_PREVIEW_KEY = "learning-atlas-preview-boards-v1";
/** One-time move of web-preview boards saved before the Studyboard rename. */
export function migrateLegacyPreview(storage: Storage = localStorage): void {
  const legacy = storage.getItem(LEGACY_PREVIEW_KEY);
  if (legacy === null) return;
  // Leave the old key alone if new boards already exist; never overwrite them.
  if (storage.getItem(PREVIEW_KEY) !== null) return;
  storage.setItem(PREVIEW_KEY, legacy);
  storage.removeItem(LEGACY_PREVIEW_KEY);
}
