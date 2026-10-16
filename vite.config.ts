import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: "local-development-csp",
      transformIndexHtml(html) {
        return command === "serve"
          ? html.replace(
              "script-src 'self'",
              "script-src 'self' 'nonce-learning-atlas-dev'",
            )
          : html;
      },
    },
  ],
  html: command === "serve" ? { cspNonce: "learning-atlas-dev" } : undefined,
  base: "./",
  test: { include: ["tests/**/*.test.ts"] },
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
}));
