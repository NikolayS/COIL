/**
 * Auth callback redirect tests.
 *
 * Regression: callback was redirecting to http://0.0.0.0:3000/ (internal Docker
 * origin) instead of the real public URL. This caused ERR_FAILED in the browser.
 *
 * Fix: use NEXT_PUBLIC_APP_URL env var as the base for all redirects.
 * Note: NEXT_PUBLIC_SUPABASE_URL is the API endpoint, not the app URL — they
 * happen to be the same host for COIL but must remain distinct env vars.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// The logic under test — extracted from src/app/auth/callback/route.ts
function callbackRedirectUrl(
  requestUrl: string,
  siteUrl: string,
  code: string | null,
  error: string | null,
  exchangeError: string | null = null
): string {
  if (error) return `${siteUrl}/login?error=${encodeURIComponent(error)}`;
  if (code) {
    if (exchangeError) return `${siteUrl}/login?error=${encodeURIComponent(exchangeError)}`;
    return `${siteUrl}/`;
  }
  return `${siteUrl}/`;
}

describe("auth callback redirect", () => {
  const SITE_URL = "https://coil.5am.team";
  const DOCKER_INTERNAL = "http://0.0.0.0:3000";

  it("redirects to public site URL, not internal Docker origin", () => {
    const url = callbackRedirectUrl(`${DOCKER_INTERNAL}/auth/callback?code=abc`, SITE_URL, "abc", null);
    expect(url).toBe("https://coil.5am.team/");
    expect(url).not.toContain("0.0.0.0");
  });

  it("redirects to /login with error when exchange fails", () => {
    const url = callbackRedirectUrl(`${DOCKER_INTERNAL}/auth/callback?code=abc`, SITE_URL, "abc", null, "PKCE not found");
    expect(url).toBe("https://coil.5am.team/login?error=PKCE%20not%20found");
    expect(url).not.toContain("0.0.0.0");
  });

  it("redirects to /login with error param when GoTrue returns error", () => {
    const url = callbackRedirectUrl(`${SITE_URL}/auth/callback?error=access_denied`, SITE_URL, null, "access_denied");
    expect(url).toBe("https://coil.5am.team/login?error=access_denied");
  });

  it("redirects to / when no code and no error", () => {
    const url = callbackRedirectUrl(`${SITE_URL}/auth/callback`, SITE_URL, null, null);
    expect(url).toBe("https://coil.5am.team/");
  });

  it("never uses request origin for redirect base", () => {
    // Even if request comes from an internal IP, redirect uses siteUrl
    const internalOrigins = [
      "http://0.0.0.0:3000",
      "http://127.0.0.1:3000",
      "http://172.17.0.2:3000",
    ];
    for (const origin of internalOrigins) {
      const url = callbackRedirectUrl(`${origin}/auth/callback?code=xyz`, SITE_URL, "xyz", null);
      expect(url).toBe("https://coil.5am.team/");
      expect(url).not.toContain(new URL(origin).hostname);
    }
  });
});
