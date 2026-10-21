// Bundles the harness with the app's real modules; npm packages stay external.
import { build } from "esbuild";
await build({
  entryPoints: ["evals/run.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  outfile: "evals/.build/run.mjs",
  logLevel: "warning",
});
