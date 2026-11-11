import { defineConfig } from "@playwright/test";

const baseURL = process.env.AUTH_URL ?? "http://127.0.0.1:3110";
const port = process.env.FOODREC_E2E_PORT ?? "3110";
const node = process.execPath.includes(" ") ? `"${process.execPath}"` : process.execPath;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  outputDir: process.env.FOODREC_E2E_OUTPUT_DIR ?? "test-results/phase-f",
  use: {
    baseURL,
    browserName: "chromium",
    viewport: { width: 1440, height: 960 },
    launchOptions: { executablePath: process.env.FOODREC_CHROME_PATH },
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: `${node} node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000
  }
});
