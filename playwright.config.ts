import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * E2E suite for the Matchpass monorepo (../ticketing-app-frontend-monorepo by default).
 * Runs against the production builds of the Next.js app and the mock API on dedicated ports.
 */
const MONOREPO = path.resolve(import.meta.dirname, process.env.MONOREPO_DIR ?? "../ticketing-app-frontend-monorepo");
export const WEB_PORT = Number(process.env.WEB_PORT ?? 3100);
export const API_PORT = Number(process.env.API_PORT ?? 4100);
const reuse = !process.env.CI;

export default defineConfig({
  testDir: "./tests",
  // The mock API keeps state in memory and every test resets it, so tests run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: process.env.SLOW_MO ? 300_000 : 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["junit", { outputFile: "test-results/junit.xml" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "en-GB",
    timezoneId: "Africa/Cairo",
    // SLOW_MO=500 slows every action down so a headed run can be followed by eye.
    launchOptions: { slowMo: Number(process.env.SLOW_MO ?? 0) },
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
    // Cross-browser smoke: the core purchase and account journeys in Firefox and Safari's engine.
    {
      name: "desktop-firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } },
      testMatch: /(04-match-purchase|05-shows-purchase|08-account)\.spec\.ts/,
    },
    {
      name: "desktop-webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } },
      testMatch: /(04-match-purchase|05-shows-purchase|08-account)\.spec\.ts/,
    },
    { name: "mobile-safari", use: { ...devices["iPhone 15"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      name: "mock-api",
      command: "node apps/mock-api/dist/server.js",
      cwd: MONOREPO,
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: reuse,
      timeout: process.env.SLOW_MO ? 300_000 : 60_000,
      env: {
        PORT: String(API_PORT),
        NODE_ENV: "production",
        ENABLE_TEST_ROUTES: "true",
        // Make the simulated waiting room, identity check and wallet approvals fast enough for tests.
        QUEUE_TIME_SCALE: "0.15",
        FAN_ID_REVIEW_SECONDS: "2",
        PAYMENT_APPROVAL_SECONDS: "1",
        QR_SECRET: "e2e-only-qr-signing-secret",
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      name: "matchpass-web",
      command: `pnpm exec next start --port ${WEB_PORT}`,
      cwd: path.join(MONOREPO, "apps/matchpass-web"),
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: reuse,
      timeout: 120_000,
      env: { API_ORIGIN: `http://localhost:${API_PORT}`, SITE_URL: `http://localhost:${WEB_PORT}`, NODE_ENV: "production" },
    },
  ],
});
