import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  fullyParallel: false,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.PW_BASE_URL ?? "http://localhost:3002",
    headless: true,
    locale: "en-US",
    navigationTimeout: 60_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      timeout: 120_000,
      use: { channel: "chrome" },
    },
    {
      name: "chromium",
      use: { channel: "chrome" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "bun run dev",
    url: process.env.PW_BASE_URL ?? "http://localhost:3002",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
