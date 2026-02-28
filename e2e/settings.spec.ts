/**
 * Settings page E2E tests.
 *
 * These tests cover real browser behavior that unit tests can't catch:
 * - Save → navigate away → return → values still shown (the reported regression)
 * - All fields render and respond to interaction
 * - Test email button visible and clickable
 * - Save error surfaces visibly
 *
 * Requires: app running at PLAYWRIGHT_BASE_URL (default http://localhost:3000)
 * and a test user authenticated (pass via E2E_TEST_EMAIL / E2E_TEST_PASSWORD env vars,
 * or use a pre-seeded Supabase local instance).
 *
 * To run locally:
 *   npm run dev &
 *   E2E_TEST_EMAIL=you@example.com E2E_TEST_PASSWORD=secret npx playwright test
 */

import { test, expect, Page } from "@playwright/test";

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";

// Skip all tests if no credentials provided — safe for CI without secrets
const skipIfNoAuth = () => {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    test.skip();
  }
};

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL("/");
}

// ── Structural tests (no auth needed) ────────────────────────────────────────

test.describe("settings page — structure (unauthenticated redirects)", () => {
  test("redirects to /login when not authenticated", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });
});

// ── Full flow tests (require auth) ───────────────────────────────────────────

test.describe("settings page — authenticated", () => {
  test.beforeEach(async ({ page }) => {
    skipIfNoAuth();
    await login(page);
    await page.goto("/settings");
    await page.waitForSelector("text=Weekly Email Report");
  });

  test("renders all expected controls", async ({ page }) => {
    // Toggle
    await expect(page.locator("text=Send weekly email")).toBeVisible();
    // Report email input
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    // Timezone search
    await expect(page.locator("text=Timezone")).toBeVisible();
    // Test email section
    await expect(page.locator("text=Send Test Email")).toBeVisible();
    // Save button
    await expect(page.getByRole("button", { name: /save settings/i })).toBeVisible();
  });

  test("enabling toggle shows day + time pickers", async ({ page }) => {
    // Find and enable toggle if not already on
    const toggle = page.locator('button[style*="border"]').first();
    const saturdayVisible = await page.locator("text=Saturday").isVisible();
    if (!saturdayVisible) {
      await toggle.click();
    }
    await expect(page.locator("text=Saturday")).toBeVisible();
    await expect(page.locator("text=Sunday")).toBeVisible();
    await expect(page.locator("text=Delivery time")).toBeVisible();
    // All 24 hour buttons rendered
    await expect(page.locator("text=12 AM")).toBeVisible();
    await expect(page.locator("text=6 PM")).toBeVisible();
    await expect(page.locator("text=11 PM")).toBeVisible();
  });

  test("disabling toggle hides day + time pickers", async ({ page }) => {
    // Make sure it's enabled first
    const satVisible = await page.locator("text=Saturday").isVisible();
    if (!satVisible) {
      // Enable it
      const toggleBtn = page.locator('button[style*="border"]').first();
      await toggleBtn.click();
      await expect(page.locator("text=Saturday")).toBeVisible();
    }
    // Now disable
    const toggleBtn = page.locator('button[style*="border"]').first();
    await toggleBtn.click();
    await expect(page.locator("text=Saturday")).not.toBeVisible();
    await expect(page.locator("text=Delivery time")).not.toBeVisible();
  });

  test("timezone search filters and selects", async ({ page }) => {
    const tzInput = page.locator('input[placeholder]').filter({ hasText: "" }).nth(1); // second input after report email
    // More reliable: find by sibling label
    const tzSection = page.locator("text=Timezone").locator("..");
    const tzInput2 = tzSection.locator("input");
    await tzInput2.fill("Los_Angeles");
    await expect(page.locator("text=America/Los_Angeles")).toBeVisible();
    await page.locator("text=America/Los_Angeles").click();
    // Search cleared, selected value shown
    await expect(tzInput2).toHaveValue("");
    await expect(page.locator("text=America/Los_Angeles").first()).toBeVisible();
  });

  /**
   * THE REGRESSION TEST
   * 
   * Bug: user saves settings, navigates away, returns — values gone.
   * Root cause: browser timezone was overwriting saved timezone on load.
   * This test saves a known set of values, navigates to /, returns, asserts values persist.
   */
  test("settings persist after navigate away and return", async ({ page }) => {
    // 1. Enable email
    const satVisible = await page.locator("text=Saturday").isVisible();
    if (!satVisible) {
      const toggleBtn = page.locator('button[style*="border"]').first();
      await toggleBtn.click();
      await expect(page.locator("text=Saturday")).toBeVisible();
    }

    // 2. Select Saturday
    await page.locator("text=Saturday").click();

    // 3. Select 9 PM
    await page.locator("text=9 PM").click();

    // 4. Set a specific report email
    const reportEmailInput = page.locator('input[type="email"]').first();
    await reportEmailInput.clear();
    await reportEmailInput.fill("regression-test@example.com");

    // 5. Set timezone to UTC (always available)
    const tzSection = page.locator("text=Timezone").locator("..");
    const tzInput = tzSection.locator("input");
    await tzInput.fill("UTC");
    await page.locator("button", { hasText: "UTC" }).first().click();

    // 6. Save
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.locator("text=Saved!")).toBeVisible();

    // 7. Navigate away
    await page.goto("/");
    await expect(page).toHaveURL("/");

    // 8. Return to settings
    await page.goto("/settings");
    await page.waitForSelector("text=Weekly Email Report");

    // 9. Assert all values restored
    // Email enabled — Saturday + time options should be visible
    await expect(page.locator("text=Saturday")).toBeVisible();

    // Saturday selected (gold border)
    const satButton = page.locator("button", { hasText: "Saturday" });
    const satStyle = await satButton.getAttribute("style");
    expect(satStyle).toContain("var(--gold)");

    // 9 PM selected
    const ninePmButton = page.locator("button", { hasText: "9 PM" });
    const ninePmStyle = await ninePmButton.getAttribute("style");
    expect(ninePmStyle).toContain("var(--gold)");

    // Report email
    const reportEmail = page.locator('input[type="email"]').first();
    await expect(reportEmail).toHaveValue("regression-test@example.com");

    // Timezone
    await expect(page.locator("text=UTC").first()).toBeVisible();
  });

  test("save button shows error if supabase upsert fails", async ({ page }) => {
    // Intercept the Supabase REST call and return an error
    await page.route("**/rest/v1/settings**", async (route) => {
      if (route.request().method() === "POST" || route.request().method() === "PATCH") {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({ message: "simulated DB error" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.locator("text=/Save failed/i")).toBeVisible({ timeout: 5000 });
  });

  test("send test button is visible and enabled", async ({ page }) => {
    const sendTestBtn = page.getByRole("button", { name: /send test/i });
    await expect(sendTestBtn).toBeVisible();
    await expect(sendTestBtn).toBeEnabled();
  });

  test("test email send to field is pre-filled with report email", async ({ page }) => {
    const reportEmail = page.locator('input[type="email"]').first();
    const reportEmailValue = await reportEmail.inputValue();

    // The test email send-to placeholder should show the report email
    const sendToInput = page.locator('input[type="email"]').nth(1);
    const placeholder = await sendToInput.getAttribute("placeholder");
    expect(placeholder).toBe(reportEmailValue);
  });
});
