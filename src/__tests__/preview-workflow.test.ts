import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const previewWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/preview.yml"), "utf8");

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
});
