import { defineConfig } from "@playwright/test";
import { developmentServer } from "./src/shared/developmentServer";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  use: {
    headless: true,
  },
  reporter: "list",
  webServer: {
    command:
      "PLAYWRIGHT_TEST=1 npm run e2e:db:push && PLAYWRIGHT_TEST=1 npm run e2e:electron:prepare && PLAYWRIGHT_TEST=1 npm run dev:webpack",
    url: developmentServer().url,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
