// Captures full-page screenshots of key screens for visual review against the design.
// Usage: node scripts/screenshots.mjs [outDir]   (expects the app on BASE_URL, default http://localhost:3000)
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const outDir = process.argv[2] ?? "screenshots";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const reset = await page.request.post(`${BASE_URL}/api/__test__/reset`);
const { demoUser } = await reset.json();
// Logging in through the app's BFF sets the httpOnly session cookie on this browser context.
const login = await page.request.post(`${BASE_URL}/api/auth/login`, { data: { phone: demoUser.phone, password: demoUser.password } });
if (!login.ok()) throw new Error(`login failed: ${login.status()}`);
const session = (await context.cookies()).find((c) => c.name === "mp_session");

const shots = [
  ["01-home", "/", false],
  ["02-events", "/events?tab=matches", false],
  ["03a-match", "/events/nile-fc-vs-delta-sc", true],
  ["03b-concert", "/events/layla-nour-live-in-cairo", true],
  ["05a-zones", "/events/nile-fc-vs-delta-sc/tickets", true],
  ["05b-stadium-seats", "/events/nile-fc-vs-delta-sc/seats", true],
  ["05c-arena", "/events/layla-nour-live-in-cairo/tickets", true],
  ["05d-hall", "/events/nile-philharmonic-film-classics/tickets", true],
  ["05e-cinema", "/events/the-last-lighthouse/tickets", true],
  ["08-my-tickets", "/tickets", true],
  ["10-resale", "/resale", true],
  ["12-refunds", "/refunds", true],
  ["13-signup", "/signup", false],
  ["14-fan-id", "/fan-id", true],
  ["15-account", "/account", true],
  ["16-resale-market", "/events/nile-fc-vs-canal-united/resale", false],
  ["17-help", "/info/help", false],
];

for (const [name, path, auth] of shots) {
  if (auth) await context.addCookies([session]);
  else await context.clearCookies({ name: "mp_session" });
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log("captured", name);
}

await browser.close();
