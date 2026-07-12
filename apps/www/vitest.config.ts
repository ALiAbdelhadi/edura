import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    // Unit tests run everywhere; *.db.test.ts hit the real Neon branch and are
    // opt-in via `pnpm test:db` (they need DATABASE_URL).
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["tests/e2e/**", "tests/playwright/**", "node_modules/**"],
  },
});
