import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/", import.meta.url)),
      // Next's own server-layer alias for `import "server-only"` (an empty
      // module); the client-layer one throws, and unit tests are server code.
      "server-only": "next/dist/compiled/server-only/empty",
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["tests/e2e/**", "tests/playwright/**", "node_modules/**"],
  },
});
