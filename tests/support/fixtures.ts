import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

export const WEB_URL = `http://localhost:${process.env.WEB_PORT ?? 3100}`;
/** The mock API itself (tests use it for setup and test-only hooks; the browser only talks to the web app). */
export const API_URL = `http://localhost:${process.env.API_PORT ?? 4100}/api`;

export const DEMO = { phone: "1012345482", password: "matchpass123", otp: "123456", name: "Omar Khaled" };
/** Youssef: a second real account (Fan ID 2210 4417 1907) for transfers and resale purchases. */
export const YOUSSEF = { phone: "1098765432", password: "matchpass123", name: "Youssef Adel" };
/** Karim: sells tickets on official resale and has no derby ticket. */
export const KARIM = { phone: "1155555555", password: "matchpass123", fanId: "2210 4417 5555" };

/** Valid and declined test cards accepted by the mock payment provider's hosted page. */
export const CARDS = { valid: "4242 4242 4242 4242", declined: "4000 0000 0000 0002", badLuhn: "4242 4242 4242 4241" };

export const SESSION_COOKIE = "mp_session";

export async function resetApi(request: APIRequestContext) {
  const res = await request.post(`${API_URL}/__test__/reset`);
  expect(res.ok(), "mock API must expose the test reset route").toBeTruthy();
}

export async function apiLogin(request: APIRequestContext, phone = DEMO.phone, password = DEMO.password) {
  const res = await request.post(`${API_URL}/auth/login`, { data: { phone, password } });
  expect(res.ok(), `login as ${phone}`).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

/** Gives the browser a session the way the app's BFF does: an httpOnly cookie (scripts can't read it). */
export async function useSession(page: Page, token: string) {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: token, url: WEB_URL, httpOnly: true, sameSite: "Lax" }]);
}

/** Signs in through the API and stores the session cookie. */
export async function signInAs(page: Page, request: APIRequestContext, phone = DEMO.phone, password = DEMO.password) {
  const token = await apiLogin(request, phone, password);
  await useSession(page, token);
  return token;
}

/** Creates and verifies a brand new account (no Fan ID) through the API. */
export async function createUser(request: APIRequestContext, phone = "1112345678", fullName = "Sara Ahmed") {
  const signup = await request.post(`${API_URL}/auth/signup`, { data: { fullName, phone, password: "supersecret", acceptTerms: true } });
  expect(signup.ok()).toBeTruthy();
  const { verificationId } = await signup.json();
  const verify = await request.post(`${API_URL}/auth/verify`, { data: { verificationId, code: DEMO.otp } });
  return ((await verify.json()) as { token: string }).token;
}

/* ---------- Staff dashboard ---------- */

export const DASHBOARD_URL = `http://localhost:${process.env.DASHBOARD_PORT ?? 3101}`;
/** A dashboard page in a language: `dash("/fan-ids")` → `http://localhost:3101/en/fan-ids`. */
export const dash = (path = "/", lang: "en" | "ar" = "en") => `${DASHBOARD_URL}/${lang}${path === "/" ? "" : path}`;

export const STAFF_PASSWORD = "matchpass-staff";
/** Seeded staff, one per role (the promoter is a second organiser, Nile Live Productions). */
export const STAFF = {
  admin: { email: "admin@matchpass.app", name: "Nadia Farouk" },
  operations: { email: "ops@matchpass.app", name: "Tarek Mansour" },
  organizer: { email: "hany@nilefc.example", name: "Hany Saleh" },
  promoter: { email: "dina@nilelive.example", name: "Dina Adel" },
} as const;
/** Fans whose Fan ID waits for a manual review (password `matchpass123`). */
export const PENDING_FANS = {
  laila: { id: "usr_laila", phone: "1023456789", name: "Laila Hassan" },
  ahmed: { id: "usr_ahmed", phone: "1234567890", name: "Ahmed Fathy" },
  salma: { id: "usr_salma", phone: "1534567891", name: "Salma Nasser" },
} as const;

export const STAFF_COOKIE = "mp_staff";

export async function staffApiLogin(request: APIRequestContext, email: string) {
  const res = await request.post(`${API_URL}/staff/auth/login`, { data: { email, password: STAFF_PASSWORD } });
  expect(res.ok(), `staff login as ${email}`).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

/** Signs a staff member in the way the dashboard's BFF does: an httpOnly, SameSite=Strict cookie. */
export async function signInStaff(page: Page, request: APIRequestContext, email: string) {
  const token = await staffApiLogin(request, email);
  await page.context().addCookies([{ name: STAFF_COOKIE, value: token, url: DASHBOARD_URL, httpOnly: true, sameSite: "Strict" }]);
  return token;
}

/** Fails if the page scrolls sideways (layout wider than the screen). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(1);
}

/** WCAG 2.1 AA scan of the current page (including colour contrast, which jsdom can't check). */
export async function expectAccessible(page: Page, options: { exclude?: string[] } = {}) {
  // Colour transitions (e.g. a button turning from its pre-hydration disabled look to its real colour)
  // would be measured mid-fade; wait until finite animations settle. Endless ones (spinners) are ignored.
  await page
    .waitForFunction(
      () => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
      undefined,
      { timeout: 3_000 },
    )
    .catch(() => undefined);
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
  const results = await builder.analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} → ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
  expect(summary, "axe violations").toEqual([]);
}

/** Browser errors that mean the page itself is broken (uncaught exceptions, React hydration/render errors). */
const CLIENT_ERROR = /Minified React error|Hydration failed|hydrat|did not match|Uncaught/i;

/**
 * Every test starts from a fresh, seeded mock API, and fails if the page throws or React reports a
 * hydration or render error — problems a fan wouldn't see as a failed step but that break the page.
 */
export const test = base.extend<{ freshApi: void; clientErrors: void }>({
  freshApi: [
    async ({ request }, use) => {
      await resetApi(request);
      await use();
    },
    { auto: true },
  ],
  clientErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && CLIENT_ERROR.test(message.text())) errors.push(`console: ${message.text().slice(0, 300)}`);
      });
      await use();
      expect(errors, "client-side errors on the page").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
