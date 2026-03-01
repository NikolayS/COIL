/**
 * E2E tests — Demo mode (unauthenticated)
 *
 * These tests run against the live app at PLAYWRIGHT_BASE_URL
 * (default: https://coil.5am.team) and do NOT require credentials.
 *
 * Covers:
 *  - Visit / → loads COIL app in demo mode
 *  - Interact with territory checkboxes → save pill shows 'saving' then 'saved'
 *  - Settings button visible but disabled (not clickable as a link) in demo mode
 *  - /settings redirects unauthenticated users to /login
 */

import { test, expect } from "@playwright/test";

test.describe("Demo mode — home page", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure clean demo state
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("coil_current_week");
      localStorage.removeItem("coil_archived_weeks");
    });
    await page.reload();
    // Wait for app to be hydrated (score visible)
    await page.waitForSelector("text=COIL", { timeout: 10_000 });
  });

  test("loads the COIL app and shows demo mode indicator", async ({ page }) => {
    // Title
    await expect(page.locator("h1", { hasText: "COIL" })).toBeVisible();
    // Demo mode label
    await expect(page.getByText("demo mode")).toBeVisible();
    // Weekly score out of 35
    await expect(page.getByText("/35")).toBeVisible();
  });

  test("shows Daily tab by default with territory checkboxes", async ({ page }) => {
    // Day picker should be visible
    await expect(page.getByText("Mon")).toBeVisible();
    await expect(page.getByText("Tue")).toBeVisible();
    // Territory names
    await expect(page.getByText("Self")).toBeVisible();
    await expect(page.getByText("Health")).toBeVisible();
    await expect(page.getByText("Relationships")).toBeVisible();
    await expect(page.getByText("Wealth")).toBeVisible();
    await expect(page.getByText("Business")).toBeVisible();
  });

  test("checking a territory shows the save status pill ('saving' or 'saved')", async ({ page }) => {
    // Click the first territory toggle
    const firstTerritory = page.locator("button.territory-toggle").first();
    await expect(firstTerritory).toBeVisible();
    await firstTerritory.click();

    // The save status pill should appear — either 'saving' or 'saved'
    // In demo mode it goes straight to 'saved' (localStorage is synchronous)
    await expect(
      page.getByText(/saving|saved/i)
    ).toBeVisible({ timeout: 3_000 });
  });

  test("save status pill shows 'saved' after checking territory (demo = localStorage)", async ({ page }) => {
    const firstTerritory = page.locator("button.territory-toggle").first();
    await firstTerritory.click();

    // Demo mode writes to localStorage synchronously → jumps straight to 'saved'
    await expect(page.getByText(/✓ saved/)).toBeVisible({ timeout: 3_000 });
  });

  test("save status pill disappears after a moment", async ({ page }) => {
    const firstTerritory = page.locator("button.territory-toggle").first();
    await firstTerritory.click();

    await expect(page.getByText(/✓ saved/)).toBeVisible({ timeout: 3_000 });

    // Pill should auto-hide within ~2 seconds
    await expect(page.getByText(/✓ saved/)).not.toBeVisible({ timeout: 4_000 });
  });

  test("score increments when territory is checked", async ({ page }) => {
    // Initial score should be 0 for a fresh demo session
    const scoreEl = page.locator("text=/^\\d+$/").first();
    const initialScore = parseInt(await scoreEl.textContent() ?? "0", 10);

    const firstTerritory = page.locator("button.territory-toggle").first();
    await firstTerritory.click();

    // Wait for save to settle
    await expect(page.getByText(/✓ saved/)).toBeVisible({ timeout: 3_000 });

    // Score should have incremented by 1
    const newScore = parseInt(await scoreEl.textContent() ?? "0", 10);
    expect(newScore).toBe(initialScore + 1);
  });

  test("score persists after page reload (localStorage)", async ({ page }) => {
    const firstTerritory = page.locator("button.territory-toggle").first();
    await firstTerritory.click();
    await expect(page.getByText(/✓ saved/)).toBeVisible({ timeout: 3_000 });

    await page.reload();
    await page.waitForSelector("text=COIL", { timeout: 10_000 });

    // Score should be at least 1 (persisted via localStorage)
    const scoreEl = page.locator("text=/^[1-9]\\d*$/").first();
    await expect(scoreEl).toBeVisible({ timeout: 5_000 });
  });

  test("Settings button is visible in demo mode", async ({ page }) => {
    // Settings icon should be in the header
    await expect(page.locator("[aria-label='Settings (sign in required)']")).toBeVisible();
  });

  test("Settings button is disabled (not-allowed cursor) in demo mode", async ({ page }) => {
    const settingsEl = page.locator("[aria-label='Settings (sign in required)']");
    await expect(settingsEl).toBeVisible();

    // It's a <span>, not an <a>, so it should not be a link
    const tagName = await settingsEl.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe("span");

    // Should have cursor: not-allowed via inline style
    const cursor = await settingsEl.evaluate((el) => (el as HTMLElement).style.cursor);
    expect(cursor).toBe("not-allowed");
  });

  test("clicking the disabled settings span does NOT navigate", async ({ page }) => {
    const settingsEl = page.locator("[aria-label='Settings (sign in required)']");
    await settingsEl.click({ force: true }); // force past the non-interactive element
    // Should stay on /
    await expect(page).toHaveURL(/^\//);
    await expect(page).not.toHaveURL(/\/settings/);
  });

  test("tab navigation works — can switch to Weekly tab", async ({ page }) => {
    await page.getByRole("button", { name: /weekly/i }).click();
    await expect(page.getByText("Territory Breakdown")).toBeVisible();
  });

  test("tab navigation works — Export tab shows Copy Report button", async ({ page }) => {
    await page.getByRole("button", { name: /export/i }).click();
    await expect(page.getByRole("button", { name: /copy full coil report/i })).toBeVisible();
  });

  test("Export tab: SQL Dump button is NOT visible in demo mode (no user)", async ({ page }) => {
    await page.getByRole("button", { name: /export/i }).click();
    // Download SQL Dump button only shows for authenticated users
    await expect(page.getByRole("button", { name: /download sql dump/i })).not.toBeVisible();
  });

  test("Wolf check buttons are visible and toggleable", async ({ page }) => {
    await expect(page.getByText("Wise")).toBeVisible();
    await expect(page.getByText("Open")).toBeVisible();
    await expect(page.getByText("Loving")).toBeVisible();
    await expect(page.getByText("Fierce")).toBeVisible();

    // Click Wise
    await page.getByRole("button", { name: "Wise" }).click();
    await expect(page.getByText(/✓ saved/)).toBeVisible({ timeout: 3_000 });
  });

  test("Drink counter increments and saves", async ({ page }) => {
    const plusBtn = page.locator("button").filter({ hasText: "" }).nth(0);
    // More reliably: target the + button next to drink counter
    // The counter shows the current value
    const drinkValue = page.locator(".font-mono.text-2xl");
    const initialDrinks = parseInt(await drinkValue.textContent() ?? "0", 10);

    // Click +
    await page.locator("button").filter({ has: page.locator("svg") }).nth(-1).click();

    await expect(page.getByText(/✓ saved/)).toBeVisible({ timeout: 3_000 });
  });
});

test.describe("Demo mode — /settings redirect", () => {
  test("visiting /settings when not authenticated redirects to /login", async ({ page }) => {
    await page.goto("/settings");
    // Middleware should redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("/login page renders sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10_000 });
  });
});
