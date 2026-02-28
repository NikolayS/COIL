import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // App URL — distinct from NEXT_PUBLIC_SUPABASE_URL which is the Supabase API endpoint
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://coil.5am.team";

  if (error) {
    return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent(error)}`);
  }

  if (code) {
    const supabase = await createServerSupabaseClient();

    // GoTrue's own /auth/v1/callback handles Google OAuth code exchange first,
    // sets the session cookie, then redirects here with the same (now consumed)
    // code. Calling exchangeCodeForSession again would fail with flow_state_not_found.
    //
    // Strategy: attempt the exchange; if it fails with a flow-state error, the
    // session is already active — just redirect home. Genuine errors still
    // redirect to /login.
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      const isAlreadyExchanged =
        exchangeError.message.includes("flow state") ||
        exchangeError.message.includes("Flow State") ||
        exchangeError.code === "flow_state_not_found";

      if (!isAlreadyExchanged) {
        return NextResponse.redirect(
          `${appUrl}/login?error=${encodeURIComponent(exchangeError.message)}`
        );
      }
      // GoTrue already exchanged — session cookie is set, fall through to redirect home
    }
  }

  return NextResponse.redirect(`${appUrl}/`);
}
