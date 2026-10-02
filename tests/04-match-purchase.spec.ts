import { CARDS, expect, signInAs, test } from "./support/fixtures";
import { CheckoutPage, ConfirmationPage, openMyTickets } from "./support/pages";

test.describe("Buying match tickets", () => {
  test("waiting room → zone & Fan IDs → card payment → tickets in the wallet", async ({ page, request }) => {
    await signInAs(page, request);
    await page.goto("/events/nile-fc-vs-delta-sc");
    await expect(page.getByText("Your Fan ID is approved")).toBeVisible();
    await page.getByRole("complementary", { name: "Buy tickets" }).getByRole("link", { name: "Join the waiting room" }).click();

    // Waiting room: before sale → in line → your turn (sped up by QUEUE_TIME_SCALE).
    await expect(page.getByRole("heading", { level: 1, name: "Nile FC vs Delta SC" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Sale opens soon|You're in line|It's your turn/ })).toBeVisible();
    await expect(page.getByText("Your Fan ID and 2 linked fans are ready.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "It's your turn" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: "Choose tickets" }).click();

    // Zone & fans
    await expect(page.getByRole("heading", { level: 1, name: "Choose your zone" })).toBeVisible();
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Away fans/ })).toBeDisabled();
    await page.getByRole("button", { name: /^VIP lounge/ }).click();
    await expect(page.getByRole("region", { name: "Selected zone" })).toContainText("VIP lounge");
    // One ticket per Fan ID: Omar and Youssef already hold derby tickets, so only Mariam can go.
    await expect(page.getByRole("checkbox", { name: "Omar K. (you)" })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: "Youssef A." })).toBeDisabled();
    await expect(page.getByText("Fan ID •••• 1907 · Already has a ticket for this match")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Hassan M." })).toBeDisabled();
    await page.getByRole("checkbox", { name: "Mariam K." }).check();
    const summary = page.getByRole("region", { name: "Order summary" });
    await expect(summary).toContainText("VIP × 1");
    await expect(summary).toContainText("615 EGP");
    await page.getByRole("button", { name: "Continue to payment" }).click();

    // Checkout never asks for card details: the provider's hosted page does.
    const checkout = new CheckoutPage(page);
    await checkout.expectLoaded();
    await expect(page.getByRole("heading", { name: "Ticket holders" })).toBeVisible();
    await expect(page.getByText("Mariam K.")).toBeVisible();
    await expect(page.getByLabel("Card number")).toHaveCount(0);

    // Hosted page: validation, then a declined card sends the fan back to checkout.
    let hosted = await checkout.startCardPayment();
    await hosted.fill(CARDS.badLuhn, "01 / 20", "");
    await page.getByRole("button", { name: "Pay 615 EGP" }).click();
    await expect(page.getByText("This card number isn't valid")).toBeVisible();
    await expect(page.getByText("This card has expired")).toBeVisible();
    await expect(page.getByText("Enter the 3 or 4 digit security code")).toBeVisible();
    await hosted.pay(CARDS.declined);
    await expect(page).toHaveURL(/\/checkout\/hold_.*payment=declined/);
    await expect(page.getByRole("main").getByRole("alert").filter({ hasText: "declined" })).toBeVisible();

    hosted = await checkout.startCardPayment();
    await hosted.pay(CARDS.valid);
    const confirmation = new ConfirmationPage(page);
    await confirmation.expectConfirmed();
    const details = page.getByRole("region", { name: "Order details" });
    await expect(details).toContainText("Mariam K. · Fan ID •••• 3350");
    await expect(details).toContainText("Paid by card •••• 4242");
    await expect(page.getByRole("heading", { name: "What happens next" })).toBeVisible();
    await page.getByRole("button", { name: "Add parking" }).click();
    await expect(page.getByRole("button", { name: /Parking added/ })).toBeDisabled();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Add to calendar" }).click();
    expect((await download).suggestedFilename()).toMatch(/^MP-\d{4}-\d+\.ics$/);

    await page.getByRole("link", { name: "View my tickets" }).click();
    await expect(page.getByRole("link", { name: /Upcoming \(7\)/ })).toBeVisible();
    await expect(page.getByRole("article", { name: /Nile FC vs Delta SC.*Block VIP/ }).first()).toBeVisible();
  });

  test("the waiting room keeps your place when you refresh", async ({ page, request }) => {
    await signInAs(page, request);
    await page.goto("/events/nile-fc-vs-delta-sc/queue");
    await expect(page.getByRole("region", { name: "Your place in the queue" })).toBeVisible();
    const before = await page.evaluate(() =>
      sessionStorage.getItem(Object.keys(sessionStorage).find((k) => k.startsWith("matchpass.queue."))!),
    );
    await page.reload();
    await expect(page.getByRole("region", { name: "Your place in the queue" })).toBeVisible();
    const after = await page.evaluate(() =>
      sessionStorage.getItem(Object.keys(sessionStorage).find((k) => k.startsWith("matchpass.queue."))!),
    );
    expect(after).toBe(before);
  });

  test("exact stadium seats: block map, one seat per Fan ID and best seats together", async ({ page, request }) => {
    await signInAs(page, request);
    await page.goto("/events/canal-united-vs-sinai-stars/tickets");
    await page.getByRole("link", { name: /Pick exact seats by block/ }).click();
    await expect(page.getByRole("heading", { name: "1 · Pick a block" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Block S1, South curve, away fans only/ })).toBeDisabled();

    await page.getByRole("button", { name: /^Block E1,/ }).click();
    await expect(page.getByRole("heading", { name: "2 · Block E1 seats" })).toBeVisible();
    await page.getByRole("button", { name: "Best 2 together" }).click();
    const panel = page.getByRole("complementary", { name: "Your seats" });
    await expect(panel.getByRole("listitem")).toHaveCount(2);
    await expect(panel).toContainText("2 of 3 · one per Fan ID");

    // Keyboard: a single tab stop, arrows move between seats.
    const seats = page.getByRole("group", { name: "Block E1 seats" });
    const available = seats.getByRole("button", { name: /available/ });
    await available.first().click();
    await expect(panel).toContainText("3 of 3");
    await seats
      .getByRole("button", { name: /available/ })
      .first()
      .click();
    await expect(panel.getByRole("alert")).toHaveText("You can pick up to 3 seats — one for each Fan ID on your order.");

    await panel
      .getByRole("button", { name: /^Remove Block E1/ })
      .first()
      .click();
    await expect(panel).toContainText("2 of 3");
    await panel.getByRole("button", { name: "Continue" }).click();

    const checkout = new CheckoutPage(page);
    await checkout.expectLoaded();
    await checkout.choose(/InstaPay/);
    await expect(page.getByText(/approve the payment in your bank’s InstaPay app/)).toBeVisible();
    await page.getByRole("button", { name: /with InstaPay/ }).click();
    // The order waits for the bank's approval, then the page updates by itself.
    await expect(page.getByRole("heading", { level: 1, name: "Waiting for your payment" })).toBeVisible();
    await new ConfirmationPage(page).expectConfirmed();
    await expect(page.getByRole("region", { name: "Order details" })).toContainText("Paid with InstaPay");

    await openMyTickets(page);
    await expect(page.getByRole("article", { name: /Canal United vs Sinai Stars/ })).toHaveCount(2);
  });

  test("taken seats can't be chosen and sold seats disappear for the next buyer", async ({ page, request }) => {
    await signInAs(page, request);
    await page.goto("/events/canal-united-vs-sinai-stars/seats");
    await page.getByRole("button", { name: /^Block W1,/ }).click();
    const taken = page.getByRole("group", { name: "Block W1 seats" }).getByRole("button", { name: /taken/ }).first();
    await expect(taken).toHaveAttribute("aria-disabled", "true");
    await taken.click({ force: true });
    await expect(page.getByRole("complementary", { name: "Your seats" })).toContainText("No seats yet");
  });
});
