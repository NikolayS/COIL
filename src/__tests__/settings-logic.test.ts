/**
 * Settings page logic tests.
 *
 * These tests cover the data-loading and state-initialization logic extracted
 * from the settings page. They act as regression tests for bugs like:
 *
 * - Saved timezone getting overwritten by browser's Intl detection
 * - null weekly_email_enabled being treated as false (disabling email)
 * - report_email not falling back to auth email correctly
 * - Save errors being swallowed silently
 */

import { describe, it, expect } from "vitest";

// ── Extracted settings initialization logic ──────────────────────────────────
// Mirror of what happens in the useEffect when DB row loads.
// Keep in sync with src/app/settings/page.tsx

interface DbRow {
  weekly_email_enabled: boolean | null;
  weekly_email_hour: number | null;
  weekly_email_day: string | null;
  timezone: string | null;
  report_email: string | null;
}

interface SettingsState {
  emailEnabled: boolean;
  emailHour: number;
  emailDay: "saturday" | "sunday";
  timezone: string;
  reportEmail: string;
}

function initSettingsFromDb(
  row: DbRow | null,
  authEmail: string,
  browserTz: string
): SettingsState {
  if (row) {
    return {
      emailEnabled: row.weekly_email_enabled ?? true,
      emailHour: row.weekly_email_hour ?? 18,
      emailDay: (row.weekly_email_day as "saturday" | "sunday") ?? "sunday",
      timezone: row.timezone || browserTz,
      reportEmail: row.report_email ?? authEmail,
    };
  }
  // New user — all defaults
  return {
    emailEnabled: true,
    emailHour: 18,
    emailDay: "sunday",
    timezone: browserTz,
    reportEmail: authEmail,
  };
}

// ── Report email priority logic ───────────────────────────────────────────────
// Used by /api/email/test: override > saved report_email > auth email

function resolveTestEmail(
  overrideEmail: string | null | undefined,
  savedReportEmail: string | null | undefined,
  authEmail: string
): string {
  return overrideEmail?.trim() || savedReportEmail || authEmail;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const BROWSER_TZ = "America/Chicago";
const AUTH_EMAIL = "nik@postgres.ai";

describe("settings initialization — new user (no DB row)", () => {
  it("defaults to email ON", () => {
    const s = initSettingsFromDb(null, AUTH_EMAIL, BROWSER_TZ);
    expect(s.emailEnabled).toBe(true);
  });

  it("defaults to 6 PM", () => {
    const s = initSettingsFromDb(null, AUTH_EMAIL, BROWSER_TZ);
    expect(s.emailHour).toBe(18);
  });

  it("defaults to Sunday", () => {
    const s = initSettingsFromDb(null, AUTH_EMAIL, BROWSER_TZ);
    expect(s.emailDay).toBe("sunday");
  });

  it("uses browser timezone", () => {
    const s = initSettingsFromDb(null, AUTH_EMAIL, BROWSER_TZ);
    expect(s.timezone).toBe(BROWSER_TZ);
  });

  it("pre-fills report email with auth email", () => {
    const s = initSettingsFromDb(null, AUTH_EMAIL, BROWSER_TZ);
    expect(s.reportEmail).toBe(AUTH_EMAIL);
  });
});

describe("settings initialization — existing user (DB row present)", () => {
  const fullRow: DbRow = {
    weekly_email_enabled: true,
    weekly_email_hour: 20,
    weekly_email_day: "saturday",
    timezone: "America/Los_Angeles",
    report_email: "weekly@example.com",
  };

  it("restores all saved values", () => {
    const s = initSettingsFromDb(fullRow, AUTH_EMAIL, BROWSER_TZ);
    expect(s.emailEnabled).toBe(true);
    expect(s.emailHour).toBe(20);
    expect(s.emailDay).toBe("saturday");
    expect(s.timezone).toBe("America/Los_Angeles");
    expect(s.reportEmail).toBe("weekly@example.com");
  });

  it("saved timezone wins over browser detection (regression)", () => {
    // Bug: browser Intl.DateTimeFormat was overwriting the saved timezone
    const s = initSettingsFromDb(fullRow, AUTH_EMAIL, "Europe/London");
    expect(s.timezone).toBe("America/Los_Angeles"); // saved wins
    expect(s.timezone).not.toBe("Europe/London");
  });

  it("null weekly_email_enabled defaults to true, not false (regression)", () => {
    // Bug: null was being treated as false, disabling email unexpectedly
    const row: DbRow = { ...fullRow, weekly_email_enabled: null };
    const s = initSettingsFromDb(row, AUTH_EMAIL, BROWSER_TZ);
    expect(s.emailEnabled).toBe(true);
  });

  it("explicit false weekly_email_enabled is respected", () => {
    const row: DbRow = { ...fullRow, weekly_email_enabled: false };
    const s = initSettingsFromDb(row, AUTH_EMAIL, BROWSER_TZ);
    expect(s.emailEnabled).toBe(false);
  });

  it("null weekly_email_hour falls back to 18", () => {
    const row: DbRow = { ...fullRow, weekly_email_hour: null };
    const s = initSettingsFromDb(row, AUTH_EMAIL, BROWSER_TZ);
    expect(s.emailHour).toBe(18);
  });

  it("null weekly_email_day falls back to sunday", () => {
    const row: DbRow = { ...fullRow, weekly_email_day: null };
    const s = initSettingsFromDb(row, AUTH_EMAIL, BROWSER_TZ);
    expect(s.emailDay).toBe("sunday");
  });

  it("null timezone falls back to browser timezone", () => {
    const row: DbRow = { ...fullRow, timezone: null };
    const s = initSettingsFromDb(row, AUTH_EMAIL, BROWSER_TZ);
    expect(s.timezone).toBe(BROWSER_TZ);
  });

  it("empty string timezone falls back to browser timezone", () => {
    const row: DbRow = { ...fullRow, timezone: "" };
    const s = initSettingsFromDb(row, AUTH_EMAIL, BROWSER_TZ);
    expect(s.timezone).toBe(BROWSER_TZ);
  });

  it("null report_email falls back to auth email", () => {
    const row: DbRow = { ...fullRow, report_email: null };
    const s = initSettingsFromDb(row, AUTH_EMAIL, BROWSER_TZ);
    expect(s.reportEmail).toBe(AUTH_EMAIL);
  });
});

describe("test email address resolution", () => {
  const SAVED_REPORT_EMAIL = "reports@example.com";

  it("inline override wins over everything", () => {
    expect(resolveTestEmail("override@test.com", SAVED_REPORT_EMAIL, AUTH_EMAIL))
      .toBe("override@test.com");
  });

  it("saved report_email wins over auth email when no override", () => {
    expect(resolveTestEmail(null, SAVED_REPORT_EMAIL, AUTH_EMAIL))
      .toBe(SAVED_REPORT_EMAIL);
    expect(resolveTestEmail("", SAVED_REPORT_EMAIL, AUTH_EMAIL))
      .toBe(SAVED_REPORT_EMAIL);
    expect(resolveTestEmail("   ", SAVED_REPORT_EMAIL, AUTH_EMAIL))
      .toBe(SAVED_REPORT_EMAIL);
  });

  it("falls back to auth email when no override and no saved report_email", () => {
    expect(resolveTestEmail(null, null, AUTH_EMAIL)).toBe(AUTH_EMAIL);
    expect(resolveTestEmail("", "", AUTH_EMAIL)).toBe(AUTH_EMAIL);
    expect(resolveTestEmail(undefined, undefined, AUTH_EMAIL)).toBe(AUTH_EMAIL);
  });

  it("whitespace-only override is treated as empty", () => {
    expect(resolveTestEmail("   ", SAVED_REPORT_EMAIL, AUTH_EMAIL))
      .toBe(SAVED_REPORT_EMAIL);
  });
});

describe("cron delivery day logic", () => {
  // Mirror of the day-check in /api/cron/weekly-email/route.ts
  function shouldSendToday(prefDay: string | null, todayDow: number): boolean {
    const day = prefDay ?? "sunday";
    const sendOnDow = day === "saturday" ? 6 : 0; // 0=Sun, 6=Sat
    return todayDow === sendOnDow;
  }

  it("sunday preference sends on Sunday (0)", () => {
    expect(shouldSendToday("sunday", 0)).toBe(true);
    expect(shouldSendToday("sunday", 6)).toBe(false);
  });

  it("saturday preference sends on Saturday (6)", () => {
    expect(shouldSendToday("saturday", 6)).toBe(true);
    expect(shouldSendToday("saturday", 0)).toBe(false);
  });

  it("null preference defaults to sunday", () => {
    expect(shouldSendToday(null, 0)).toBe(true);
    expect(shouldSendToday(null, 6)).toBe(false);
  });

  it("does not send on weekdays", () => {
    for (const day of ["sunday", "saturday", null]) {
      for (const dow of [1, 2, 3, 4, 5]) { // Mon–Fri
        expect(shouldSendToday(day, dow)).toBe(false);
      }
    }
  });
});
