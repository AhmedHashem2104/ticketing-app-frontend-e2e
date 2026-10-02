import { expect, signInAs, test } from "./support/fixtures";
import { CheckoutPage, ConfirmationPage } from "./support/pages";

test.describe("Mobile", () => {
  test("navigates through the menu sheet and buys a concert ticket", async ({ page, request }) => {
    await signInAs(page, request);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("dialog");
    await menu.getByRole("link", { name: "Concerts & events" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Concerts & events" })).toBeVisible();
    await page.getByRole("link", { name: /The Felucca Band/ }).click();
    await page.getByRole("complementary", { name: "Buy tickets" }).getByRole("link", { name: "Get tickets" }).click();
    await page.getByRole("button", { name: "One more General admission" }).click();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await new CheckoutPage(page).payByCard();
    await new ConfirmationPage(page).expectConfirmed();
  });

  test("pages don't scroll sideways", async ({ page }) => {
    for (const path of ["/", "/events", "/events/nile-fc-vs-delta-sc", "/signup"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);
    }
  });
});
