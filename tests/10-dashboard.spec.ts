import type { APIRequestContext, Page } from "@playwright/test";
import {
  API_URL,
  apiLogin,
  dash,
  DASHBOARD_URL,
  DEMO,
  expect,
  expectAccessible,
  expectNoHorizontalScroll,
  PENDING_FANS,
  signInAs,
  signInStaff,
  STAFF,
  STAFF_COOKIE,
  STAFF_PASSWORD,
  test,
} from "./support/fixtures";

const EVENTS = {
  layla: { id: "evt_layla_nour", slug: "layla-nour-live-in-cairo", title: "Layla Nour — Live in Cairo" },
  felucca: { id: "evt_felucca_band", slug: "the-felucca-band", title: "The Felucca Band" },
  film: { id: "evt_last_lighthouse", slug: "the-last-lighthouse", title: "The Last Lighthouse" },
};

/** The side menu (its accessible name is translated, so it is found by role). */
const nav = (page: Page) => page.getByRole("navigation").first();

/** A fan asks for a refund of one refundable ticket (through the API, as the fan site does). */
async function fanRequestsRefund(request: APIRequestContext) {
  const token = await apiLogin(request);
  const headers = { Authorization: `Bearer ${token}` };
  const tickets = (await (await request.get(`${API_URL}/tickets`, { headers })).json()) as {
    id: string;
    orderId: string;
    refundable: boolean;
  }[];
  const ticket = tickets.find((t) => t.refundable)!;
  const res = await request.post(`${API_URL}/refunds`, {
    headers,
    data: { orderId: ticket.orderId, ticketIds: [ticket.id], reason: "cant_attend", method: "credit", acknowledge: true },
  });
  expect(res.status()).toBe(201);
  return { token, ticketId: ticket.id, refund: (await res.json()) as { id: string; reference: string; amount: number } };
}

test.describe("Staff dashboard — sign-in and roles", () => {
  test("deep links ask staff to sign in, wrong passwords are refused, and sign-in returns to the page", async ({ page }) => {
    await page.goto(dash("/fan-ids"));
    await expect(page).toHaveURL(`${DASHBOARD_URL}/en/login?next=${encodeURIComponent("/en/fan-ids")}`);
    await expect(page.getByRole("heading", { level: 1, name: "Staff sign in" })).toBeVisible();

    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await page.getByLabel("Work email").fill(STAFF.operations.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Email or password is incorrect")).toBeVisible();

    await page.getByLabel("Password").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(dash("/fan-ids"));
    await expect(page.getByRole("heading", { level: 1, name: "Fan ID reviews" })).toBeVisible();
    await expect(page.getByText(STAFF.operations.name)).toBeVisible();

    // The staff token is an httpOnly, SameSite=Strict cookie — never readable by page scripts.
    const cookie = (await page.context().cookies(DASHBOARD_URL)).find((c) => c.name === STAFF_COOKIE)!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict" });
    expect(await page.evaluate(() => document.cookie)).not.toContain(STAFF_COOKIE);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en\/login$/);
    expect((await page.context().cookies(DASHBOARD_URL)).some((c) => c.name === STAFF_COOKIE)).toBe(false);
    await page.goto(dash("/"));
    await expect(page).toHaveURL(/\/en\/login$/);
  });

  test("each role gets its own menu, and other sections are refused even by URL", async ({ page, request }) => {
    const menus = {
      admin: [
        "Overview",
        "Events",
        "Orders",
        "Entry",
        "Fan ID reviews",
        "Refunds",
        "Fans",
        "Change requests",
        "Organisers",
        "Payouts",
        "Audit log",
      ],
      operations: ["Overview", "Events", "Orders", "Entry", "Fan ID reviews", "Refunds", "Fans"],
      organizer: ["Overview", "Events", "Orders", "Entry", "Change requests", "Payouts"],
    } as const;
    for (const role of ["admin", "operations", "organizer"] as const) {
      await page.context().clearCookies();
      await signInStaff(page, request, STAFF[role].email);
      await page.goto(dash("/"));
      await expect(page.getByRole("heading", { level: 1, name: `Hello, ${STAFF[role].name.split(" ")[0]}` })).toBeVisible();
      const links = (await nav(page).getByRole("link").allInnerTexts()).map((text) => text.replace(/\s*\d+\s*waiting$|\n.*$/s, "").trim());
      expect(links, role).toEqual([...menus[role]]);
    }
    // Hany (Nile FC) types the audit log's address.
    await page.goto(dash("/audit"));
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await expect(page.getByRole("table", { name: "Audit log" })).toHaveCount(0);
  });

  test("organisers only see their own events and sales", async ({ page, request }) => {
    await signInStaff(page, request, STAFF.organizer.email);
    await page.goto(dash("/events"));
    const table = page.getByRole("table", { name: "Events" });
    await expect(table.getByRole("row").nth(1)).toBeVisible();
    const titles = await table.locator("tbody tr").allInnerTexts();
    expect(titles.length).toBeGreaterThan(0);
    for (const row of titles) expect(row).toMatch(/Nile FC/);
    await expect(table).not.toContainText("Layla Nour");
    // Another organiser's event is not found for them.
    await page.goto(dash(`/events/${EVENTS.layla.id}`));
    await expect(page.getByRole("alert")).toBeVisible();
  });
});

test.describe("Staff dashboard — fan desk", () => {
  test("operations approves a Fan ID and rejects another with a reason; the fans are told", async ({ page, browser, request }) => {
    await signInStaff(page, request, STAFF.operations.email);
    await page.goto(dash("/fan-ids"));
    await expect(page.getByRole("main").getByText("3 waiting")).toBeVisible();
    await expect(nav(page).getByRole("link", { name: /Fan ID reviews/ })).toContainText("3");

    const laila = page.getByRole("article", { name: PENDING_FANS.laila.name });
    await expect(laila.getByRole("img", { name: `ID document of ${PENDING_FANS.laila.name}` })).toBeVisible();
    await laila.getByRole("button", { name: "Approve Fan ID" }).click();
    await expect(laila).toHaveCount(0);
    await expect(page.getByRole("main").getByText("2 waiting")).toBeVisible();

    const ahmed = page.getByRole("article", { name: PENDING_FANS.ahmed.name });
    await expect(ahmed.getByText("Photo slightly blurred")).toBeVisible();
    await ahmed.getByRole("button", { name: "Reject" }).click();
    const dialog = page.getByRole("dialog", { name: `Reject ${PENDING_FANS.ahmed.name}'s Fan ID?` });
    await dialog.getByRole("button", { name: "Reject Fan ID" }).click();
    await expect(dialog.getByText("Give a reason (at least 5 characters)")).toBeVisible();
    await dialog.getByRole("textbox", { name: /Message to the fan/ }).fill("The ID photo is too blurry to read.");
    await dialog.getByRole("button", { name: "Reject Fan ID" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("main").getByText("1 waiting")).toBeVisible();

    // Laila, on the fan site in her own browser, sees the approval.
    const fan = await browser.newContext();
    const fanPage = await fan.newPage();
    await signInAs(fanPage, request, PENDING_FANS.laila.phone, "matchpass123");
    await fanPage.goto("/en/notifications");
    await expect(fanPage.getByText("Your Fan ID is approved")).toBeVisible();
    await fanPage.goto("/en/fan-id");
    await expect(fanPage.getByText(/approved/i).first()).toBeVisible();
    await fan.close();

    // Ahmed is told why, and can apply again.
    const ahmedToken = await apiLogin(request, PENDING_FANS.ahmed.phone, "matchpass123");
    const notes = await (await request.get(`${API_URL}/me/notifications`, { headers: { Authorization: `Bearer ${ahmedToken}` } })).json();
    expect(notes.items[0]).toMatchObject({ title: "We couldn't approve your Fan ID" });
    expect(notes.items[0].body).toContain("too blurry");
    const me = await (await request.get(`${API_URL}/me`, { headers: { Authorization: `Bearer ${ahmedToken}` } })).json();
    expect(me.fanId.status).toBe("none");
  });

  test("a rejected refund keeps the tickets; an approved one cancels them and credits the fan", async ({ page, request }) => {
    const first = await fanRequestsRefund(request);
    await signInStaff(page, request, STAFF.operations.email);
    await page.goto(dash("/refunds"));
    const card = page.getByRole("article", { name: new RegExp(first.refund.reference) });
    await expect(card).toContainText("Omar Khaled");
    await card.getByRole("button", { name: "Reject" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("The refund window for this event has closed.");
    await dialog.getByRole("button", { name: "Reject refund" }).click();
    await expect(card).toHaveCount(0);

    // The fan sees the decision and the reason; the ticket is valid again.
    await signInAs(page, request);
    await page.goto("/en/refunds");
    const fanCard = page.getByRole("article").filter({ hasText: first.refund.reference });
    await expect(fanCard).toContainText("The refund window for this event has closed.");
    const ticket = await (
      await request.get(`${API_URL}/tickets/${first.ticketId}`, { headers: { Authorization: `Bearer ${first.token}` } })
    ).json();
    expect(ticket.status).toBe("valid");

    // Second request, approved.
    const second = await fanRequestsRefund(request);
    await page.goto(dash("/refunds"));
    await page
      .getByRole("article", { name: new RegExp(second.refund.reference) })
      .getByRole("button", { name: "Approve refund" })
      .click();
    await expect(page.getByRole("article", { name: new RegExp(second.refund.reference) })).toHaveCount(0);
    await page.getByRole("button", { name: "Refunded" }).click();
    await expect(page.getByRole("article", { name: new RegExp(second.refund.reference) })).toContainText("Refunded");
    const me = await (await request.get(`${API_URL}/me`, { headers: { Authorization: `Bearer ${second.token}` } })).json();
    expect(me.credit).toBe(second.refund.amount);
  });

  test("orders and fans can be looked up; an admin suspends a tout and reactivates them", async ({ page, request }) => {
    await signInStaff(page, request, STAFF.admin.email);
    await page.goto(dash("/orders"));
    await page.getByRole("searchbox", { name: "Search orders" }).fill("Omar");
    const orders = page.getByRole("table", { name: "Orders" });
    await expect(orders.locator("tbody tr").first()).toContainText("Omar");

    await page.goto(dash("/fans"));
    await page.getByRole("searchbox", { name: "Search fans" }).fill("omar");
    const row = page.getByRole("table", { name: "Fans" }).locator("tbody tr").filter({ hasText: DEMO.name });
    await row.getByRole("button", { name: "Suspend" }).click();
    const dialog = page.getByRole("dialog", { name: `Suspend ${DEMO.name}?` });
    await dialog.getByRole("textbox").fill("Reselling tickets above face value.");
    await dialog.getByRole("button", { name: "Suspend account" }).click();
    await expect(row).toContainText("Suspended");

    // The fan can't sign in any more.
    const blocked = await request.post(`${API_URL}/auth/login`, { data: { phone: DEMO.phone, password: DEMO.password } });
    expect(blocked.status()).toBe(403);

    await row.getByRole("button", { name: "Reactivate" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Reactivate account" }).click();
    await expect(row).toContainText("Active");
    await apiLogin(request);

    await page.goto(dash("/audit"));
    const log = page.getByRole("table", { name: "Audit log" });
    await expect(log.locator("tbody tr").first()).toContainText("Reactivated account");
    await expect(log).toContainText("Suspended account");
  });
});

test.describe("Staff dashboard — events and match day", () => {
  test("an admin cancels an event: every ticket is refunded and fans are told", async ({ page, request }) => {
    await signInStaff(page, request, STAFF.admin.email);
    await page.goto(dash("/events"));
    await page.getByRole("link", { name: EVENTS.layla.title }).click();
    await expect(page.getByRole("heading", { level: 1, name: EVENTS.layla.title })).toBeVisible();
    await expect(page.getByRole("list", { name: "Sales by zone" })).toBeVisible();

    await page.getByRole("button", { name: "Cancel event" }).click();
    const dialog = page.getByRole("dialog", { name: "Cancel this event?" });
    await dialog.getByRole("textbox", { name: /Message to ticket holders/ }).fill("The artist is unwell and the tour is off.");
    await dialog.getByRole("button", { name: "Cancel event" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel event" })).toHaveCount(0);

    await signInAs(page, request);
    await page.goto("/en/tickets");
    await expect(page.getByText(`${EVENTS.layla.title} has been cancelled.`)).toBeVisible();
    await page.goto(`/en/events/${EVENTS.layla.slug}`);
    await expect(page.getByRole("complementary", { name: "Buy tickets" }).getByRole("link", { name: /Cancelled/ })).toBeVisible();

    await page.goto(dash("/audit"));
    await expect(page.getByRole("table", { name: "Audit log" }).locator("tbody tr").first()).toContainText("Cancelled event");
  });

  test("an organiser asks to postpone; an admin approves and the event is postponed", async ({ page, browser, request }) => {
    await signInStaff(page, request, STAFF.promoter.email);
    await page.goto(dash(`/events/${EVENTS.felucca.id}`));
    await expect(page.getByRole("button", { name: "Cancel event" })).toHaveCount(0);
    await page.getByRole("button", { name: "Ask to postpone" }).click();
    const dialog = page.getByRole("dialog", { name: "Ask to postpone this event?" });
    await dialog.getByRole("textbox", { name: /Why\?/ }).fill("The amphitheatre roof needs repairs first.");
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText(`${STAFF.promoter.name} asked to postpone this event. An admin will decide.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask to postpone" })).toHaveCount(0);

    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await signInStaff(adminPage, request, STAFF.admin.email);
    await adminPage.goto(dash("/requests"));
    const card = adminPage.getByRole("article", { name: EVENTS.felucca.title });
    await expect(card).toContainText("The amphitheatre roof needs repairs first.");
    await card.getByRole("button", { name: "Approve and postpone event" }).click();
    await expect(card).toContainText("Approved");
    await admin.close();

    const event = await (await request.get(`${API_URL}/events/${EVENTS.felucca.slug}`)).json();
    expect(event.status).toBe("postponed");
  });

  test("the gate scanner admits a real ticket once and refuses copies", async ({ page, request }) => {
    // Omar's cinema ticket QR, as his phone shows it.
    const token = await apiLogin(request);
    const headers = { Authorization: `Bearer ${token}` };
    const tickets = (await (await request.get(`${API_URL}/tickets`, { headers })).json()) as {
      id: string;
      eventId: string;
      qrReady: boolean;
    }[];
    const film = tickets.find((t) => t.eventId === EVENTS.film.id && t.qrReady)!;
    const qr = (await (await request.get(`${API_URL}/tickets/${film.id}/qr`, { headers })).json()) as { token: string };

    await signInStaff(page, request, STAFF.operations.email);
    await page.goto(dash(`/entry?event=${EVENTS.film.id}`));
    await expect(page.getByRole("combobox", { name: "Event" })).toHaveValue(EVENTS.film.id);
    await page.getByRole("combobox", { name: "Gate" }).selectOption("Gate 2");

    await page.getByRole("textbox", { name: "Ticket QR" }).fill(qr.token);
    await page.getByRole("button", { name: "Check ticket" }).click();
    await expect(page.getByRole("status")).toContainText("Let in");
    await expect(page.getByRole("meter", { name: "Gate 2" })).toBeVisible();

    await page.getByRole("textbox", { name: "Ticket QR" }).fill(qr.token);
    await page.getByRole("button", { name: "Check ticket" }).click();
    await expect(page.getByRole("status")).toContainText("Do not let in");
    await expect(page.getByRole("status")).toContainText("Already used");

    await page.getByRole("textbox", { name: "Ticket QR" }).fill(`${qr.token.slice(0, -3)}abc`);
    await page.getByRole("button", { name: "Check ticket" }).press("Enter");
    await expect(page.getByRole("status")).toContainText("Not a Matchpass ticket");
    await expect(page.getByRole("table", { name: "Latest scans" }).locator("tbody tr")).toHaveCount(3);
  });
});

test.describe("Staff dashboard — language, accessibility and devices", () => {
  test("works in Arabic, right to left, with dashboard data translated", async ({ page, request }) => {
    await signInStaff(page, request, STAFF.admin.email);
    await page.goto(dash("/", "ar"));
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "أهلًا، Nadia" })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "سجل العمليات" })).toBeVisible();
    await expect(page.getByText("إيرادات التذاكر").first()).toBeVisible();
    await page.goto(dash("/fan-ids", "ar"));
    await expect(page.getByRole("heading", { level: 1, name: "مراجعة بطاقات المشجعين" })).toBeVisible();
    await expect(page.getByText("تطابق الوجه أقل من الحد المطلوب")).toBeVisible();
    await page.getByRole("link", { name: "Switch to English" }).click();
    await expect(page).toHaveURL(dash("/fan-ids"));
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("every admin screen meets WCAG 2.1 AA", async ({ page, request }) => {
    await page.goto(dash("/login"));
    await expectAccessible(page);
    await signInStaff(page, request, STAFF.admin.email);
    for (const path of [
      "/",
      "/events",
      `/events/${EVENTS.layla.id}`,
      "/orders",
      "/entry",
      "/fan-ids",
      "/refunds",
      "/fans",
      "/requests",
      "/organizers",
      "/payouts",
      "/audit",
    ]) {
      await page.goto(dash(path));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectAccessible(page);
    }
    await page.goto(dash("/", "ar"));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAccessible(page);
  });

  test("on a phone the menu folds away and nothing scrolls sideways", async ({ browser, request }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await signInStaff(page, request, STAFF.operations.email);
    await page.goto(dash("/"));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page
      .locator("#dashboard-menu")
      .getByRole("link", { name: /Refunds/ })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Refunds" })).toBeVisible();
    for (const path of ["/orders", "/fan-ids", "/entry"]) {
      await page.goto(dash(path));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
    await context.close();
  });

  test("the dashboard's server only proxies staff endpoints and sends a strict CSP", async ({ page, request }) => {
    const res = await page.goto(dash("/login"));
    expect(res!.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(res!.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect((await request.get(`${DASHBOARD_URL}/api/me`)).status()).toBe(404);
    expect((await request.get(`${DASHBOARD_URL}/api/staff/me`)).status()).toBe(401);
    const crossSite = await request.post(`${DASHBOARD_URL}/api/staff/fans/usr_omar/suspend`, {
      headers: { origin: "https://evil.example" },
      data: { reason: "nope nope" },
    });
    expect(crossSite.status()).toBe(403);
  });
});
