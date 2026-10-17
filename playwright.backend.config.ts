import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "backend.spec.ts",
  workers: 1,
  retries: 0,
  use: { baseURL: "http://localhost:3011", trace: "retain-on-failure" },
  projects: [
    {
      name: "backend-cookies",
      use: {
        ...devices["Desktop Edge"],
        channel: process.env.CI ? "chromium" : "msedge",
      },
    },
  ],
  webServer: [
    {
      command: "node --import tsx e2e/backend-fixture.mts",
      env: { ILEAD_BROWSER_FIXTURE: "true" },
      url: "http://127.0.0.1:4011/api/v1/health",
      timeout: 60000,
    },
    {
      command: "npm run dev -- --port 3011",
      env: {
        API_ORIGIN: "http://127.0.0.1:4011",
        NEXT_DIST_DIR: ".next-integration",
      },
      url: "http://localhost:3011/login",
      timeout: 120000,
    },
  ],
});
