import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["account.spec.ts", "issues.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Edge"],
        channel: process.env.CI ? "chromium" : "msedge",
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
