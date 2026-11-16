import { expect, test } from "@playwright/test";

test("homepage renders approved database charts without illustrative data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /the pulse, charted/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /today.s top 10/i })).toBeVisible();
  await expect(page.getByText(/approved apple music snapshot/i).first()).toBeVisible();
  await expect(page.getByText(/illustrative|after snow|night bus|exit preview/i)).toHaveCount(0);
});

test("language persists across public pages and protected dashboard redirects", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Монгол" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "mn");
  await page.goto("/methodology");
  await expect(page.getByRole("heading", { name: /Итгэл эх сурвалжаас эхэлнэ/i })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?/);
  await expect(page.getByRole("heading", { name: "Atlas-д нэвтрэх." })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("methodology distinguishes rank from streams", async ({ page }) => {
  await page.goto("/methodology");
  await expect(page.getByText("Rank is not a stream count.")).toBeVisible();
});

test("imported artist without chart history has a source and no invented metrics", async ({ page }) => {
  await page.goto("/artists");
  await expect(page.getByRole("heading", { name: /Mongolian artists, discover their stories/i })).toBeVisible();
  await page.getByRole("link", { name: /Source Fixture Artist/ }).click();
  await expect(page.getByRole("heading", { name: "Source Fixture Artist" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Fixture source/ })).toHaveAttribute("href", "https://example.com/fixture-artist");
  await expect(page.getByText(/no verified public platform metrics/i)).toBeVisible();
  await expect(page.getByText(/after snow|illustrative artists/i)).toHaveCount(0);
});

test("artist directory follows Mongolian locale without horizontal overflow", async ({ page }) => {
  await page.goto("/artists");
  await page.getByRole("button", { name: "Монгол" }).click();
  await expect(page.getByRole("heading", { name: /Монгол уран бүтээлчид, тэдний түүхийг нээ/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("chart archive links export to the actual approved date", async ({ page }) => {
  await page.goto("/charts/apple-music-mongolia");
  const date = await page.getByLabel("Archive date").inputValue();
  expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole("link", { name: /export csv/i })).toHaveAttribute("href", `/api/public/charts/apple-music-mongolia/latest.csv?date=${date}`);
});

test("artist review requires staff sign-in", async ({ page }) => {
  await page.goto("/dashboard/artists");
  await expect(page).toHaveURL(/\/login\?/);
  await expect(page.getByText(/authorized team members/i)).toBeVisible();
  await expect(page.getByText(/preview candidates|Atlas team/i)).toHaveCount(0);
});

test("team sign-in communicates invitation-only access", async ({ page }) => {
  await page.goto("/login?error=access_denied");
  await expect(page.getByText(/authorized team members/i)).toBeVisible();
  await expect(page.getByText(/account is not active/i)).toBeVisible();
});

test("public APIs read the real database and return dated JSON and CSV", async ({ request }) => {
  expect((await request.post("/api/language", { data: { locale: "de" } })).status()).toBe(400);
  const json = await request.get("/api/public/charts/apple-music-mongolia/latest");
  expect(json.ok()).toBe(true);
  expect(await json.json()).toMatchObject({ snapshot: { isDemo: false }, chart: { source: "apple_music" } });
  const csv = await request.get("/api/public/charts/apple-music-mongolia/latest.csv");
  expect(csv.ok()).toBe(true);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("rank,title,artist");
});

test("collectors do not reveal configuration before authentication", async ({ request }) => {
  for (const path of ["/api/internal/collect/apple-music", "/api/internal/collect/artists"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  }
});
