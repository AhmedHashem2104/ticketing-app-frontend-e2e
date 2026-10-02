import { DEMO, expect, test } from "./support/fixtures";

test.describe("Accounts", () => {
  test("sign up validates every field, then verifies the SMS code", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "Send verification code" }).click();
    await expect(page.getByText("Enter your full name as it appears on your ID")).toBeVisible();
    await expect(page.getByText("You need to accept the terms to continue")).toBeVisible();

    await page.getByLabel(/Full name/).fill("Sara");
    await page.getByLabel("Mobile number").fill("123");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Send verification code" }).click();
    await expect(page.getByText("Enter your first and last name")).toBeVisible();
    await expect(page.getByText(/valid Egyptian mobile number/)).toBeVisible();
    await expect(page.getByText("Use at least 8 characters").first()).toBeVisible();

    await page.getByLabel(/Full name/).fill("Sara Ahmed");
    await page.getByLabel("Mobile number").fill("11 1234 5678");
    await page.getByLabel("Password").fill("supersecret");
    await page.getByRole("checkbox", { name: "I agree to the terms of use and privacy policy" }).click();
    await page.getByRole("button", { name: "Send verification code" }).click();

    await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
    await expect(page.getByText("+20 11•• ••• 678")).toBeVisible();
    await expect(page.getByText(/Resend code in 0:\d{2}/)).toBeVisible();
    await page.getByLabel("Digit 1").fill("0");
    await page.keyboard.type("00000");
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("That code isn't right");

    await page.getByLabel("Digit 1").click();
    for (let i = 0; i < 6; i += 1) await page.keyboard.press("Backspace");
    await page.getByLabel("Digit 1").fill(DEMO.otp[0]!);
    await page.keyboard.type(DEMO.otp.slice(1));
    await page.getByRole("button", { name: "Verify and continue" }).click();

    await expect(page).toHaveURL(/\/fan-id$/);
    await expect(page.getByRole("heading", { level: 1, name: "Get your Fan ID" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu: Sara Ahmed" })).toBeVisible();
  });

  test("an existing mobile number is rejected on the field", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/Full name/).fill("Omar Again");
    await page.getByLabel("Mobile number").fill(DEMO.phone);
    await page.getByLabel("Password").fill("supersecret");
    await page.getByRole("checkbox", { name: "I agree to the terms of use and privacy policy" }).click();
    await page.getByRole("button", { name: "Send verification code" }).click();
    await expect(page.getByLabel("Mobile number")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/already exists/).first()).toBeVisible();
  });

  test("protected pages send you to log in and back again", async ({ page }) => {
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login\?next=%2Ftickets/);
    await expect(page.getByText("Log in to continue.")).toBeVisible();

    await page.getByLabel("Mobile number").fill(DEMO.phone);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Mobile number or password is incorrect");

    await page.getByLabel("Password").fill(DEMO.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/tickets$/);
    await expect(page.getByRole("heading", { level: 1, name: "My tickets" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu: Omar Khaled" })).toBeVisible();
  });

  test("the session survives a reload and open redirects are ignored", async ({ page }) => {
    await page.goto("/login?next=https://evil.example");
    await page.getByLabel("Mobile number").fill(DEMO.phone);
    await page.getByLabel("Password").fill(DEMO.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await page.reload();
    await expect(page.getByRole("button", { name: "Account menu: Omar Khaled" })).toBeVisible();
    // The session lives in an httpOnly cookie: page scripts can't read it and nothing is in storage.
    expect(await page.evaluate(() => document.cookie)).not.toContain("mp_session");
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
    const cookie = (await page.context().cookies()).find((c) => c.name === "mp_session");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  });
});
