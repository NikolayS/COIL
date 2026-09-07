import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ weekStart: "monday", timeZone: "America/Los_Angeles", queriedWeeks: [] as string[] }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { admin: {
      getUserById: async () => ({ data: { user: { email: "fixture@example.test" } } }),
      listUsers: async () => ({ data: { users: [{ id: "fixture-user", email: "fixture@example.test" }] } }),
    } },
    from: (table: string) => {
      const setting = { user_id: "fixture-user", week_start: state.weekStart, timezone: state.timeZone, email_pdf: false };
      const query = {
        select: () => query,
        eq: (column: string, value: string) => { if (table === "weeks" && column === "week_of") state.queriedWeeks.push(value); return query; },
        maybeSingle: async () => ({ data: table === "settings" ? setting : { data: {
          // Deliberately mismatched legacy timestamp: exports must use the queried row key.
          weekOf: "2026-08-23T23:00:00.000Z",
          days: Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(day => [day, { territories: {}, wolf: [], drinks: 0, journal: "", reflection: "" }])),
          weekly: {},
        } } }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [setting], error: null }).then(resolve),
      };
      return query;
    },
  }),
}));

import { POST as sendEmail } from "../app/api/email/test/route";
import { POST as weeklyCron } from "../app/api/cron/weekly-email/route";

beforeEach(() => {
  state.weekStart = "monday";
  state.timeZone = "America/Los_Angeles";
  state.queriedWeeks = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-24T00:30:00Z"));
  vi.stubEnv("CRON_SECRET", "fixture-only");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-only");
  vi.stubEnv("RESEND_API_KEY", "fixture-only");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "fixture-message" }), { status: 200 })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const request = (body: object) => new NextRequest("http://localhost/api/email/test", { method: "POST", body: JSON.stringify({ userId: "fixture-user", ...body }) });
const cronRequest = () => new NextRequest("http://localhost/api/cron/weekly-email", { method: "POST", headers: { authorization: "Bearer fixture-only" } });

describe("actual email route week selection", () => {
  it("uses settings timezone at the UTC Monday / LA Sunday boundary", async () => {
    expect((await sendEmail(request({ weekChoice: "current" }))).status).toBe(200);
    expect(state.queriedWeeks).toEqual(["2026-08-17"]);
  });
  it("supports Sunday starts and previous calendar weeks", async () => {
    state.weekStart = "sunday";
    vi.setSystemTime(new Date("2026-08-28T16:00:00Z"));
    await sendEmail(request({ weekChoice: "previous" }));
    expect(state.queriedWeeks).toEqual(["2026-08-16"]);
  });
  it("honors an exact URL/export key and renders its calendar date", async () => {
    await sendEmail(request({ weekOf: "2026-08-24" }));
    expect(state.queriedWeeks).toEqual(["2026-08-24"]);
    const options = vi.mocked(fetch).mock.calls[0][1];
    expect(JSON.parse(String(options?.body)).html).toContain("Aug 24, 2026");
  });
  it("cron does not send on Monday UTC while settings timezone is still Sunday", async () => {
    expect((await weeklyCron(cronRequest())).status).toBe(200);
    expect(state.queriedWeeks).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ["monday", "2026-08-24T18:00:00Z", "2026-08-17"],
    ["sunday", "2026-08-23T18:00:00Z", "2026-08-16"],
  ])("cron sends completed %s-start week", async (start, now, expected) => {
    state.weekStart = start;
    vi.setSystemTime(new Date(now));
    expect((await weeklyCron(cronRequest())).status).toBe(200);
    expect(state.queriedWeeks).toEqual([expected]);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
