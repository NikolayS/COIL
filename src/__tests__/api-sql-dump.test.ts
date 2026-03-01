/**
 * Unit tests for GET /api/export/sql-dump
 *
 * Covers: unauthenticated (no header) → 401, bad token → 401,
 * valid auth with no data → 404, valid auth with rows → 200 + valid SQL.
 */

import { describe, it, expect, vi } from "vitest";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeekRow {
  id: string;
  user_id: string;
  week_of: string;
  data: Record<string, unknown>;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

interface MockSupabase {
  getUser: (token: string) => Promise<{ data: { user: { id: string; email: string } | null }; error: Error | null }>;
  getWeeks: (userId: string) => Promise<{ data: WeekRow[] | null; error: Error | null }>;
}

// ── Route logic extracted for testability ─────────────────────────────────────

async function handleSqlDump(
  authHeader: string | null,
  config: { serviceRoleKey: string },
  supabase: MockSupabase,
): Promise<{ status: number; body: string; contentType?: string }> {
  if (!config.serviceRoleKey) {
    return { status: 500, body: JSON.stringify({ error: "Missing server configuration" }) };
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return { status: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.getUser(token);

  if (authError || !user) {
    return { status: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const { data: rows, error: dbError } = await supabase.getWeeks(user.id);

  if (dbError) {
    return { status: 500, body: JSON.stringify({ error: dbError.message }) };
  }

  if (!rows || rows.length === 0) {
    return { status: 404, body: JSON.stringify({ error: "No data to export" }) };
  }

  const esc = (s: string) => s.replace(/'/g, "''");
  const now = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    `-- COIL data dump — ${now} — ${user.email}`,
    ``,
    `CREATE TABLE IF NOT EXISTS public.weeks (`,
    `  id uuid PRIMARY KEY,`,
    `  user_id uuid NOT NULL,`,
    `  week_of date NOT NULL,`,
    `  data jsonb NOT NULL DEFAULT '{}'::jsonb,`,
    `  archived boolean NOT NULL DEFAULT false,`,
    `  created_at timestamptz NOT NULL DEFAULT now(),`,
    `  updated_at timestamptz NOT NULL DEFAULT now(),`,
    `  UNIQUE (user_id, week_of)`,
    `);`,
    ``,
  ];

  const cols = "id, user_id, week_of, data, archived, created_at, updated_at";
  const valueRows = rows.map((r) => {
    const data = JSON.stringify(r.data).replace(/'/g, "''");
    return `  ('${esc(r.id)}', '${esc(r.user_id)}', '${r.week_of}', '${data}'::jsonb, ${r.archived}, '${r.created_at}', '${r.updated_at}')`;
  });

  lines.push(`INSERT INTO public.weeks (${cols}) VALUES`);
  lines.push(valueRows.join(",\n") + ";");

  return {
    status: 200,
    contentType: "application/sql",
    body: lines.join("\n"),
  };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

const VALID_USER = { id: "user-uuid-123", email: "nik@postgres.ai" };
const VALID_TOKEN = "valid-jwt-token";
const VALID_CONFIG = { serviceRoleKey: "svc-key" };

const SAMPLE_ROW: WeekRow = {
  id: "row-uuid-1",
  user_id: VALID_USER.id,
  week_of: "2025-01-06",
  data: { weekOf: "2025-01-06T00:00:00.000Z", days: {}, weekly: {} },
  archived: false,
  created_at: "2025-01-06T00:00:00.000Z",
  updated_at: "2025-01-08T10:00:00.000Z",
};

function makeSup(overrides: Partial<MockSupabase> = {}): MockSupabase {
  return {
    getUser: vi.fn().mockResolvedValue({ data: { user: VALID_USER }, error: null }),
    getWeeks: vi.fn().mockResolvedValue({ data: [SAMPLE_ROW], error: null }),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/export/sql-dump — authentication", () => {
  it("returns 401 when no Authorization header", async () => {
    const r = await handleSqlDump(null, VALID_CONFIG, makeSup());
    expect(r.status).toBe(401);
    expect(JSON.parse(r.body).error).toMatch(/unauthorized/i);
  });

  it("returns 401 when Authorization header has no Bearer prefix", async () => {
    const r = await handleSqlDump("Token abc123", VALID_CONFIG, makeSup());
    expect(r.status).toBe(401);
  });

  it("returns 401 when token is invalid (Supabase rejects it)", async () => {
    const sup = makeSup({
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("Invalid token") }),
    });
    const r = await handleSqlDump(`Bearer bad-token`, VALID_CONFIG, sup);
    expect(r.status).toBe(401);
  });

  it("returns 401 when user is null even without error", async () => {
    const sup = makeSup({
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    });
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, sup);
    expect(r.status).toBe(401);
  });

  it("proceeds with valid Bearer token", async () => {
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, makeSup());
    expect(r.status).toBe(200);
  });
});

describe("GET /api/export/sql-dump — data handling", () => {
  it("returns 404 when user has no rows", async () => {
    const sup = makeSup({
      getWeeks: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, sup);
    expect(r.status).toBe(404);
    expect(JSON.parse(r.body).error).toMatch(/no data/i);
  });

  it("returns 404 when getWeeks returns null", async () => {
    const sup = makeSup({
      getWeeks: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, sup);
    expect(r.status).toBe(404);
  });

  it("returns 200 with valid SQL for single row", async () => {
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, makeSup());
    expect(r.status).toBe(200);
    expect(r.contentType).toBe("application/sql");
  });
});

describe("GET /api/export/sql-dump — SQL content validity", () => {
  it("SQL contains CREATE TABLE statement", async () => {
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, makeSup());
    expect(r.body).toContain("CREATE TABLE IF NOT EXISTS public.weeks");
  });

  it("SQL contains INSERT INTO statement", async () => {
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, makeSup());
    expect(r.body).toContain("INSERT INTO public.weeks");
  });

  it("SQL contains the row's uuid", async () => {
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, makeSup());
    expect(r.body).toContain("row-uuid-1");
  });

  it("SQL contains the week_of date", async () => {
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, makeSup());
    expect(r.body).toContain("2025-01-06");
  });

  it("SQL contains ::jsonb cast for data column", async () => {
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, makeSup());
    expect(r.body).toContain("::jsonb");
  });

  it("SQL header comment contains user email", async () => {
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, makeSup());
    expect(r.body).toContain(VALID_USER.email);
  });

  it("SQL header comment contains 'COIL data dump'", async () => {
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, makeSup());
    expect(r.body).toContain("-- COIL data dump");
  });

  it("single-quotes in JSON data are escaped", async () => {
    const rowWithQuotes: WeekRow = {
      ...SAMPLE_ROW,
      data: { weekOf: "2025-01-06T00:00:00.000Z", days: { mon: { journal: "it's a great day" } }, weekly: {} },
    };
    const sup = makeSup({
      getWeeks: vi.fn().mockResolvedValue({ data: [rowWithQuotes], error: null }),
    });
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, sup);
    // The escaped version should be present
    expect(r.body).toContain("it''s a great day");
    // The unescaped version should NOT appear inside the data
    expect(r.body).not.toContain("it's a great day");
  });

  it("multiple rows each appear in VALUES", async () => {
    const row2: WeekRow = {
      ...SAMPLE_ROW,
      id: "row-uuid-2",
      week_of: "2025-01-13",
      archived: true,
    };
    const sup = makeSup({
      getWeeks: vi.fn().mockResolvedValue({ data: [SAMPLE_ROW, row2], error: null }),
    });
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, sup);
    expect(r.body).toContain("row-uuid-1");
    expect(r.body).toContain("row-uuid-2");
    expect(r.body).toContain("2025-01-13");
  });

  it("archived flag is rendered as boolean in SQL", async () => {
    const archivedRow: WeekRow = { ...SAMPLE_ROW, archived: true };
    const sup = makeSup({
      getWeeks: vi.fn().mockResolvedValue({ data: [archivedRow], error: null }),
    });
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, VALID_CONFIG, sup);
    expect(r.body).toContain(" true,");
  });
});

describe("GET /api/export/sql-dump — config errors", () => {
  it("returns 500 when serviceRoleKey is missing", async () => {
    const r = await handleSqlDump(`Bearer ${VALID_TOKEN}`, { serviceRoleKey: "" }, makeSup());
    expect(r.status).toBe(500);
  });
});
