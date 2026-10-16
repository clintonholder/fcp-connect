import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone config for unit tests; vite.config.ts pulls in app plugins tests don't need.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
