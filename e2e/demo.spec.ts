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

import { test, expect, type Page } from "@playwright/test";

const RUNS_AGAINST_PRODUCTION = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
).hostname === "coil.5am.team";

async function switchToCloseWhenAvailable(page: Page) {
  const close = page.getByRole("button", { name: "Close", exact: true });
  if (await close.count()) await close.click();
}

function firstTerritoryCompletion(page: Page) {
  return page.getByRole("button", { name: "Complete Self commitment" })
    .or(page.locator("button.territory-toggle").first())
    .first();
}

async function expectRoute(page: Page, tab: string, view: string) {
  await expect.poll(() => {
    const url = new URL(page.url());
    return { tab: url.searchParams.get("tab"), view: url.searchParams.get("view") };
  }).toEqual({ tab, view });
}

test.describe("Demo mode — home page", () => {
  test.beforeEach(async ({ page, context, baseURL }) => {
    // Monthly fixtures below are July/August; do not depend on the wall clock.
    await page.clock.setFixedTime(new Date("2026-08-10T16:00:00Z"));
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
    await switchToCloseWhenAvailable(page);
    // Click the first territory toggle
    const firstTerritory = firstTerritoryCompletion(page);
    await expect(firstTerritory).toBeVisible();
    await firstTerritory.click();

    // The save status pill should appear — either 'saving' or 'saved'
    // In demo mode it goes straight to 'saved' (localStorage is synchronous)
    await expect(
      page.getByText(/saving|saved/i)
    ).toBeVisible({ timeout: 3_000 });
  });

  test("save status pill shows 'saved' after checking territory (demo = localStorage)", async ({ page }) => {
    await switchToCloseWhenAvailable(page);
    const firstTerritory = firstTerritoryCompletion(page);
    await firstTerritory.click();

    // Demo mode writes to localStorage synchronously → jumps straight to 'saved'
    await expect(page.getByText(/✓ saved/)).toBeVisible({ timeout: 3_000 });
  });

  test("save status pill disappears after a moment", async ({ page }) => {
    await switchToCloseWhenAvailable(page);
    const firstTerritory = firstTerritoryCompletion(page);
    await firstTerritory.click();

    await expect(page.getByText(/✓ saved/)).toBeVisible({ timeout: 3_000 });

    // Pill should auto-hide within ~2 seconds
    await expect(page.getByText(/✓ saved/)).not.toBeVisible({ timeout: 4_000 });
  });

  test("score increments when territory is checked", async ({ page }) => {
    await switchToCloseWhenAvailable(page);
    // Initial score should be 0 for a fresh demo session
    const scoreEl = page.locator("text=/^\\d+$/").first();
    const initialScore = parseInt(await scoreEl.textContent() ?? "0", 10);

    const firstTerritory = firstTerritoryCompletion(page);
    await firstTerritory.click();

    // Wait for save to settle
    await expect(page.getByText(/✓ saved/)).toBeVisible({ timeout: 3_000 });

    // Score should have incremented by 1
    const newScore = parseInt(await scoreEl.textContent() ?? "0", 10);
    expect(newScore).toBe(initialScore + 1);
  });

  test("score persists after page reload (localStorage)", async ({ page }) => {
    await switchToCloseWhenAvailable(page);
    const firstTerritory = firstTerritoryCompletion(page);
    await firstTerritory.click();
    await expect(page.getByText(/✓ saved/)).toBeVisible({ timeout: 3_000 });

    await page.reload();
    await page.waitForSelector("text=COIL", { timeout: 10_000 });

    // Score should be at least 1 (persisted via localStorage)
    const scoreEl = page.locator("text=/^[1-9]\\d*$/").first();
    await expect(scoreEl).toBeVisible({ timeout: 5_000 });
  });

  test("demo rollover preserves last week locally without writing to Supabase", async ({ page }) => {
    await switchToCloseWhenAvailable(page);
    await firstTerritoryCompletion(page).click();
    await expect(page.getByText(/✓ saved/)).toBeVisible();
    await page.evaluate(() => {
      const week = JSON.parse(localStorage.getItem("coil_current_week")!);
      week.weekOf = "2026-08-03T07:00:00.000Z";
      week.weekly.biggestWin = "Keep last week's record";
      localStorage.setItem("coil_current_week", JSON.stringify(week));
    });
    await page.reload();
    await expect(page.getByText("demo mode", { exact: true })).toBeVisible();
    const saved = await page.evaluate(() => ({
      current: JSON.parse(localStorage.getItem("coil_current_week")!),
      archive: JSON.parse(localStorage.getItem("coil_archived_weeks")!),
    }));
    expect(saved.current.weekOf).toBe("2026-08-10");
    expect(saved.current.weekly.biggestWin).toBe("");
    expect(saved.archive).toHaveLength(1);
    expect(saved.archive[0].data.weekly.biggestWin).toBe("Keep last week's record");
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

  test("tab navigation works — can switch to Week review", async ({ page }) => {
    await page.getByRole("button", { name: /^(Week|Weekly)$/ }).click();
    if (!await page.getByText("Territory Breakdown").isVisible()) {
      await page.getByRole("button", { name: "Review", exact: true }).last().click();
    }
    await expect(page.getByText("Territory Breakdown")).toBeVisible();
  });

  test("section and subtab state is always reflected in the URL", async ({ page }) => {
    await expectRoute(page, "today", "plan");

    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expectRoute(page, "today", "close");

    await page.getByRole("button", { name: /^(Week|Weekly)$/ }).click();
    await expectRoute(page, "week", "plan");
    await page.getByRole("button", { name: "Report", exact: true }).click();
    await expectRoute(page, "week", "report");

    await page.reload();
    await expect(page.getByRole("button", { name: "Report", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.goBack();
    await expectRoute(page, "week", "plan");

    await page.getByRole("button", { name: "Plan", exact: true }).first().click();
    await expectRoute(page, "plan", "plan");

    await page.getByRole("button", { name: "Review", exact: true }).first().click();
    await expectRoute(page, "review", "review");
    await page.getByRole("button", { name: "Plan next month", exact: true }).click();
    await expectRoute(page, "review", "plan");
  });

  test("weekly report export is discoverable from the Week tab", async ({ page }) => {
    await page.getByRole("button", { name: /^(Week|Weekly)$/ }).click();
    await page.getByRole("button", { name: "Report", exact: true }).click();

    await expect(page.getByRole("button", { name: "Copy for AI Chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rich Copy (for TPM)" })).toBeVisible();
  });

  test("past weeks open the Week tab on Review by default", async ({ page }) => {
    test.skip(RUNS_AGAINST_PRODUCTION, "Past-week defaults are verified against the PR preview until merged");
    await page.getByRole("button", { name: /^(Week|Weekly)$/ }).click();
    await expect(page.getByRole("button", { name: "Plan", exact: true }).last()).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Previous week" }).click();
    await expect(page.getByRole("button", { name: "Review", exact: true }).last()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Territory Breakdown")).toBeVisible();
  });

  test("locked past-day controls are disabled for keyboard as well as pointer input", async ({ page }) => {
    await page.getByRole("button", { name: "Previous week" }).click();
    await page.getByRole("button", { name: /^Mon 0$/ }).click();
    const locked = page.locator("fieldset:disabled").first();
    await expect(locked).toBeVisible();
    await expect(locked.locator("input, textarea, button").first()).toBeDisabled();
  });

  test("tab navigation works — Review shows monthly report actions", async ({ page }) => {
    await page.getByRole("button", { name: /^(Review|Export)$/ }).click();
    await expect(page.getByRole("button", { name: /copy (report|for ai chat)/i })).toBeVisible();
  });

  test("Review: SQL Dump button is NOT visible in demo mode (no user)", async ({ page }) => {
    await page.getByRole("button", { name: /^(Review|Export)$/ }).click();
    // Download SQL Dump button only shows for authenticated users
    await expect(page.getByRole("button", { name: /download sql dump/i })).not.toBeVisible();
  });

  test("Wolf check buttons are visible and toggleable", async ({ page }) => {
    await switchToCloseWhenAvailable(page);
    await expect(page.getByText("Wise")).toBeVisible();
    await expect(page.getByText("Open")).toBeVisible();
    await expect(page.getByText("Loving")).toBeVisible();
    await expect(page.getByText("Fierce")).toBeVisible();

    // Click Wise
    await page.getByRole("button", { name: "Wise" }).click();
    await expect(page.getByText(/✓ saved/)).toBeVisible({ timeout: 3_000 });
  });

  test("Drink counter increments and saves", async ({ page }) => {
    await switchToCloseWhenAvailable(page);
    await page.getByRole("button", { name: "Increase 🥃 Drinks Today" }).click();
    await expect(page.getByText(/✓ saved/)).toBeVisible({ timeout: 3_000 });
  });

  test("July review works without pre-existing goals", async ({ page }) => {
    test.skip(RUNS_AGAINST_PRODUCTION, "Monthly review is verified against the PR preview until merged");
    await page.getByRole("button", { name: "Review" }).click();
    await expect(page.getByLabel("Review month")).toHaveValue("2026-07");

    await expect(page.getByText("No goals were set for July 2026", { exact: false })).toBeVisible();
    await expect(page.getByText("You can still complete the review from memory", { exact: false })).toBeVisible();
    await expect(page.getByText("What were my greatest accomplishments this month, and which am I most proud of?", { exact: true })).toBeVisible();
    await expect(page.getByText("What were my greatest achievements this past month?", { exact: true })).toHaveCount(0);
  });

  test("monthly evidence includes the final week and renders calendar denominators", async ({ page }) => {
    test.skip(RUNS_AGAINST_PRODUCTION, "Monthly review fixture must run against the checked-out app");
    await page.evaluate(() => {
      localStorage.setItem("coil_tracker_settings", JSON.stringify({ fastingEnabled: true }));
      localStorage.setItem("coil_archived_weeks", JSON.stringify([{
        weekOf: "2026-07-27",
        archivedAt: "2026-08-01T00:00:00.000Z",
        data: {
          weekOf: "2026-08-02T00:00:00.000Z",
          days: {
            mon: {
              territories: { self: true, health: false, wealth: false, relationships: false, business: false },
              trackers: { fasting: true },
              journal: "Final July week",
            },
          },
          weekly: {},
        },
      }]));
    });
    await page.reload();
    await page.getByRole("button", { name: "Review" }).click();

    await expect(page.getByText("Week of Jul 27", { exact: true })).toBeVisible();
    const fasting = page.locator("details", { hasText: "Fasting" });
    await expect(fasting).toContainText("1/31");
    await expect(page.getByText("1/31", { exact: true }).first()).toBeVisible();
  });

  test("July review creates and applies an August plan", async ({ page }) => {
    test.skip(RUNS_AGAINST_PRODUCTION, "Monthly review is verified against the PR preview until merged");
    await page.getByRole("button", { name: "Review" }).click();
    await expect(page.getByLabel("Review month")).toHaveValue("2026-07");
    await page.getByRole("button", { name: "Plan next month" }).click();

    await expect(page.getByLabel("Plan month")).toHaveValue("2026-08");
    await page.getByText("What is the one thing I must accomplish this month?", { exact: true })
      .locator("..")
      .getByRole("textbox")
      .fill("Launch August release");
    await page.locator('input[placeholder="Outcome / priority"]').last().fill("Ship the release");
    await page.getByRole("button", { name: "Save & apply monthly plan" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

    const stored = await page.evaluate(() => ({
      review: JSON.parse(localStorage.getItem("coil_review_month_2026-07") ?? "null"),
      plan: JSON.parse(localStorage.getItem("coil_monthly_plan_2026-08") ?? "null"),
    }));
    expect(stored.review.__plan.targetMonth).toBe("2026-08");
    expect(stored.review.__plan.responses.mustWin).toBe("Launch August release");
    expect(stored.plan.startsOn).toBe("2026-08-01");
    expect(stored.plan.endsOn).toBe("2026-08-31");
    expect(stored.plan.territories.business.outcome).toBe("Ship the release");

    await page.getByRole("button", { name: "Plan", exact: true }).click();
    await expect(page.getByLabel("Plan month")).toHaveValue("2026-08");
    await expect(page.getByText("Monthly plan", { exact: true })).toBeVisible();
    await expect(page.getByText("Launch August release", { exact: true })).toBeVisible();
    await expect(page.locator('input[placeholder="Outcome"]').last()).toHaveValue("Ship the release");

    await page.locator('textarea[placeholder="The must-win for this month..."]').fill("Edited from Plan tab");
    await page.locator('input[placeholder="Outcome"]').last().fill("Updated release outcome");
    await page.getByRole("button", { name: "Save plan" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

    await page.getByRole("button", { name: "Review", exact: true }).first().click();
    await page.getByRole("button", { name: "Plan next month" }).click();
    await expect(page.getByText("What is the one thing I must accomplish this month?", { exact: true })
      .locator("..")
      .getByRole("textbox")).toHaveValue("Edited from Plan tab");
    await expect(page.locator('input[placeholder="Outcome / priority"]').last()).toHaveValue("Updated release outcome");
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
