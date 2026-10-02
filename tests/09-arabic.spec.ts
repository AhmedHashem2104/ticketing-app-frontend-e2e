import { CARDS, DEMO, expect, expectAccessible, signInAs, test, WEB_URL } from "./support/fixtures";

/** Visible text that is still English (Latin words of 3+ letters), ignoring brand and code words. */
const ALLOWED_LATIN = /\b(Matchpass|MATCHPASS|VIP|IMAX|QR|EGP|EN|MockPay|InstaPay|Fawry|myFawry|Visa|Mastercard|Meeza|PG|DEV)\b/g;
async function englishLeft(page: import("@playwright/test").Page) {
  const text = await page.locator("main").innerText();
  return (text.replace(ALLOWED_LATIN, "").match(/[A-Za-z]{3,}[A-Za-z ]*/g) ?? []).map((s) => s.trim());
}

test.describe("Arabic site (/ar, right to left)", () => {
  test("switches language from any page and keeps the choice", async ({ page }) => {
    await page.goto("/en/events");
    await expect(page.getByRole("heading", { level: 1, name: "Matches" })).toBeVisible();
    await page.getByLabel("التبديل إلى العربية").first().click();

    await expect(page).toHaveURL(/\/ar\/events$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar-EG");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "المباريات" })).toBeVisible();
    // Event names come translated from the API.
    await expect(page.getByRole("main")).toContainText("نادي النيل ضد دلتا الرياضي");
    // Cairo font with the Arabic line height.
    const style = await page
      .locator("body")
      .evaluate((el) => ({ font: getComputedStyle(el).fontFamily, lh: getComputedStyle(el).lineHeight }));
    expect(style.font).toContain("Cairo");
    expect(parseFloat(style.lh)).toBeGreaterThan(24);

    // An unprefixed link now opens in the remembered language.
    await page.goto("/events");
    await expect(page).toHaveURL(/\/ar\/events$/);
    await page.getByLabel("Switch to English").first().click();
    await expect(page).toHaveURL(/\/en\/events$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("first visits follow the browser's language", async ({ browser }) => {
    const context = await browser.newContext({ locale: "ar-EG", extraHTTPHeaders: { "Accept-Language": "ar-EG,ar;q=0.9" } });
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/`);
    await expect(page).toHaveURL(/\/ar$/);
    await expect(page.getByRole("heading", { name: "متاح للبيع الآن" })).toBeVisible();
    await context.close();
  });

  test("home, browse and event pages have no English left", async ({ page }) => {
    for (const path of ["/ar", "/ar/events", "/ar/events/layla-nour-live-in-cairo", "/ar/cinema"]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await englishLeft(page), path).toEqual([]);
    }
  });

  test("log in shows Arabic validation and server errors", async ({ page }) => {
    await page.goto("/ar/login");
    await page.getByRole("button", { name: "تسجيل الدخول" }).last().click();
    await expect(page.getByText("أدخل كلمة المرور")).toBeVisible();
    await page.getByLabel("رقم الموبايل").fill(DEMO.phone);
    await page.getByLabel("كلمة المرور").fill("wrong-password");
    await page.getByRole("button", { name: "تسجيل الدخول" }).last().click();
    await expect(page.getByRole("main").getByRole("alert").last()).not.toContainText(/[A-Za-z]{4,}/);
    await page.getByLabel("كلمة المرور").fill(DEMO.password);
    await page.getByRole("button", { name: "تسجيل الدخول" }).last().click();
    await expect(page.getByRole("button", { name: `قائمة الحساب: ${DEMO.name}` })).toBeVisible();
    await expect(page).toHaveURL(/\/ar$/);
  });

  test("buys concert tickets in Arabic, paying on the card page in Arabic", async ({ page, request }) => {
    await signInAs(page, request);
    await page.goto("/ar/events/layla-nour-live-in-cairo");
    await expect(page.getByRole("heading", { level: 1, name: /ليلى نور/ })).toBeVisible();
    await page.getByRole("complementary", { name: "شراء التذاكر" }).getByRole("link", { name: "احصل على التذاكر" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "خريطة المكان" })).toBeVisible();
    await page.getByRole("button", { name: "مقصورات VIP والصالة" }).click();
    await page.getByRole("button", { name: "إضافة الدائرة الذهبية واحد" }).click();
    await page.getByRole("button", { name: "المتابعة إلى الدفع" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "الدفع" })).toBeVisible();
    await expect(page.getByRole("timer")).toBeVisible();
    await page.getByRole("button", { name: /^ادفع .* ج\.م$/ }).click();

    // The payment provider's page follows the fan's language.
    await expect(page).toHaveURL(/\/api\/payments\/.*lang=ar/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "الدفع بالبطاقة" })).toBeVisible();
    await page.getByLabel("رقم البطاقة").fill(CARDS.valid);
    await page.getByLabel("تاريخ الانتهاء").fill("12 / 49");
    await page.getByLabel("رمز الأمان").fill("123");
    await page.getByLabel("الاسم على البطاقة").fill(DEMO.name);
    await page.getByRole("button", { name: /^ادفع/ }).click();

    await expect(page).toHaveURL(/\/ar\/orders\/ord_/);
    await expect(page.getByRole("heading", { level: 1, name: "أنت ذاهب!" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/الطلب MP-\d{4}-\d+/)).toBeVisible();
    await page.getByRole("link", { name: "عرض تذاكري" }).click();
    await expect(page).toHaveURL(/\/ar\/tickets$/);
    await expect(page.getByRole("heading", { level: 1, name: "تذاكري" })).toBeVisible();
  });

  test("unknown Arabic pages get a real 404 in Arabic", async ({ page }) => {
    const response = await page.goto("/ar/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "الصفحة غير موجودة" })).toBeVisible();
  });

  test("Arabic pages meet WCAG 2.1 AA", async ({ page, request }) => {
    await page.goto("/ar");
    await expectAccessible(page);
    await page.goto("/ar/events/nile-fc-vs-delta-sc");
    await expectAccessible(page);
    await signInAs(page, request);
    await page.goto("/ar/tickets");
    await expect(page.getByRole("heading", { level: 1, name: "تذاكري" })).toBeVisible();
    await expectAccessible(page);
  });
});
