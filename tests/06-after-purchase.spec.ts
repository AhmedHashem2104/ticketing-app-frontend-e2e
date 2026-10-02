import { expect, signInAs, test, WEB_URL, YOUSSEF } from "./support/fixtures";
import { openMyTickets } from "./support/pages";

test.describe("After purchase: tickets, transfers, resale and refunds", () => {
  test.beforeEach(async ({ page, request }) => {
    await signInAs(page, request);
  });

  test("my tickets lists stub tickets with the postponement alert", async ({ page }) => {
    await openMyTickets(page);
    await expect(page.getByRole("link", { name: "Upcoming (6)" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Delta SC vs Red Sea FC has been postponed.")).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(6);
    const matchActions = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("article", { name: /Nile FC vs Delta SC/ }) })
      .first();
    await expect(matchActions.getByText("Refund not available — sell on official resale instead")).toBeVisible();
    await page.getByRole("link", { name: "See refund" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Refunds" })).toBeVisible();
  });

  test("ticket wallet shows a live QR, locked QRs and pages through an order", async ({ page }) => {
    await openMyTickets(page);
    await page.getByRole("link", { name: /Show QR for The Last Lighthouse/ }).click();
    await expect(page.getByRole("img", { name: "Entry QR code" })).toBeVisible();
    await expect(page.getByText(/Refreshes in 0:\d{2} · screenshots won't scan/)).toBeVisible();

    await page.getByRole("button", { name: /Nile FC vs Delta SC/ }).click();
    await expect(page.getByText("Ticket 1 of 2")).toBeVisible();
    await expect(page.getByText("QR not available yet")).toBeVisible();
    await page.getByRole("button", { name: "Next ticket" }).click();
    await expect(page.getByText("Ticket 2 of 2")).toBeVisible();
    await expect(page.getByText("Youssef A.").first()).toBeVisible();
  });

  test("transfers a match ticket to another Fan ID, who accepts it", async ({ page, request, browser }) => {
    await openMyTickets(page);
    const row = page.getByRole("listitem").filter({ has: page.getByRole("article", { name: /Nile FC vs Delta SC.*Holder Youssef A\./ }) });
    await row.getByRole("link", { name: "Transfer" }).click();
    const form = page.getByRole("form", { name: "Transfer ticket" });
    await expect(form).toBeVisible();
    await form.getByLabel("Recipient’s Fan ID").fill("123");
    await form.getByRole("button", { name: "Send ticket" }).click();
    await expect(form.getByText("Enter their 12-digit Fan ID number")).toBeVisible();
    await form.getByLabel("Recipient’s Fan ID").fill("2210 4417 0000");
    await form.getByRole("button", { name: "Send ticket" }).click();
    await expect(form.getByText("There's no approved Fan ID with this number")).toBeVisible();
    await form.getByLabel("Recipient’s Fan ID").fill("2210 4417 1907");
    await form.getByRole("button", { name: "Send ticket" }).click();
    await expect(page).toHaveURL(/notice=transferred/);
    await expect(page.getByText("Ticket sent")).toBeVisible();
    // Until Youssef accepts, the ticket stays with Omar marked as pending.
    const pending = page.getByRole("listitem").filter({ has: page.getByRole("article", { name: /Holder Youssef A\./ }) });
    await expect(pending.getByText("Transfer pending — waiting for them to accept")).toBeVisible();
    await expect(pending.getByRole("button", { name: "Cancel transfer" })).toBeVisible();

    // Youssef signs in on his own phone, gets notified and accepts.
    const youssefContext = await browser.newContext({ baseURL: WEB_URL });
    const youssef = await youssefContext.newPage();
    await signInAs(youssef, request, YOUSSEF.phone, YOUSSEF.password);
    await youssef.goto("/tickets");
    await expect(youssef.getByText("Omar Khaled sent you a ticket for Nile FC vs Delta SC.")).toBeVisible();
    await youssef.getByRole("link", { name: "Review ticket" }).click();
    await expect(youssef.getByRole("heading", { level: 1, name: "Ticket transfers" })).toBeVisible();
    await youssef.getByRole("button", { name: "Accept ticket for Nile FC vs Delta SC" }).click();
    await expect(youssef.getByText("Ticket accepted — it's in My tickets now.")).toBeVisible();
    await youssef.goto("/tickets");
    await expect(youssef.getByRole("article", { name: /Nile FC vs Delta SC.*Holder Youssef A\./ })).toBeVisible();
    await youssefContext.close();

    // Omar's copy no longer works.
    await openMyTickets(page);
    await expect(page.getByRole("article")).toHaveCount(5);
  });

  test("the sender can cancel a pending transfer", async ({ page }) => {
    await openMyTickets(page);
    const row = page.getByRole("listitem").filter({ has: page.getByRole("article", { name: /Layla Nour Live/ }) }).first();
    await row.getByRole("link", { name: "Transfer" }).click();
    const form = page.getByRole("form", { name: "Transfer ticket" });
    await form.getByLabel("Friend’s phone or email").fill("friend@mail.com");
    await form.getByRole("button", { name: "Send ticket" }).click();
    await expect(page).toHaveURL(/notice=transferred/);
    const pending = page.getByRole("listitem").filter({ hasText: "Transfer pending" }).first();
    await pending.getByRole("button", { name: "Cancel transfer" }).click();
    await expect(page.getByText("Transfer pending — waiting for them to accept")).toHaveCount(0);
  });

  test("lists a ticket on official resale at up to face value, then withdraws it", async ({ page }) => {
    await page.goto("/resale");
    await expect(page.getByRole("heading", { level: 1, name: "Sell your ticket" })).toBeVisible();
    const option = page.getByLabel("Ticket to sell").locator("option", { hasText: "Youssef A.'s ticket" });
    await page.getByLabel("Ticket to sell").selectOption((await option.getAttribute("value"))!);
    const slider = page.getByRole("slider", { name: "Your price" });
    await expect(slider).toHaveAttribute("aria-valuemax", "250");
    await slider.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(slider).toHaveAttribute("aria-valuetext", "240 EGP");
    await expect(page.getByText("228 EGP")).toBeVisible();

    await page.getByRole("radio", { name: /Bank account/ }).click();
    await page.getByRole("button", { name: "List ticket for 240 EGP" }).click();
    await expect(page.getByText("Enter a valid Egyptian IBAN (EG + 27 digits)")).toBeVisible();
    await page.getByRole("textbox", { name: "IBAN" }).fill("EG380019000500000000263180002");
    await page.getByRole("button", { name: "List ticket for 240 EGP" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Listed for 240 EGP" })).toBeVisible();

    const listings = page.getByRole("region", { name: "Your listings" });
    await expect(listings.getByText("Listed")).toBeVisible();
    await listings.getByRole("button", { name: /^Withdraw/ }).click();
    await expect(page.getByText("Listing withdrawn — the ticket is yours again.")).toBeVisible();
    await expect(listings.getByText("Listed")).toHaveCount(0);
  });

  test("requests a concert refund step by step, tracks it, then cancels it", async ({ page }) => {
    await openMyTickets(page);
    await page
      .getByRole("listitem")
      .filter({ has: page.getByRole("article", { name: /Layla Nour Live/ }) })
      .first()
      .getByRole("link", { name: "Request a refund" })
      .click();

    await expect(page.getByRole("heading", { level: 1, name: "Request a refund" })).toBeVisible();
    const summary = page.getByRole("complementary", { name: "Refund summary" });
    await expect(summary).toContainText("1,800 EGP");
    await page.getByRole("checkbox", { name: "Golden Circle · Ticket 1" }).click();
    await page.getByRole("checkbox", { name: "Golden Circle · Ticket 2" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Choose at least one ticket.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Golden Circle · Ticket 1" }).click();
    await page.getByRole("checkbox", { name: "Golden Circle · Ticket 2" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Tell us why" })).toBeVisible();
    await page.getByRole("radio", { name: "I can’t attend anymore" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Choose refund method" })).toBeVisible();
    await page.getByRole("radio", { name: /Matchpass credit/ }).click();
    await expect(summary).toContainText("Credit bonus +5%");
    await expect(summary).toContainText("1,890 EGP");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Confirm your refund" })).toBeVisible();
    await page.getByRole("button", { name: "Submit refund request" }).click();
    await expect(page.getByText("Tick the box to confirm.")).toBeVisible();
    await page.getByRole("checkbox", { name: /once the refund is approved/ }).click();
    await page.getByRole("button", { name: "Submit refund request" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Refund requested" })).toBeVisible();
    await expect(page.getByText(/Reference RF-\d{4}-\d{4}/)).toBeVisible();
    await page.getByRole("link", { name: "Track refund" }).click();

    const card = page.getByRole("article", { name: "Layla Nour Live" });
    await expect(card).toContainText("In review");
    await expect(card).toContainText("1,890 EGP");
    await card.getByRole("button", { name: "Cancel request — keep my tickets" }).click();
    await expect(card).toContainText("Cancelled by you");
    await expect(card).toContainText("Your request was cancelled. Your 2 tickets are still valid.");
  });
});
