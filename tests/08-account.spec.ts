import { API_URL, DEMO, expect, KARIM, signInAs, test, YOUSSEF } from "./support/fixtures";
import { CheckoutPage, ConfirmationPage, openAccountMenu, openMyTickets } from "./support/pages";

test.describe("Account, security and lifecycle", () => {
  test("forgot password: SMS code, new password, signed in — the old password stops working", async ({ page, request }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
    await page.getByLabel("Mobile number").fill(DEMO.phone);
    await page.getByRole("button", { name: "Send reset code" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
    await expect(page.getByText("+20 10•• ••• 482")).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("brandnewpass");
    await page.getByLabel("Confirm new password").fill("different1");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Passwords don't match")).toBeVisible();

    // Fill each digit box directly (independent of where focus lands after the validation error).
    for (const [i, digit] of [...DEMO.otp].entries()) await page.getByLabel(`Digit ${i + 1}`).fill(digit);
    await page.getByLabel("Confirm new password").fill("brandnewpass");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/tickets$/);
    await expect(page.getByRole("button", { name: "Account menu: Omar Khaled" })).toBeVisible();

    const oldLogin = await request.post(`${API_URL}/auth/login`, { data: { phone: DEMO.phone, password: DEMO.password } });
    expect(oldLogin.status()).toBe(401);
  });

  test("too many wrong passwords lock the number for a while", async ({ page }) => {
    await page.goto("/login");
    // Submit buttons stay disabled until the page is interactive (hydrated).
    await expect(page.getByRole("button", { name: "Log in" })).toBeEnabled();
    for (let i = 0; i < 5; i += 1) {
      await page.getByLabel("Mobile number").fill(DEMO.phone);
      await page.getByLabel("Password").fill(`wrong-password-${i}`);
      await page.getByRole("button", { name: "Log in" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toHaveText("Mobile number or password is incorrect");
    }
    await page.getByLabel("Password").fill(DEMO.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Too many attempts");
  });

  test("signs out from the account menu and protected pages ask to log in again", async ({ page, request }) => {
    await signInAs(page, request);
    await page.goto("/");
    const menu = await openAccountMenu(page);
    await expect(menu.getByRole("menuitem", { name: "My tickets" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    expect((await page.context().cookies()).some((c) => c.name === "mp_session")).toBe(false);
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login\?next=%2Ftickets/);
  });

  test("account page: preferences are saved and linked fans managed", async ({ page, request }) => {
    await signInAs(page, request, YOUSSEF.phone, YOUSSEF.password);
    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
    await expect(page.getByText("2210 4417 1907")).toBeVisible();

    const marketing = page.getByRole("switch", { name: "News and offers" });
    await expect(marketing).not.toBeChecked();
    await marketing.click();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("switch", { name: "News and offers" })).toBeChecked();

    const link = page.getByRole("form", { name: "Link a fan" });
    await link.getByLabel(/Their full name/).fill("Omar Khaled");
    await link.getByLabel(/Their Fan ID number/).fill("2210 4417 4821");
    await link.getByRole("button", { name: "Link fan" }).click();
    await expect(page.getByText("Fan ID •••• 4821")).toBeVisible();
    await page.getByRole("button", { name: "Unlink Omar K." }).click();
    await expect(page.getByText("Fan ID •••• 4821")).toHaveCount(0);
  });

  test("notification bell shows new updates and marks them read", async ({ page, request }) => {
    await signInAs(page, request);
    await page.goto("/");
    await page.getByRole("button", { name: "Notifications, 1 unread" }).click();
    await expect(page.getByRole("link", { name: /Delta SC vs Red Sea FC has been postponed/ })).toBeVisible();
    await page.getByRole("button", { name: "Mark all as read" }).click();
    await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  });

  test("buys a ticket for a sold-out match on official resale", async ({ page, request }) => {
    await signInAs(page, request, YOUSSEF.phone, YOUSSEF.password);
    await page.goto("/events/nile-fc-vs-canal-united");
    await page.getByRole("complementary", { name: "Buy tickets" }).getByRole("link", { name: "Sold out — buy on official resale" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Official resale" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Resale tickets" }).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Buy W2 · Row D · Seat 7 for 240 EGP" }).click();

    const checkout = new CheckoutPage(page);
    await checkout.expectLoaded();
    await expect(checkout.total()).toContainText("Official resale · W2 · Row D · Seat 7 × 1");
    await checkout.payByCard();
    await new ConfirmationPage(page).expectConfirmed();
    await expect(page.getByRole("region", { name: "Order details" })).toContainText("Youssef A.");

    await openMyTickets(page);
    await expect(page.getByRole("article", { name: /Nile FC vs Canal United.*Holder Youssef A\./ })).toBeVisible();

    // The seller is told, and the listing is gone for everyone else.
    const karim = await (await request.post(`${API_URL}/auth/login`, { data: { phone: KARIM.phone, password: KARIM.password } })).json();
    const notes = await (await request.get(`${API_URL}/me/notifications`, { headers: { Authorization: `Bearer ${karim.token}` } })).json();
    expect(notes.items[0].title).toBe("Your resale ticket sold");
    const offers = await (await request.get(`${API_URL}/events/nile-fc-vs-canal-united/resale`)).json();
    expect(offers).toHaveLength(1);
  });

  test("a cancelled event is refunded automatically and fans are told", async ({ page, request }) => {
    await signInAs(page, request);
    const cancel = await request.post(`${API_URL}/__test__/events/layla-nour-live-in-cairo/cancel`);
    expect(cancel.ok()).toBeTruthy();

    await openMyTickets(page);
    await expect(page.getByText("Layla Nour — Live in Cairo has been cancelled.")).toBeVisible();
    await expect(page.getByRole("article", { name: /Layla Nour Live/ })).toHaveCount(0);
    await page.getByRole("link", { name: "See refund" }).first().click();
    const refund = page.getByRole("article", { name: "Layla Nour — Live in Cairo" });
    await expect(refund).toContainText("Refunded");
    await expect(refund).toContainText("1,850 EGP");

    await page.goto("/events/layla-nour-live-in-cairo");
    await expect(page.getByRole("complementary", { name: "Buy tickets" }).getByRole("link", { name: /Cancelled/ })).toBeVisible();
  });

  test("the entry QR is signed and rotates — the gate accepts it and rejects copies", async ({ page, request }) => {
    await signInAs(page, request);
    await openMyTickets(page);
    await page.getByRole("link", { name: /Show QR for The Last Lighthouse/ }).click();
    await expect(page.getByRole("img", { name: "Entry QR code" })).toBeVisible();

    // What the scanner reads is the token behind the QR; fetch it the way the page does (via the BFF, with the cookie).
    const ticketId = page.url().split("/tickets/")[1]!;
    const qr = await (await page.request.get(`/api/tickets/${ticketId}/qr`)).json();
    const ok = await (await request.post(`${API_URL}/gate/verify`, { data: { token: qr.token } })).json();
    expect(ok).toMatchObject({ valid: true, reason: "ok", holderName: "Omar K." });
    const forged = await (await request.post(`${API_URL}/gate/verify`, { data: { token: `${qr.token.slice(0, -3)}abc` } })).json();
    expect(forged).toMatchObject({ valid: false, reason: "tampered" });
  });

  test("pages send a strict Content Security Policy with a fresh nonce", async ({ page }) => {
    const first = await page.goto("/");
    const csp = first!.headers()["content-security-policy"]!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    const second = await page.goto("/events");
    expect(second!.headers()["content-security-policy"]).not.toBe(csp);
    await expect(page.getByRole("heading", { level: 1, name: "Matches" })).toBeVisible();
  });
});
