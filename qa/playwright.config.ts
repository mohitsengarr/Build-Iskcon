import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.QA_TARGET_URL || "http://localhost:3001";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./results/artifacts",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    screenshot: "only-on-failure",
    trace: "off",
    headless: true,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "./results/results.json" }],
  ],
  projects: [
    {
      name: "desktop-chrome",
      use: { browserName: "chromium", viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-chrome",
      use: { browserName: "chromium", viewport: { width: 375, height: 812 } },
    },
  ],
});
