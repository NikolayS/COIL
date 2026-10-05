import { beforeEach, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateConsolidatedReportPdf } from "@/lib/generatePdf";
import { QUARTERLY_REVIEW_PROMPTS } from "@/lib/review-prompts";

const state = vi.hoisted(() => ({
  user: { id: "fixture-user" } as { id: string } | null,
  error: null as { message: string } | null,
  filters: [] as [string, string, unknown][],
}));
vi.mock("@/lib/supabase-server", () => ({ createServerSupabaseClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user } }) },
  from: (table: string) => {
    const result = () => ({ data: table === "weeks" ? [] : table === "period_reviews" ? { responses: { accomplished: "Saved quarter answer" } } : {}, error: state.error });
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { state.filters.push([table, column, value]); return query; },
      gte: () => query, lte: () => query, order: () => query,
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  },
}) }));
import { GET } from "@/app/api/pdf/quarterly-review/route";
beforeEach(() => { state.user = { id: "fixture-user" }; state.error = null; state.filters = []; });

it.each(["year=2026&quarter=5", "year=2026&quarter=0", "year=bad&quarter=1"])("rejects invalid quarter: %s", async query => {
  expect((await GET(new Request(`http://localhost/api/pdf/quarterly-review?${query}`))).status).toBe(400);
  expect(state.filters).toEqual([]);
});
it("requires an authenticated account", async () => {
  state.user = null;
  expect((await GET(new Request("http://localhost/api/pdf/quarterly-review?year=2026&quarter=3"))).status).toBe(401);
});
it("exports saved reflections even without tracked weeks and scopes every query to the user", async () => {
  const response = await GET(new Request("http://localhost/api/pdf/quarterly-review?year=2026&quarter=3"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-disposition")).toContain("2026-Q3.pdf");
  expect(state.filters).toContainEqual(["period_reviews", "starts_on", "2026-07-01"]);
  for (const table of ["weeks", "period_reviews", "settings"]) expect(state.filters).toContainEqual([table, "user_id", "fixture-user"]);
  const pdf = await PDFDocument.load(await response.arrayBuffer());
  expect(pdf.getPageCount()).toBe(2);
});
it("stops on a database error instead of exporting an empty review", async () => {
  state.error = { message: "Review unavailable" };
  const response = await GET(new Request("http://localhost/api/pdf/quarterly-review?year=2026&quarter=3"));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Review unavailable" });
});
it("paginates long quarterly answers instead of clipping them", async () => {
  const bytes = await generateConsolidatedReportPdf([], { label: "Q3", start: "2026-07-01", end: "2026-09-30" }, undefined, {
    prompts: QUARTERLY_REVIEW_PROMPTS,
    responses: { accomplished: "A detailed reflection with many lines. ".repeat(1000) },
  });
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(3);
});
