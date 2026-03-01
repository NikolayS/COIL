/**
 * Unit tests for POST /api/email/test
 *
 * Tests the route handler logic with mocked Supabase and Resend.
 * Covers: no userId → 400, missing config → 500, user not found → 404,
 * weekChoice=current, weekChoice=previous, missing week → 404, Resend failure → 500.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Types (mirrors route internals) ──────────────────────────────────────────

type WeekChoice = "current" | "previous" | undefined;

interface RouteBody {
  userId?: string;
  overrideEmail?: string | null;
  weekChoice?: WeekChoice;
}

// ── Minimal WeekData for generating a valid report ────────────────────────────

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

// ── Route logic extracted for unit-testability ────────────────────────────────
// We test the *logic* of the route, not Next.js plumbing.
// This mirrors the handler's decision flow precisely.

interface MockSupabase {
  getUserById: (id: string) => Promise<{ data: { user: { email: string } | null } }>;
  getSettings: (userId: string) => Promise<{ data: { report_email: string | null } | null }>;
  getWeek: (userId: string, monday: string) => Promise<{ data: { data: unknown } | null }>;
}

interface MockResend {
  send: (payload: object) => Promise<{ ok: boolean; body?: string }>;
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function handleEmailTest(
  body: RouteBody,
  config: { serviceRoleKey: string; resendApiKey: string },
  supabase: MockSupabase,
  resend: MockResend,
  now: Date = new Date()
): Promise<{ status: number; json: Record<string, unknown> }> {
  const { userId, overrideEmail, weekChoice } = body;

  if (!userId) return { status: 400, json: { error: "userId required" } };
  if (!config.serviceRoleKey || !config.resendApiKey) return { status: 500, json: { error: "Missing server configuration" } };

  const { data: userData } = await supabase.getUserById(userId);
  const authEmail = userData?.user?.email;
  if (!authEmail) return { status: 404, json: { error: "User not found" } };

  const { data: settings } = await supabase.getSettings(userId);
  const email = overrideEmail?.trim() || settings?.report_email || authEmail;

  const currentMonday = getMondayOfWeek(now).toISOString().slice(0, 10);
  const prevMonday = getMondayOfWeek(
    new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  ).toISOString().slice(0, 10);

  const mondaysToTry = weekChoice === "previous"
    ? [prevMonday]
    : weekChoice === "current"
    ? [currentMonday]
    : [currentMonday, prevMonday];

  let weekRow: { data: unknown } | null = null;
  let usedMonday = mondaysToTry[0];

  for (const monday of mondaysToTry) {
    const { data } = await supabase.getWeek(userId, monday);
    if (data?.data) {
      weekRow = data;
      usedMonday = monday;
      break;
    }
  }

  if (!weekRow?.data) return { status: 404, json: { error: "No week data found" } };

  const result = await resend.send({
    to: email,
    subject: `[TEST] COIL Weekly Report — Week of ${usedMonday}`,
  });

  if (!result.ok) return { status: 500, json: { error: result.body ?? "Resend error" } };

  return { status: 200, json: { ok: true, week: usedMonday, email } };
}

// ── Test setup helpers ────────────────────────────────────────────────────────

const VALID_USER_ID = "user-uuid-123";
const AUTH_EMAIL = "nik@postgres.ai";
const CURRENT_MONDAY = "2025-01-06"; // The Monday for our test date (Wednesday Jan 8 2025)
const PREV_MONDAY = "2024-12-30";
const TEST_NOW = new Date("2025-01-08T12:00:00.000Z"); // Wednesday

const VALID_CONFIG = { serviceRoleKey: "svc-key", resendApiKey: "re_key" };

function makeSupabase(overrides: Partial<MockSupabase> = {}): MockSupabase {
  return {
    getUserById: vi.fn().mockResolvedValue({ data: { user: { email: AUTH_EMAIL } } }),
    getSettings: vi.fn().mockResolvedValue({ data: { report_email: null } }),
    getWeek: vi.fn().mockResolvedValue({ data: { data: MINIMAL_WEEK_DATA } }),
    ...overrides,
  };
}

function makeResend(ok = true): MockResend {
  return {
    send: vi.fn().mockResolvedValue({ ok, body: ok ? undefined : "Resend API error" }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/email/test — validation", () => {
  it("returns 400 when userId is missing", async () => {
    const r = await handleEmailTest({}, VALID_CONFIG, makeSupabase(), makeResend(), TEST_NOW);
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/userId/i);
  });

  it("returns 500 when serviceRoleKey is missing", async () => {
    const r = await handleEmailTest(
      { userId: VALID_USER_ID },
      { serviceRoleKey: "", resendApiKey: "re_key" },
      makeSupabase(), makeResend(), TEST_NOW
    );
    expect(r.status).toBe(500);
    expect(r.json.error).toMatch(/configuration/i);
  });

  it("returns 500 when resendApiKey is missing", async () => {
    const r = await handleEmailTest(
      { userId: VALID_USER_ID },
      { serviceRoleKey: "svc", resendApiKey: "" },
      makeSupabase(), makeResend(), TEST_NOW
    );
    expect(r.status).toBe(500);
  });

  it("returns 404 when user not found in Supabase auth", async () => {
    const sup = makeSupabase({
      getUserById: vi.fn().mockResolvedValue({ data: { user: null } }),
    });
    const r = await handleEmailTest({ userId: VALID_USER_ID }, VALID_CONFIG, sup, makeResend(), TEST_NOW);
    expect(r.status).toBe(404);
    expect(r.json.error).toMatch(/user not found/i);
  });
});

describe("POST /api/email/test — weekChoice=current", () => {
  it("queries the current Monday", async () => {
    const sup = makeSupabase();
    await handleEmailTest({ userId: VALID_USER_ID, weekChoice: "current" }, VALID_CONFIG, sup, makeResend(), TEST_NOW);
    expect(sup.getWeek).toHaveBeenCalledWith(VALID_USER_ID, CURRENT_MONDAY);
    expect(sup.getWeek).not.toHaveBeenCalledWith(VALID_USER_ID, PREV_MONDAY);
  });

  it("returns 200 with the current monday in json", async () => {
    const r = await handleEmailTest({ userId: VALID_USER_ID, weekChoice: "current" }, VALID_CONFIG, makeSupabase(), makeResend(), TEST_NOW);
    expect(r.status).toBe(200);
    expect(r.json.week).toBe(CURRENT_MONDAY);
  });

  it("returns 404 when current week has no data", async () => {
    const sup = makeSupabase({
      getWeek: vi.fn().mockResolvedValue({ data: null }),
    });
    const r = await handleEmailTest({ userId: VALID_USER_ID, weekChoice: "current" }, VALID_CONFIG, sup, makeResend(), TEST_NOW);
    expect(r.status).toBe(404);
    expect(r.json.error).toMatch(/no week data/i);
  });
});

describe("POST /api/email/test — weekChoice=previous", () => {
  it("queries the previous Monday only", async () => {
    const sup = makeSupabase();
    await handleEmailTest({ userId: VALID_USER_ID, weekChoice: "previous" }, VALID_CONFIG, sup, makeResend(), TEST_NOW);
    expect(sup.getWeek).toHaveBeenCalledWith(VALID_USER_ID, PREV_MONDAY);
    expect(sup.getWeek).not.toHaveBeenCalledWith(VALID_USER_ID, CURRENT_MONDAY);
  });

  it("returns 200 with previous monday in json", async () => {
    const sup = makeSupabase({
      getWeek: vi.fn()
        .mockImplementation((_uid: string, monday: string) =>
          Promise.resolve(monday === PREV_MONDAY ? { data: { data: MINIMAL_WEEK_DATA } } : { data: null })
        ),
    });
    const r = await handleEmailTest({ userId: VALID_USER_ID, weekChoice: "previous" }, VALID_CONFIG, sup, makeResend(), TEST_NOW);
    expect(r.status).toBe(200);
    expect(r.json.week).toBe(PREV_MONDAY);
  });

  it("returns 404 when previous week has no data", async () => {
    const sup = makeSupabase({
      getWeek: vi.fn().mockResolvedValue({ data: null }),
    });
    const r = await handleEmailTest({ userId: VALID_USER_ID, weekChoice: "previous" }, VALID_CONFIG, sup, makeResend(), TEST_NOW);
    expect(r.status).toBe(404);
  });
});

describe("POST /api/email/test — no weekChoice (tries current then previous)", () => {
  it("tries current first, falls back to previous", async () => {
    const sup = makeSupabase({
      getWeek: vi.fn()
        .mockImplementation((_uid: string, monday: string) =>
          Promise.resolve(monday === PREV_MONDAY ? { data: { data: MINIMAL_WEEK_DATA } } : { data: null })
        ),
    });
    const r = await handleEmailTest({ userId: VALID_USER_ID }, VALID_CONFIG, sup, makeResend(), TEST_NOW);
    expect(r.status).toBe(200);
    expect(r.json.week).toBe(PREV_MONDAY);
    expect(sup.getWeek).toHaveBeenCalledTimes(2);
  });

  it("returns 404 when neither week has data", async () => {
    const sup = makeSupabase({
      getWeek: vi.fn().mockResolvedValue({ data: null }),
    });
    const r = await handleEmailTest({ userId: VALID_USER_ID }, VALID_CONFIG, sup, makeResend(), TEST_NOW);
    expect(r.status).toBe(404);
  });
});

describe("POST /api/email/test — email address priority", () => {
  it("uses overrideEmail when provided", async () => {
    const sup = makeSupabase({
      getSettings: vi.fn().mockResolvedValue({ data: { report_email: "saved@example.com" } }),
    });
    const r = await handleEmailTest(
      { userId: VALID_USER_ID, overrideEmail: "override@test.com" },
      VALID_CONFIG, sup, makeResend(), TEST_NOW
    );
    expect(r.json.email).toBe("override@test.com");
  });

  it("uses saved report_email when no override", async () => {
    const sup = makeSupabase({
      getSettings: vi.fn().mockResolvedValue({ data: { report_email: "reports@example.com" } }),
    });
    const r = await handleEmailTest({ userId: VALID_USER_ID }, VALID_CONFIG, sup, makeResend(), TEST_NOW);
    expect(r.json.email).toBe("reports@example.com");
  });

  it("falls back to auth email when no override and no saved email", async () => {
    const sup = makeSupabase({
      getSettings: vi.fn().mockResolvedValue({ data: { report_email: null } }),
    });
    const r = await handleEmailTest({ userId: VALID_USER_ID }, VALID_CONFIG, sup, makeResend(), TEST_NOW);
    expect(r.json.email).toBe(AUTH_EMAIL);
  });

  it("ignores whitespace-only overrideEmail", async () => {
    const sup = makeSupabase({
      getSettings: vi.fn().mockResolvedValue({ data: { report_email: "saved@example.com" } }),
    });
    const r = await handleEmailTest(
      { userId: VALID_USER_ID, overrideEmail: "   " },
      VALID_CONFIG, sup, makeResend(), TEST_NOW
    );
    expect(r.json.email).toBe("saved@example.com");
  });
});

describe("POST /api/email/test — Resend failure", () => {
  it("returns 500 when Resend returns a non-ok response", async () => {
    const r = await handleEmailTest(
      { userId: VALID_USER_ID },
      VALID_CONFIG,
      makeSupabase(),
      makeResend(false),
      TEST_NOW
    );
    expect(r.status).toBe(500);
    expect(r.json.error).toBeTruthy();
  });

  it("returns 200 when Resend succeeds", async () => {
    const r = await handleEmailTest(
      { userId: VALID_USER_ID },
      VALID_CONFIG,
      makeSupabase(),
      makeResend(true),
      TEST_NOW
    );
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
  });
});
