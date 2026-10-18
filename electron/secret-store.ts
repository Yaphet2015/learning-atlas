import { readFileSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";

/**
 * The slice of Electron's safeStorage this app uses. Injected so tests can mock it and so
 * nothing outside the main process ever sees the plaintext.
 */
export interface SecretCipher {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
  /** Linux only: "basic_text" means no real keyring, so we treat it as unavailable. */
  getSelectedStorageBackend?(): string;
}

export interface SavedKey {
  key: string;
  /** The endpoint the key was saved for; a key is never sent to a different destination. */
  baseUrl: string;
}

/**
 * The API key, encrypted at rest with safeStorage (macOS: a Keychain-held key). The file holds
 * only ciphertext plus the endpoint it belongs to. Without a usable cipher nothing is written.
 */
export class SavedKeyStore {
  constructor(
    private readonly path: string,
    private readonly cipher: SecretCipher | null,
  ) {}

  available(): boolean {
    try {
      if (!this.cipher?.isEncryptionAvailable()) return false;
      return this.cipher.getSelectedStorageBackend?.() !== "basic_text";
    } catch {
      return false;
    }
  }

  load(): SavedKey | undefined {
    if (!this.available()) return undefined;
    try {
      const value = JSON.parse(readFileSync(this.path, "utf8")) as {
        v?: number;
        baseUrl?: unknown;
        data?: unknown;
      };
      if (
        value.v !== 1 ||
        typeof value.baseUrl !== "string" ||
        typeof value.data !== "string"
      )
        return undefined;
      const key = this.cipher!.decryptString(
        Buffer.from(value.data, "base64"),
      ).trim();
      return key ? { key, baseUrl: value.baseUrl } : undefined;
    } catch {
      // Missing, corrupt or undecryptable (e.g. a Keychain entry that was reset): no saved key.
      return undefined;
    }
  }

  /** Encrypt and write; false when safeStorage cannot be used (the key then stays in memory only). */
  async save(saved: SavedKey): Promise<boolean> {
    if (!this.available()) return false;
    const data = this.cipher!.encryptString(saved.key).toString("base64");
    const next = `${this.path}.tmp`;
    await writeFile(
      next,
      JSON.stringify({ v: 1, baseUrl: saved.baseUrl, data }),
      { mode: 0o600 },
    );
    await rename(next, this.path);
    return true;
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }
}

/** "sk-…a1b2": enough to recognise a key, never enough to use it. */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length < 12) return "••••";
  const head = /^[a-z]{2,4}-/i.exec(k)?.[0] ?? "";
  return `${head}••••${k.slice(-4)}`;
}
