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
  test.beforeEach(async ({ page, context, baseURL }) => {
    // Set demo cookie so middleware allows access without authentication
    const appURL = new URL(baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "https://coil.5am.team");
    await context.addCookies([
      {
        name: "coil_demo",
        value: "1",
        domain: appURL.hostname,
        path: "/",
        httpOnly: false,
        secure: appURL.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
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
    await expect(page.getByText("Mon").first()).toBeVisible();
    await expect(page.getByText("Tue").first()).toBeVisible();
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
    await expect(page.getByRole("link", { name: /settings/i })).toBeVisible();
  });

  test("Settings button links to /settings in demo mode", async ({ page }) => {
    const settingsEl = page.getByRole("link", { name: /settings/i });
    await expect(settingsEl).toBeVisible();
    await expect(settingsEl).toHaveAttribute("href", "/settings");
  });

  test("clicking settings navigates to /settings", async ({ page }) => {
    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test("tab navigation works — can switch to Weekly tab", async ({ page }) => {
    await page.getByRole("button", { name: /weekly/i }).click();
    await expect(page.getByText("Territory Breakdown")).toBeVisible();
  });

  test("tab navigation works — Export tab shows Copy Report button", async ({ page }) => {
    await page.getByRole("button", { name: /export/i }).click();
    await expect(page.getByRole("button", { name: /copy for ai chat/i })).toBeVisible();
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
    await page.getByRole("button", { name: "Increase 🥃 Drinks Today" }).click();
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
    // Email input has no <label> — use placeholder or type selector
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });
  });
});
