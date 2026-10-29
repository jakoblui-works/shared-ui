import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "browser",
  dts: true,
  // The stylesheet ships as source: each app's Tailwind compiles it along with its own.
  copy: "src/styles.css",
});
