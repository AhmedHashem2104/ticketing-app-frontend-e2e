import { expect, expectAccessible, signInAs, test } from "./support/fixtures";

/** Real-browser WCAG 2.1 AA scans (including colour contrast) of every main screen. */
const publicPages = [
  ["home", "/", "On sale now"],
  ["browse", "/events", "Matches"],
  ["match detail", "/events/nile-fc-vs-delta-sc", "Prices by zone"],
  ["concert detail", "/events/layla-nour-live-in-cairo", "Running order"],
  ["sign up", "/signup", "Create your account"],
  ["log in", "/login", "Log in"],
  ["forgot password", "/forgot-password", "Reset your password"],
  ["cinema listing", "/events?tab=cinema", "Cinema"],
  ["official resale market", "/events/nile-fc-vs-canal-united/resale", "Official resale"],
  ["help centre", "/info/help", "Help centre"],
  ["terms of sale", "/info/terms", "Terms of sale"],
] as const;

const signedInPages = [
  ["zones", "/events/nile-fc-vs-delta-sc/tickets", "Choose your zone"],
  ["stadium seats", "/events/nile-fc-vs-delta-sc/seats", "1 · Pick a block"],
  ["arena", "/events/layla-nour-live-in-cairo/tickets", "Venue map"],
  ["hall", "/events/nile-philharmonic-film-classics/tickets", "Choose your seats"],
  ["cinema", "/events/the-last-lighthouse/tickets", "2 · Pick your seats"],
  ["my tickets", "/tickets", "My tickets"],
  ["resale", "/resale", "Sell your ticket"],
  ["refunds", "/refunds", "Refunds"],
  ["fan id", "/fan-id", "Your Fan ID is ready"],
  ["account", "/account", "Your account"],
  ["transfers", "/transfers", "Ticket transfers"],
  ["notifications", "/notifications", "Notifications"],
] as const;

test.describe("Accessibility (axe, WCAG 2.1 AA)", () => {
  for (const [name, path, landmark] of publicPages) {
    test(`${name} page`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText(landmark, { exact: true }).first()).toBeVisible();
      await expectAccessible(page);
    });
  }

  for (const [name, path, landmark] of signedInPages) {
    test(`${name} page (signed in)`, async ({ page, request }) => {
      await signInAs(page, request);
      await page.goto(path);
      await expect(page.getByText(landmark, { exact: true }).first()).toBeVisible();
      await expectAccessible(page);
    });
  }

  test("keyboard users can skip to content and reach the primary action", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "On sale now" })).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });
});
