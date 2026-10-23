import { defineConfig } from "vitest/config";
// Manual real-LLM sample only (never in CI): pnpm exec vitest run -c scripts/vitest.sample.config.ts
export default defineConfig({ test: { include: ["scripts/*.sample.ts"], testTimeout: 600_000 } });
