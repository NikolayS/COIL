/**
 * Unit tests for POST /api/cron/weekly-email
 *
 * Tests the route handler logic with mocked Supabase and Resend.
 * Covers: missing CRON_SECRET → 401, wrong secret → 401,
 * valid secret triggers send, no enabled users → 0 sent,
 * day-of-week filtering, missing week data → skipped.
 */

import { describe, it, expect, vi } from "vitest";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SettingRow {
  user_id: string;
  weekly_email_hour: number | null;
  weekly_email_day: string | null;
  report_email: string | null;
  timezone: string | null;
}

interface UserRow {
  id: string;
  email: string;
}

interface MockSupabase {
  getSettings: () => Promise<{ data: SettingRow[] | null; error: null }>;
  listUsers: () => Promise<{ data: { users: UserRow[] } | null }>;
  getWeek: (userId: string, monday: string) => Promise<{ data: { data: unknown } | null }>;
}

interface MockResend {
  send: () => Promise<{ ok: boolean }>;
}

// ── Route logic extracted for testability ─────────────────────────────────────

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const MINIMAL_WEEK_DATA = {
  weekOf: "2025-01-06T00:00:00.000Z",
  days: {
    mon: { territories: { self: true, health: false, relationships: false, wealth: false, business: false }, wolf: [], drinks: 0, journal: "", reflection: "" },
    tue: { territories: { self: false, health: false, relationships: false, wealth: false, business: false }, wolf: [], drinks: 0, journal: "", reflection: "" },
    wed: { territories: { self: false, health: false, relationships: false, wealth: false, business: false }, wolf: [], drinks: 0, journal: "", reflection: "" },
    thu: { territories: { self: false, health: false, relationships: false, wealth: false, business: false }, wolf: [], drinks: 0, journal: "", reflection: "" },
    fri: { territories: { self: false, health: false, relationships: false, wealth: false, business: false }, wolf: [], drinks: 0, journal: "", reflection: "" },
    sat: { territories: { self: false, health: false, relationships: false, wealth: false, business: false }, wolf: [], drinks: 0, journal: "", reflection: "" },
    sun: { territories: { self: false, health: false, relationships: false, wealth: false, business: false }, wolf: [], drinks: 0, journal: "", reflection: "" },
  },
  weekly: { wins: "", gratitude: "", lessons: "", focusAchieved: "", focusNext: "", stretchNext: "", onTrack: "", cupOverflowing: "", improve: "" },
};

async function handleCronWeeklyEmail(
  authHeader: string | null,
  cronSecret: string | undefined,
  config: { serviceRoleKey: string; resendApiKey: string },
  supabase: MockSupabase,
  resend: MockResend,
  now: Date = new Date()
): Promise<{ status: number; json: Record<string, unknown> }> {
  // Auth check
  if (authHeader !== `Bearer ${cronSecret}`) {
    return { status: 401, json: { error: "Unauthorized" } };
  }

  if (!config.serviceRoleKey || !config.resendApiKey) {
    return { status: 500, json: { error: "Missing server configuration" } };
  }

  const { data: settings, error: settingsError } = await supabase.getSettings();
  if (settingsError) {
    return { status: 500, json: { error: "DB error" } };
  }

  if (!settings || settings.length === 0) {
    return { status: 200, json: { sent: 0, message: "No users with weekly email enabled" } };
  }

  const { data: usersData } = await supabase.listUsers();
  const emailMap = new Map<string, string>();
  if (usersData?.users) {
    for (const u of usersData.users) {
      if (u.email) emailMap.set(u.id, u.email);
    }
  }

  const monday = getMondayOfWeek(now).toISOString().slice(0, 10);
  const nowDay = now.getDay(); // 0=Sun, 6=Sat
  let sent = 0;

  for (const setting of settings) {
    const authEmail = emailMap.get(setting.user_id);
    if (!authEmail) continue;
    const email = (setting.report_email as string | null) || authEmail;

    const prefDay = (setting.weekly_email_day as string | null) ?? "sunday";
    const sendOnDay = prefDay === "saturday" ? 6 : 0;
    if (nowDay !== sendOnDay) continue;

    const { data: weekRow } = await supabase.getWeek(setting.user_id, monday);
    if (!weekRow?.data) continue;

    const result = await resend.send();
    if (result.ok) sent++;
  }

  return { status: 200, json: { sent, total: settings.length } };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CRON_SECRET = "super-secret-cron-token";
const VALID_CONFIG = { serviceRoleKey: "svc-key", resendApiKey: "re_key" };

// Sunday at noon UTC
const SUNDAY_NOW = new Date("2025-01-12T12:00:00.000Z"); // day=0
// Saturday at noon UTC
const SATURDAY_NOW = new Date("2025-01-11T12:00:00.000Z"); // day=6
// Wednesday — not a send day
const WEDNESDAY_NOW = new Date("2025-01-08T12:00:00.000Z"); // day=3

const DEFAULT_SETTING: SettingRow = {
  user_id: "user-1",
  weekly_email_hour: 18,
  weekly_email_day: "sunday",
  report_email: null,
  timezone: "UTC",
};

const DEFAULT_USER: UserRow = { id: "user-1", email: "nik@postgres.ai" };

function makeSup(overrides: Partial<MockSupabase> = {}): MockSupabase {
  return {
    getSettings: vi.fn().mockResolvedValue({ data: [DEFAULT_SETTING], error: null }),
    listUsers: vi.fn().mockResolvedValue({ data: { users: [DEFAULT_USER] } }),
    getWeek: vi.fn().mockResolvedValue({ data: { data: MINIMAL_WEEK_DATA } }),
    ...overrides,
  };
}

function makeResend(ok = true): MockResend {
  return { send: vi.fn().mockResolvedValue({ ok }) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/cron/weekly-email — authorization", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const r = await handleCronWeeklyEmail(null, CRON_SECRET, VALID_CONFIG, makeSup(), makeResend());
    expect(r.status).toBe(401);
    expect(r.json.error).toMatch(/unauthorized/i);
  });

  it("returns 401 when CRON_SECRET env var is undefined", async () => {
    // If env var missing, `Bearer undefined` !== `Bearer <secret>`
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, undefined, VALID_CONFIG, makeSup(), makeResend());
    expect(r.status).toBe(401);
  });

  it("returns 401 when secret is wrong", async () => {
    const r = await handleCronWeeklyEmail("Bearer wrong-secret", CRON_SECRET, VALID_CONFIG, makeSup(), makeResend());
    expect(r.status).toBe(401);
  });

  it("returns 401 when header format is wrong (no Bearer prefix)", async () => {
    const r = await handleCronWeeklyEmail(CRON_SECRET, CRON_SECRET, VALID_CONFIG, makeSup(), makeResend());
    expect(r.status).toBe(401);
  });

  it("proceeds past auth with correct secret", async () => {
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, CRON_SECRET, VALID_CONFIG, makeSup(), makeResend(), SUNDAY_NOW);
    expect(r.status).toBe(200);
  });
});

describe("POST /api/cron/weekly-email — send logic", () => {
  it("returns sent=0 when no users have weekly email enabled", async () => {
    const sup = makeSup({
      getSettings: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, CRON_SECRET, VALID_CONFIG, sup, makeResend(), SUNDAY_NOW);
    expect(r.status).toBe(200);
    expect(r.json.sent).toBe(0);
  });

  it("sends on Sunday for sunday preference", async () => {
    const resend = makeResend();
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, CRON_SECRET, VALID_CONFIG, makeSup(), resend, SUNDAY_NOW);
    expect(r.status).toBe(200);
    expect(r.json.sent).toBe(1);
    expect(resend.send).toHaveBeenCalledTimes(1);
  });

  it("does NOT send on Saturday for sunday preference", async () => {
    const resend = makeResend();
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, CRON_SECRET, VALID_CONFIG, makeSup(), resend, SATURDAY_NOW);
    expect(r.status).toBe(200);
    expect(r.json.sent).toBe(0);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("sends on Saturday for saturday preference", async () => {
    const sup = makeSup({
      getSettings: vi.fn().mockResolvedValue({
        data: [{ ...DEFAULT_SETTING, weekly_email_day: "saturday" }],
        error: null,
      }),
    });
    const resend = makeResend();
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, CRON_SECRET, VALID_CONFIG, sup, resend, SATURDAY_NOW);
    expect(r.status).toBe(200);
    expect(r.json.sent).toBe(1);
    expect(resend.send).toHaveBeenCalledTimes(1);
  });

  it("does NOT send on weekdays", async () => {
    const resend = makeResend();
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, CRON_SECRET, VALID_CONFIG, makeSup(), resend, WEDNESDAY_NOW);
    expect(r.status).toBe(200);
    expect(r.json.sent).toBe(0);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("skips user with no week data", async () => {
    const sup = makeSup({
      getWeek: vi.fn().mockResolvedValue({ data: null }),
    });
    const resend = makeResend();
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, CRON_SECRET, VALID_CONFIG, sup, resend, SUNDAY_NOW);
    expect(r.status).toBe(200);
    expect(r.json.sent).toBe(0);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("skips user not in auth.users map", async () => {
    const sup = makeSup({
      listUsers: vi.fn().mockResolvedValue({ data: { users: [] } }), // empty
    });
    const resend = makeResend();
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, CRON_SECRET, VALID_CONFIG, sup, resend, SUNDAY_NOW);
    expect(r.status).toBe(200);
    expect(r.json.sent).toBe(0);
  });

  it("uses report_email over auth email when set", async () => {
    const sup = makeSup({
      getSettings: vi.fn().mockResolvedValue({
        data: [{ ...DEFAULT_SETTING, report_email: "custom@reports.io" }],
        error: null,
      }),
    });
    // We can't easily assert the To: address in this extracted logic without
    // more instrumentation, but we can assert it sends successfully
    const resend = makeResend();
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, CRON_SECRET, VALID_CONFIG, sup, resend, SUNDAY_NOW);
    expect(r.json.sent).toBe(1);
  });

  it("sends to multiple users on correct day", async () => {
    const user2: SettingRow = { user_id: "user-2", weekly_email_day: "sunday", weekly_email_hour: 10, report_email: null, timezone: "UTC" };
    const sup = makeSup({
      getSettings: vi.fn().mockResolvedValue({ data: [DEFAULT_SETTING, user2], error: null }),
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [DEFAULT_USER, { id: "user-2", email: "other@example.com" }] },
      }),
    });
    const resend = makeResend();
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, CRON_SECRET, VALID_CONFIG, sup, resend, SUNDAY_NOW);
    expect(r.json.sent).toBe(2);
    expect(resend.send).toHaveBeenCalledTimes(2);
  });

  it("counts only successful Resend calls in sent", async () => {
    const user2: SettingRow = { user_id: "user-2", weekly_email_day: "sunday", weekly_email_hour: 10, report_email: null, timezone: "UTC" };
    const sup = makeSup({
      getSettings: vi.fn().mockResolvedValue({ data: [DEFAULT_SETTING, user2], error: null }),
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [DEFAULT_USER, { id: "user-2", email: "other@example.com" }] },
      }),
    });
    // First call succeeds, second fails
    const resend: MockResend = {
      send: vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false }),
    };
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, CRON_SECRET, VALID_CONFIG, sup, resend, SUNDAY_NOW);
    expect(r.json.sent).toBe(1);
    expect(r.json.total).toBe(2);
  });

  it("null weekly_email_day defaults to sunday", async () => {
    const sup = makeSup({
      getSettings: vi.fn().mockResolvedValue({
        data: [{ ...DEFAULT_SETTING, weekly_email_day: null }],
        error: null,
      }),
    });
    const resend = makeResend();
    const r = await handleCronWeeklyEmail(`Bearer ${CRON_SECRET}`, CRON_SECRET, VALID_CONFIG, sup, resend, SUNDAY_NOW);
    expect(r.json.sent).toBe(1);
  });
});
