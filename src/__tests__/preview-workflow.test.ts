import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const previewWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/preview.yml"), "utf8");
const supabaseCompose = readFileSync(resolve(process.cwd(), "supabase/docker-compose.yml"), "utf8");
const supabaseEnvExample = readFileSync(resolve(process.cwd(), "supabase/.env.example"), "utf8");

describe("preview workflow", () => {
  it("builds previews with their own public origin", () => {
    expect(previewWorkflow).toContain('PREVIEW_URL="https://coil-${SAFE_BRANCH}.5am.team"');
    expect(previewWorkflow).toContain('--build-arg NEXT_PUBLIC_SUPABASE_URL="${PREVIEW_URL}"');
    expect(previewWorkflow).toContain('--build-arg NEXT_PUBLIC_SITE_URL="${PREVIEW_URL}"');
    expect(previewWorkflow).toContain('--build-arg NEXT_PUBLIC_APP_URL="${PREVIEW_URL}"');
  });

  it("keeps the shared anonymous key for preview auth", () => {
    expect(previewWorkflow).toContain('--build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${{ secrets.COIL_APP_NEXT_PUBLIC_SUPABASE_ANON_KEY }}"');
  });

  it("allows preview callbacks and uses reachable verified SMTP settings", () => {
    expect(supabaseCompose).toContain("GOTRUE_URI_ALLOW_LIST: ${SITE_URL},https://coil-*.5am.team/**");
    expect(supabaseEnvExample).toContain("SMTP_PORT=587");
    expect(supabaseEnvExample).toContain("SMTP_ADMIN_EMAIL=noreply@samo.cat");
  });
});
