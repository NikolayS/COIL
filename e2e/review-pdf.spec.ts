import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321").origin;
const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const fixture = (weekOf: string) => ({ weekOf, days: Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(day => [day, { territories: { self: day === "mon", health: false, wealth: false, relationships: false, business: false }, wolf: [], journal: "", reflection: "", drinks: 0 }])), weekly: { biggestWin: "Preserved travel review", lessons: "", improve: "", focusNext: "" } });
async function setup(page: Page, context: BrowserContext, baseURL: string, options: { missing?: boolean; fail?: boolean; sunday?: boolean; now?: string; rejectWrites?: boolean } = {}) {
  const writes: Record<string, unknown>[] = [];
  const reads: string[] = [];
  const stored = new Map<string, unknown>();
  const current = options.sunday ? "2026-08-23" : "2026-08-24";
  const jwtPart = (data: object) => Buffer.from(JSON.stringify(data)).toString("base64url");
  const session = { access_token: `${jwtPart({ alg: "HS256", typ: "JWT" })}.${jwtPart({ sub: user.id, exp: 4102444800, aud: "authenticated" })}.fixture`, refresh_token: "fixture-only", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user };
  await context.addCookies([
    { name: "coil_demo", value: "1", url: baseURL },
    { name: `sb-${new URL(supabaseOrigin).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url: baseURL },
  ]);
  await page.clock.setFixedTime(new Date(options.now ?? "2026-08-28T16:00:00Z"));
  await page.route(url => url.origin === supabaseOrigin && (url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/auth/v1/")), async route => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers });
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: user, headers });
    if (req.method() !== "GET") {
      const body = req.postDataJSON();
      writes.push({ table: url.pathname, ...body });
      if (options.rejectWrites) return route.fulfill({ status: 503, json: { message: "Save temporarily unavailable" }, headers });
      if (url.pathname.endsWith("/weeks")) stored.set(body.week_of, body.data);
      return route.fulfill({ status: 201, json: null, headers });
    }
    if (url.pathname.endsWith("/settings")) return route.fulfill({ json: { week_start: options.sunday ? "sunday" : "monday", timezone: "America/Los_Angeles" }, headers });
    if (url.pathname.endsWith("/weeks")) {
      const key = url.searchParams.get("week_of");
      reads.push(key ?? "");
      if (options.fail) return route.fulfill({ status: 503, json: { message: "Database unavailable" }, headers });
      if (key?.startsWith("eq.")) {
        const date = key.slice(3);
        return route.fulfill({ json: stored.has(date) ? { week_of: date, data: stored.get(date) } : options.missing ? null : { week_of: date, data: fixture(`${date}T07:00:00.000Z`) }, headers });
      }
      return route.fulfill({ json: [], headers });
    }
    return route.fulfill({ json: null, headers });
  });
  return { writes, reads, current };
}


async function ios(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { value: "iPhone" });
    Object.defineProperty(navigator, "canShare", { value: () => true });
    Object.defineProperty(navigator, "share", { value: async ({ files }: { files: File[] }) => {
      (window as unknown as { shared: string[] }).shared = files.map(file => file.name);
      throw new DOMException("Cancelled", "AbortError");
    } });
  });
}

async function openReview(page: Page) {
  await page.goto("/?tab=review&view=review");
  await expect(page.getByRole("button", { name: "Save & prepare monthly PDF" })).toBeEnabled();
}

test("monthly export persists current answers first; iOS cancel stays usable; edits invalidate PDF", async ({ page, context, baseURL }) => {
  const { writes } = await setup(page, context, baseURL!);
  await ios(page);
  let exports = 0;
  await page.route("**/api/pdf/monthly-review?*", route => {
    exports++;
    const saved = writes.find(write => String(write.table).endsWith("save_period_review_and_cycle"));
    expect(saved?.p_responses).toMatchObject({ __review: { proud: "Fresh unsaved answer" } });
    expect(saved?.p_cycle_starts_on).toBeNull();
    return route.fulfill({ body: "%PDF-1.7", contentType: "application/pdf" });
  });
  await openReview(page);
  const answer = page.getByPlaceholder("Reflect from the evidence above...").first();
  await answer.fill("Fresh unsaved answer");
  await page.getByRole("button", { name: "Save & prepare monthly PDF" }).click();
  await expect(page.getByRole("button", { name: "Save PDF", exact: true })).toBeEnabled();
  expect(exports).toBe(1);
  const url = page.url();
  await page.getByRole("button", { name: "Save PDF", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save PDF", exact: true })).toBeEnabled();
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => (window as unknown as { shared: string[] }).shared)).toEqual(["coil-monthly-review-2026-07.pdf"]);
  await answer.fill("Newer answer");
  await expect(page.getByRole("button", { name: "Save & prepare monthly PDF" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save PDF", exact: true })).not.toBeVisible();
});

test("save failure stops PDF and preserves draft after reload", async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL!, { rejectWrites: true });
  await ios(page);
  let exports = 0;
  await page.route("**/api/pdf/**", route => { exports++; return route.abort(); });
  await openReview(page);
  await page.getByPlaceholder("Reflect from the evidence above...").first().fill("Do not lose this answer");
  await page.getByRole("button", { name: "Save & prepare monthly PDF" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("PDF stopped");
  expect(exports).toBe(0);
  await page.reload();
  await expect(page.getByPlaceholder("Reflect from the evidence above...").first()).toHaveValue("Do not lose this answer");
});

test("monthly drafts are isolated by period and quarterly export saves quarterly answers", async ({ page, context, baseURL }) => {
  const { writes } = await setup(page, context, baseURL!);
  await ios(page);
  await page.route("**/api/pdf/quarterly-review?*", route => {
    const saved = writes.find(write => write.p_review_type === "quarter");
    expect(saved?.p_responses).toMatchObject({ accomplished: "Quarter reflection" });
    return route.fulfill({ body: "%PDF-1.7", contentType: "application/pdf" });
  });
  await openReview(page);
  const answer = page.getByPlaceholder("Reflect from the evidence above...").first();
  await answer.fill("July draft");
  await page.getByLabel("Review month").fill("2026-06");
  await expect(answer).toHaveValue("");
  await answer.fill("June draft");
  await page.getByLabel("Review month").fill("2026-07");
  await expect(answer).toHaveValue("July draft");
  await page.getByRole("button", { name: "Quarter", exact: true }).click();
  await expect(answer).toHaveValue("");
  await answer.fill("Quarter reflection");
  await page.getByRole("button", { name: "Save & prepare quarterly PDF" }).click();
  await expect(page.getByRole("button", { name: "Save PDF", exact: true })).toBeEnabled();
});

test("typing during a slow save preserves the newer draft and cancels stale preparation", async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL!);
  await ios(page);
  let releaseSave!: () => void;
  const saving = new Promise<void>(resolve => { releaseSave = resolve; });
  let startedSave!: () => void;
  const started = new Promise<void>(resolve => { startedSave = resolve; });
  await page.route("**/rest/v1/rpc/save_period_review_and_cycle", async route => {
    startedSave();
    await saving;
    return route.fulfill({ json: null, headers: { "access-control-allow-origin": "*" } });
  });
  let exports = 0;
  await page.route("**/api/pdf/**", route => { exports++; return route.abort(); });
  await openReview(page);
  const answer = page.getByPlaceholder("Reflect from the evidence above...").first();
  await answer.fill("Submitted snapshot");
  await page.getByRole("button", { name: "Save & prepare monthly PDF" }).click();
  await started;
  await answer.fill("Newer typing");
  releaseSave();
  await expect(page.getByRole("button", { name: "Save month review" })).toBeEnabled();
  expect(exports).toBe(0);
  await page.reload();
  await expect(answer).toHaveValue("Newer typing");
});
