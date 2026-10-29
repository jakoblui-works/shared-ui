/// <reference types="vitest/config" />
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import path from "path";
import { defineConfig } from "vite";

// Only Storybook and Vitest use this; the package itself is built by tsdown.
export default defineConfig({
  plugins: [tailwindcss(), react()],
  test: {
    projects: [
      {
        extends: true,
        // Every story runs as a test in a real browser (https://storybook.js.org/docs/writing-tests/integrations/vitest-addon).
        plugins: [storybookTest({ configDir: path.join(import.meta.dirname, ".storybook") })],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
