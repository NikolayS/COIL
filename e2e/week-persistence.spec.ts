import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// Synthetic identity only. Every Supabase request is intercepted; no real account.
test.describe.configure({ mode: "parallel" });

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

for (const timezoneId of ["America/Los_Angeles", "Europe/Lisbon", "Pacific/Auckland"]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test("viewing, navigating and focus/blur never write; edits use the stable key", async ({ page, context, baseURL }) => {
      const { writes, reads } = await setup(page, context, baseURL!);
      await page.goto("/?tab=week&view=review&week=2026-08-24");
      // Use the saved review text to find its textarea regardless of prompt wording.
      await expect(page.locator("textarea").filter({ hasText: "Preserved travel review" })).toBeVisible();
      const lessons = page.getByPlaceholder("The one win that stands above the rest...");
      await lessons.focus();
      await lessons.blur();
      await page.waitForTimeout(2000);
      expect(writes).toEqual([]);
      expect(reads).toContain("eq.2026-08-24");
      await page.getByRole("button", { name: "Previous week", exact: true }).click();
      await expect(page).toHaveURL(/week=2026-08-17/);
      await expect(lessons).toBeVisible();
      await page.waitForTimeout(1800);
      expect(writes).toEqual([]);
      await lessons.fill("An intentional edit");
      await lessons.blur();
      await expect.poll(() => writes.length).toBe(1);
      expect(writes[0].week_of).toBe("2026-08-17");
      expect((writes[0].data as { weekOf: string }).weekOf).toBe("2026-08-17");
      expect(((writes[0].data as { weekly: { biggestWin: string } }).weekly.biggestWin)).toBe("An intentional edit");
    });
    test("opening a missing week does not create it", async ({ page, context, baseURL }) => {
      const { writes, reads } = await setup(page, context, baseURL!, { missing: true });
      await page.goto("/?tab=week&view=report&week=2026-08-24");
      await expect(page.getByText("fixture@example.test", { exact: true })).toBeVisible();
      await page.waitForTimeout(2000);
      expect(writes).toEqual([]);
      expect(reads).toContain("eq.2026-08-24");
    });
  });
}

test("a legacy date URL remains exact and read-only instead of rounding to another row", async ({ page, context, baseURL }) => {
  const { writes, reads } = await setup(page, context, baseURL!);
  await page.goto("/?tab=week&view=report&week=2026-08-23");
  await expect(page.getByText("fixture@example.test", { exact: true })).toBeVisible();
  await page.waitForTimeout(2000);
  expect(new URL(page.url()).searchParams.get("week")).toBe("2026-08-23");
  expect(reads).toContain("eq.2026-08-23");
  expect(writes).toEqual([]);
});

test("failed reads cannot create or overwrite a week", async ({ page, context, baseURL }) => {
  const { writes } = await setup(page, context, baseURL!, { fail: true });
  await page.goto("/?tab=week&view=report");
  await expect(page.getByText(/Could not load this week/)).toBeVisible();
  await page.waitForTimeout(2000);
  expect(writes).toEqual([]);
});

test("Sunday settings use Sunday keys even in a different browser timezone", async ({ page, context, baseURL }) => {
  const { writes, reads } = await setup(page, context, baseURL!, { sunday: true, missing: true });
  await page.goto("/?tab=week&view=review");
  const field = page.getByPlaceholder("The one win that stands above the rest...");
  await expect(field).toBeVisible();
  await field.fill("Sunday calendar week");
  await expect.poll(() => writes.length).toBe(1);
  expect(reads).toContain("eq.2026-08-23");
  expect(writes[0].week_of).toBe("2026-08-23");
});

test("current week follows the settings timezone at the Monday boundary", async ({ page, context, baseURL }) => {
  const { writes, reads } = await setup(page, context, baseURL!, { now: "2026-08-24T00:30:00Z" });
  await page.goto("/?tab=week&view=report");
  await expect(page.getByText("fixture@example.test", { exact: true })).toBeVisible();
  expect(reads).toContain("eq.2026-08-17");
  await page.waitForTimeout(1800);
  expect(writes).toEqual([]);
});

test("editing and immediately navigating back retains the pending edit on its own week", async ({ page, context, baseURL }) => {
  const { writes } = await setup(page, context, baseURL!);
  await page.goto("/?tab=week&view=review&week=2026-08-17");
  const field = page.getByPlaceholder("The one win that stands above the rest...");
  await expect(field).toHaveValue("Preserved travel review");
  await field.fill("Last characters before navigation");
  await page.getByRole("button", { name: "Previous week", exact: true }).click();
  await expect(page).toHaveURL(/week=2026-08-10/);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(field).toHaveValue("Last characters before navigation");
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].week_of).toBe("2026-08-17");
  expect((writes[0].data as { weekly: { biggestWin: string } }).weekly.biggestWin).toBe("Last characters before navigation");
});

test("saved content survives reload without another write", async ({ page, context, baseURL }) => {
  const { writes } = await setup(page, context, baseURL!);
  await page.goto("/?tab=week&view=review&week=2026-08-17");
  const field = page.getByPlaceholder("The one win that stands above the rest...");
  await field.fill("Durable saved content");
  await expect.poll(() => writes.length).toBe(1);
  await expect(page.getByText("✓ saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(field).toHaveValue("Durable saved content");
  await page.waitForTimeout(1800);
  expect(writes).toHaveLength(1);
});

test("failed save keeps the unsaved edit visible when navigating back", async ({ page, context, baseURL }) => {
  const { writes } = await setup(page, context, baseURL!, { rejectWrites: true });
  await page.goto("/?tab=week&view=review&week=2026-08-17");
  const field = page.getByPlaceholder("The one win that stands above the rest...");
  await field.fill("Unsaved but not discarded");
  await expect(page.getByText(/save failed/)).toBeVisible();
  await page.getByRole("button", { name: "Previous week", exact: true }).click();
  await expect(page).toHaveURL(/week=2026-08-10/);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(field).toHaveValue("Unsaved but not discarded");
  expect(writes).toHaveLength(1);
});

test("a delayed monthly plan save cannot overwrite a different week", async ({ page, context, baseURL }) => {
  const { writes } = await setup(page, context, baseURL!);
  let release!: () => void;
  let called = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${supabaseOrigin}/rest/v1/rpc/save_period_review_and_cycle`, async route => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    called = true;
    await gate;
    await route.fulfill({ json: null, headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto("/?tab=review&view=plan&week=2026-08-24");
  await page.getByText("What is the one thing I must accomplish this month?", { exact: true }).locator("..").getByRole("textbox").fill("Delayed plan");
  await page.locator('input[placeholder="Outcome / priority"]').last().fill("New business priority");
  await page.getByRole("button", { name: "Save & apply monthly plan" }).click();
  await expect.poll(() => called).toBe(true);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("button", { name: "Previous week", exact: true }).click();
  await expect(page.getByPlaceholder("The one win that stands above the rest...")).toHaveValue("Preserved travel review");
  release();
  await page.waitForTimeout(2000);
  expect(writes).toEqual([]);
  expect(new URL(page.url()).searchParams.get("week")).toBe("2026-08-17");
});
