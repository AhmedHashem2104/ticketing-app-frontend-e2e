import { expect, type Page } from "@playwright/test";
import { CARDS } from "./fixtures";

/** Page-object helpers for the flows that several journeys share. */
export class CheckoutPage {
  constructor(readonly page: Page) {}

  async expectLoaded() {
    await expect(this.page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();
    await expect(this.page.getByRole("timer")).toBeVisible();
  }

  /** Chooses card (the default) and goes to the payment provider's hosted page. */
  async startCardPayment() {
    await this.page.getByRole("button", { name: /^Pay .* EGP$/ }).click();
    await expect(this.page).toHaveURL(/\/api\/payments\//);
    return new HostedPaymentPage(this.page);
  }

  /** Full card payment: Matchpass checkout → provider's hosted card page → back to the order. */
  async payByCard(cardNumber = CARDS.valid) {
    const hosted = await this.startCardPayment();
    await hosted.pay(cardNumber);
  }

  async choose(method: RegExp) {
    await this.page.getByRole("radio", { name: method }).click();
  }

  total() {
    return this.page.getByRole("complementary", { name: "Order summary" });
  }
}

/** The mock payment provider's hosted card form (card data never touches Matchpass). */
export class HostedPaymentPage {
  constructor(readonly page: Page) {}

  async fill(cardNumber: string, expiry = "12 / 49", cvc = "123", name = "Omar Khaled") {
    await expect(this.page.getByRole("heading", { level: 1, name: "Pay with card" })).toBeVisible();
    await this.page.getByLabel("Card number").fill(cardNumber);
    await this.page.getByLabel("Expiry").fill(expiry);
    await this.page.getByLabel("CVC").fill(cvc);
    await this.page.getByLabel("Name on card").fill(name);
  }

  async pay(cardNumber = CARDS.valid) {
    await this.fill(cardNumber);
    await this.page.getByRole("button", { name: /^Pay .* EGP$/ }).click();
  }
}

export class ConfirmationPage {
  constructor(readonly page: Page) {}

  async expectConfirmed() {
    await expect(this.page).toHaveURL(/\/orders\/ord_/);
    await expect(this.page.getByRole("heading", { level: 1, name: "You're going" })).toBeVisible({ timeout: 20_000 });
    await expect(this.page.getByText(/Order MP-\d{4}-\d+/)).toBeVisible();
  }
}

export async function openMyTickets(page: Page) {
  await page.goto("/tickets");
  await expect(page.getByRole("heading", { level: 1, name: "My tickets" })).toBeVisible();
}

export async function openAccountMenu(page: Page, name = "Omar Khaled") {
  await page.getByRole("button", { name: `Account menu: ${name}` }).click();
  return page.getByRole("menu");
}
