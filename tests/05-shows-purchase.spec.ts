import { API_URL, createUser, expect, signInAs, test, useSession } from "./support/fixtures";
import { CheckoutPage, ConfirmationPage, openMyTickets } from "./support/pages";

test.describe("Buying concert, hall and cinema tickets", () => {
  test("arena ticket types, promo code and mobile wallet payment", async ({ page, request }) => {
    await signInAs(page, request);
    await page.goto("/events/layla-nour-live-in-cairo");
    await page.getByRole("complementary", { name: "Buy tickets" }).getByRole("link", { name: "Get tickets" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Venue map" })).toBeVisible();
    const continueButton = page.getByRole("button", { name: "Continue to payment" });
    await expect(continueButton).toBeDisabled();
    await page.getByRole("button", { name: "VIP boxes & lounge" }).click();
    await expect(page.getByRole("button", { name: "VIP boxes & lounge" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "One more Golden Circle" }).click();
    await page.getByRole("button", { name: "One more Golden Circle" }).click();
    const summary = page.getByRole("region", { name: "Order summary" });
    await expect(summary).toContainText("2 tickets");
    await expect(summary).toContainText("1,850 EGP");
    await continueButton.click();

    const checkout = new CheckoutPage(page);
    await checkout.expectLoaded();
    await expect(page.getByText("Tickets go to")).toBeVisible();
    await page.getByLabel("Promo code").fill("NOPE99");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("main").getByRole("alert").filter({ hasText: "isn't valid" })).toBeVisible();
    await page.getByLabel("Promo code").fill("matchpass10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("MATCHPASS10 applied")).toBeVisible();
    await expect(checkout.total()).toContainText("1,670 EGP");

    await checkout.choose(/Mobile wallet/);
    await page.getByLabel("Wallet phone number").fill("123");
    await page.getByRole("button", { name: "Pay 1,670 EGP with wallet" }).click();
    await expect(page.getByText(/valid Egyptian mobile number/)).toBeVisible();
    await page.getByLabel("Wallet phone number").fill("10 1234 5482");
    await page.getByRole("button", { name: "Pay 1,670 EGP with wallet" }).click();

    await expect(page.getByText(/Approve the payment request we sent to your mobile wallet/)).toBeVisible();
    await new ConfirmationPage(page).expectConfirmed();
    await expect(page.getByRole("region", { name: "Order details" })).toContainText("Paid by mobile wallet •••• 482");
    await expect(page.getByRole("button", { name: "Add parking" })).toHaveCount(0);
  });

  test("concert hall seats with price filters, paid with a Fawry reference", async ({ page, request }) => {
    await signInAs(page, request);
    await page.goto("/events/nile-philharmonic-film-classics/tickets");
    await expect(page.getByRole("heading", { level: 1, name: "Nile Philharmonic: Film Classics" })).toBeVisible();
    const balconyFilter = page.getByRole("group", { name: "Show prices" }).getByRole("button", { name: "150 EGP", exact: true });
    await balconyFilter.click();
    await expect(balconyFilter).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("group", { name: "Row M" })
      .getByRole("button", { name: /Balcony, 150 EGP/ })
      .first()
      .click();
    const panel = page.getByRole("complementary", { name: "Prices and your seats" });
    await expect(panel).toContainText(/Balcony · Row M · Seat \d+/);
    await expect(panel).toContainText("175 EGP");
    await panel.getByRole("button", { name: "Continue" }).click();

    const checkout = new CheckoutPage(page);
    await checkout.expectLoaded();
    await checkout.choose(/Fawry reference/);
    await page.getByRole("button", { name: "Get Fawry reference" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Almost there" })).toBeVisible();
    const reference = (await page.getByText(/^\d{9}$/).textContent())!.trim();
    await expect(page.getByText(/Pay before /)).toBeVisible();

    // The fan pays at a Fawry outlet; Fawry notifies Matchpass and the tickets are issued.
    const paid = await request.post(`${API_URL}/__test__/fawry/${reference}/pay`);
    expect(paid.ok()).toBeTruthy();
    await page.reload();
    await new ConfirmationPage(page).expectConfirmed();
    await expect(page.getByRole("region", { name: "Order details" })).toContainText("Paid at Fawry");
  });

  test("cinema: changing showtime clears seats; VIP recliners cost more", async ({ page, request }) => {
    await signInAs(page, request);
    await page.goto("/cinema");
    await expect(page).toHaveURL(/\/events\?tab=cinema/);
    await expect(page.getByRole("heading", { level: 1, name: "Cinema" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Zamalek Nights/ })).toBeVisible();
    await page.getByRole("link", { name: /The Last Lighthouse/ }).click();
    await expect(page).toHaveURL(/\/events\/the-last-lighthouse\/tickets/);
    await expect(page.getByRole("heading", { level: 1, name: "The Last Lighthouse" })).toBeVisible();
    await page
      .getByRole("group", { name: "Row J" })
      .getByRole("button", { name: /VIP recliner/ })
      .first()
      .click();
    const panel = page.getByRole("complementary", { name: "Your showing" });
    await expect(panel).toContainText("VIP recliner");
    await page.getByRole("group", { name: "Showtime" }).getByRole("button", { name: /IMAX/ }).click();
    await expect(panel).toContainText("Tap green seats to choose.");
    await page
      .getByRole("group", { name: "Row J" })
      .getByRole("button", { name: /VIP recliner, 380 EGP/ })
      .first()
      .click();
    await expect(panel).toContainText("390 EGP");
    await panel.getByRole("button", { name: "Continue to payment" }).click();
    await new CheckoutPage(page).payByCard();
    await new ConfirmationPage(page).expectConfirmed();
  });

  test("concert tickets don't need a Fan ID", async ({ page, request }) => {
    const token = await createUser(request);
    await useSession(page, token);
    await page.goto("/events/the-felucca-band/tickets");
    await page.getByRole("button", { name: "One more General admission" }).click();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await new CheckoutPage(page).payByCard();
    await new ConfirmationPage(page).expectConfirmed();
    await openMyTickets(page);
    await expect(page.getByRole("article", { name: /The Felucca Band/ })).toBeVisible();
  });
});
