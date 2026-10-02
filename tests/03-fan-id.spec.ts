import { API_URL, createUser, expect, test, useSession } from "./support/fixtures";

const photo = { name: "id.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fake-image") };

test.describe("Fan ID onboarding", () => {
  test("a new fan can't buy match tickets until their Fan ID is approved", async ({ page, request }) => {
    const token = await createUser(request);
    await useSession(page, token);

    await page.goto("/events/canal-united-vs-sinai-stars");
    await expect(page.getByText("You need an approved Fan ID for this match")).toBeVisible();
    await page.goto("/events/canal-united-vs-sinai-stars/tickets");
    await expect(page.getByRole("heading", { name: "You need a Fan ID" })).toBeVisible();
    await page.getByRole("link", { name: "Get your Fan ID" }).click();

    // 1 · Document
    await expect(page.getByRole("heading", { level: 1, name: "Get your Fan ID" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Egyptian national ID/ })).toBeChecked();
    await page.getByRole("button", { name: "Continue" }).click();

    // 2 · ID photos (front and back required)
    await expect(page.getByRole("heading", { level: 1, name: "Scan your document" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Add a photo of the front");
    await page.getByLabel("Take photo or upload · front side").setInputFiles(photo);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Add a photo of the back");
    await page.getByLabel("Take photo or upload · back side").setInputFiles(photo);
    await expect(page.getByText("Back side added")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // 3 · Selfie
    await expect(page.getByRole("heading", { level: 1, name: "Confirm it’s you" })).toBeVisible();
    await page.getByLabel("Take selfie").setInputFiles(photo);
    await page.getByRole("button", { name: "Continue" }).click();

    // 4 · Review
    await expect(page.getByLabel("Name (English)")).toHaveValue("Sara Ahmed");
    await page.getByRole("button", { name: "Submit for verification" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Confirm your details to continue");
    await page.getByRole("checkbox", { name: /I confirm these details are correct/ }).click();
    await page.getByRole("button", { name: "Submit for verification" }).click();

    // 5 · The identity check runs in the background, then the page updates by itself.
    await expect(page.getByRole("heading", { level: 1, name: "We’re checking your details" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Your Fan ID is ready" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: "Your Fan ID", exact: true })).toContainText("Sara Ahmed");
    await expect(page.getByText("Approved — you can now buy match tickets")).toBeVisible();

    const me = await (await request.get(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(me.fanId.status).toBe("approved");

    await page.getByRole("link", { name: "Browse matches" }).click();
    await page.getByRole("link", { name: /Canal United vs Sinai Stars/ }).click();
    await expect(page.getByText("Your Fan ID is approved")).toBeVisible();
  });

  test("passport holders only photograph the front", async ({ page, request }) => {
    const token = await createUser(request, "1512345678", "Lina Haddad");
    await useSession(page, token);
    await page.goto("/fan-id");
    await page.getByRole("radio", { name: /Passport/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Photograph your passport" })).toBeVisible();
    await expect(page.getByLabel(/back side/)).toHaveCount(0);
    // Wrong file types are caught before uploading.
    await page.getByLabel("Take photo or upload · front side").setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
    await expect(page.getByText("Use a JPG, PNG, WEBP or HEIC photo")).toBeVisible();
    await page.getByLabel(/front side/).setInputFiles(photo);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Confirm it’s you" })).toBeVisible();
  });
});
