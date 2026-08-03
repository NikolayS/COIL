import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const initSql = readFileSync(resolve(process.cwd(), "supabase/init.sql"), "utf8");
const deployWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/deploy.yml"), "utf8");

describe("intentional living schema", () => {
  it("defines cycles and period reviews for fresh installations", () => {
    expect(initSql).toContain("create table if not exists public.cycles");
    expect(initSql).toContain("create table if not exists public.period_reviews");
    expect(initSql).toContain("unique (user_id, starts_on, ends_on)");
    expect(initSql).toContain("unique (user_id, review_type, starts_on)");
  });

  it("protects both tables with row-level security checks", () => {
    expect(initSql).toContain("alter table public.cycles enable row level security");
    expect(initSql).toContain("alter table public.period_reviews enable row level security");
    expect(initSql).toMatch(/users manage own cycles[\s\S]*with check \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(initSql).toMatch(/users manage own period reviews[\s\S]*with check \(\(select auth\.uid\(\)\) = user_id\)/);
  });

  it("applies the same schema during tagged deployments", () => {
    expect(deployWorkflow).toContain("create table if not exists public.cycles");
    expect(deployWorkflow).toContain("create table if not exists public.period_reviews");
    expect(deployWorkflow).toContain("grant select, insert, update, delete on public.cycles to authenticated");
    expect(deployWorkflow).toContain("grant select, insert, update, delete on public.period_reviews to authenticated");
    expect(deployWorkflow).not.toMatch(/grant all on public\.(cycles|period_reviews) to authenticated/i);
  });
});
