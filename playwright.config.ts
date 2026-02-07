import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    headless: true,
  },
  reporter: "list",
  webServer: {
    command: "npm run e2e:db:push && npm run dev:webpack",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
