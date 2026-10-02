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

/** WCAG 2.1 AA scan of the current page (including colour contrast, which jsdom can't check). */
export async function expectAccessible(page: Page, options: { exclude?: string[] } = {}) {
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

/** Every test starts from a fresh, seeded mock API. */
export const test = base.extend<{ freshApi: void }>({
  freshApi: [
    async ({ request }, use) => {
      await resetApi(request);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
