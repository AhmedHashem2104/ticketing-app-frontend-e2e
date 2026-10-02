import { expect, test } from "./support/fixtures";

test.describe("Discover events", () => {
  test("home page shows featured events, on-sale grid, coming soon and the Fan ID callout", async ({ page }) => {
    await page.goto("/");
    const featured = page.getByRole("region", { name: "Featured" });
    await expect(featured.getByRole("heading", { name: "Nile FC vs Delta SC" })).toBeVisible();
    await expect(featured.getByRole("heading", { name: "Layla Nour" })).toBeVisible();
    await expect(featured.getByText(/Sale opens in \d+d \d{2}:\d{2}/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "On sale now" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Coming soon" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start verification" })).toHaveAttribute("href", "/fan-id");
  });

  test("category chips filter the on-sale grid", async ({ page }) => {
    await page.goto("/");
    const grid = page.getByRole("region", { name: "On sale now" });
    await expect(grid.getByRole("listitem")).toHaveCount(4);
    await page.getByRole("button", { name: "Cup", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cup", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(grid.getByRole("listitem")).toHaveCount(1);
    await expect(grid.getByRole("link", { name: /Canal United vs Sinai Stars/ })).toBeVisible();
    await page.getByRole("button", { name: "Comedy" }).click();
    await expect(grid.getByText("Nothing on sale in Comedy right now.")).toBeVisible();
  });

  test("browse matches and concerts with search and filters kept in the URL", async ({ page }) => {
    await page.goto("/events");
    await expect(page.getByRole("heading", { level: 1, name: "Matches" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "upcoming event" })).toHaveText("6 upcoming events");

    await page.getByRole("searchbox", { name: "Search events" }).fill("capital");
    await expect(page).toHaveURL(/q=capital/);
    await expect(page.getByText("3 upcoming events")).toBeVisible();

    await page.getByRole("checkbox", { name: "Show available only" }).click();
    await expect(page).toHaveURL(/available=1/);
    await expect(page.getByText("1 upcoming event")).toBeVisible();
    await page.reload();
    await expect(page.getByText("1 upcoming event")).toBeVisible();

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByRole("checkbox", { name: "Alexandria" }).click();
    await expect(page.getByRole("link", { name: /Alex Port FC vs Upper Egypt SC/ })).toBeVisible();
    await expect(page.getByText("1 upcoming event")).toBeVisible();

    await page.getByRole("button", { name: "Concerts & events" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Concerts & events" })).toBeVisible();
    await expect(page).toHaveURL(/tab=concerts/);
    await page.getByRole("checkbox", { name: "Comedy" }).click();
    await expect(page.getByRole("link", { name: /Omar Sami — Stand-up/ })).toBeVisible();
  });

  test("shows an empty state that clears filters", async ({ page }) => {
    await page.goto("/events?tab=matches&q=nothing-matches-this");
    await expect(page.getByText("No events match your filters")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByText("6 upcoming events")).toBeVisible();
  });

  test("match detail explains prices, gates, rules and the waiting room", async ({ page }) => {
    await page.goto("/events/nile-fc-vs-delta-sc");
    await expect(page).toHaveTitle("Nile FC vs Delta SC · Matchpass");
    await expect(page.getByRole("list", { name: "Entry rules" })).toContainText("Fan ID required");
    const table = page.getByRole("table");
    await expect(table.getByRole("row", { name: /VIP lounge/ })).toContainText("600 EGP");
    await expect(page.getByRole("heading", { name: "Stadium & gates" })).toBeVisible();
    const faq = page.getByRole("button", { name: "How does the waiting room work?" });
    await faq.click();
    await expect(page.getByText(/random place in line/)).toBeVisible();
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Buy tickets" }).getByRole("link", { name: "Join the waiting room" }),
    ).toBeVisible();
    await expect(page.getByText("Sign in with an approved Fan ID to buy")).toBeVisible();
  });

  test("concert detail validates presale codes", async ({ page }) => {
    await page.goto("/events/layla-nour-live-in-cairo");
    await expect(page.getByRole("heading", { level: 1, name: "Layla Nour — Live in Cairo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Running order" })).toBeVisible();
    const code = page.getByLabel("Have a presale code?");
    await code.fill("x");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Codes are 4–16 letters or numbers");
    await code.fill("WRONG1");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("isn't valid");
    await code.fill("layla24");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Presale unlocked with LAYLA24")).toBeVisible();
  });

  test("unknown pages and events show a friendly 404", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.goto("/events/no-such-event");
    await expect(page.getByRole("heading", { name: "We couldn't find that" })).toBeVisible();
  });
});
