import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const resendApiKey = process.env.RESEND_API_KEY!;

  if (!serviceRoleKey || !resendApiKey) {
    return NextResponse.json({ error: "Missing server configuration" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch users with at least one reminder enabled
  const { data: settings, error } = await supabase
    .from("settings")
    .select("user_id, timezone, report_email, reminder1_enabled, reminder1_hour, reminder2_enabled, reminder2_hour")
    .or("reminder1_enabled.eq.true,reminder2_enabled.eq.true");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!settings?.length) return NextResponse.json({ sent: 0 });

  // Get auth emails for all users
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const emailMap = new Map(users.map((u) => [u.id, u.email]));

  const nowUtc = new Date();
  let sent = 0;

  for (const s of settings) {
    const tz = (s.timezone as string) || "UTC";
    const authEmail = emailMap.get(s.user_id);
    if (!authEmail) continue;
    const email = (s.report_email as string | null) || authEmail;

    // Current hour in user's timezone
    const userHour = parseInt(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(nowUtc)
    );

    const toSend: { slot: 1 | 2; label: string }[] = [];

    if (s.reminder1_enabled && (s.reminder1_hour ?? 8) === userHour) {
      toSend.push({ slot: 1, label: "morning" });
    }
    if (s.reminder2_enabled && (s.reminder2_hour ?? 20) === userHour) {
      toSend.push({ slot: 2, label: "evening" });
    }

    for (const { label } of toSend) {
      const subject = label === "morning"
        ? "🌅 COIL morning check-in"
        : "🌙 COIL evening check-in";

      const bodyText = label === "morning"
        ? `Good morning.\n\nDon't forget to fill in yesterday's territories.\n\nhttps://coil.5am.team`
        : `End of day.\n\nHow did today go? Log your territories before you close out.\n\nhttps://coil.5am.team`;

      const bodyHtml = label === "morning"
        ? `<p style="font-family:sans-serif;font-size:15px;color:#222">Good morning.</p><p style="font-family:sans-serif;font-size:15px;color:#222">Don't forget to fill in yesterday's territories.</p><p style="margin-top:24px"><a href="https://coil.5am.team" style="background:#a67c2e;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-family:sans-serif;font-size:14px">Open COIL</a></p>`
        : `<p style="font-family:sans-serif;font-size:15px;color:#222">End of day.</p><p style="font-family:sans-serif;font-size:15px;color:#222">How did today go? Log your territories before you close out.</p><p style="margin-top:24px"><a href="https://coil.5am.team" style="background:#a67c2e;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-family:sans-serif;font-size:14px">Open COIL</a></p>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "COIL <noreply@coil.5am.team>",
          to: [email],
          subject,
          text: bodyText,
          html: bodyHtml,
        }),
      });

      if (res.ok) sent++;
    }
  }

  return NextResponse.json({ sent });
}
