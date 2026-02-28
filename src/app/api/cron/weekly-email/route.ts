import { createClient } from "@supabase/supabase-js";
import { generateReport, type WeekData } from "@/lib/report";
import { NextRequest, NextResponse } from "next/server";

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function POST(request: NextRequest) {
  // Verify cron secret
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const resendApiKey = process.env.RESEND_API_KEY!;

  if (!serviceRoleKey || !resendApiKey) {
    return NextResponse.json({ error: "Missing server configuration" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch all users with weekly email enabled
  const { data: settings, error: settingsError } = await supabase
    .from("settings")
    .select("user_id, weekly_email_hour, weekly_email_day, timezone")
    .eq("weekly_email_enabled", true);

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  if (!settings || settings.length === 0) {
    return NextResponse.json({ sent: 0, message: "No users with weekly email enabled" });
  }

  // Get user emails from auth.users
  const userIds = settings.map((s) => s.user_id);
  const { data: users } = await supabase.auth.admin.listUsers();
  const emailMap = new Map<string, string>();
  if (users?.users) {
    for (const u of users.users) {
      if (u.email && userIds.includes(u.id)) {
        emailMap.set(u.id, u.email);
      }
    }
  }

  const monday = getMondayOfWeek(new Date()).toISOString().slice(0, 10);
  const nowDay = new Date().getDay(); // 0=Sun, 6=Sat
  let sent = 0;

  for (const setting of settings) {
    const email = emailMap.get(setting.user_id);
    if (!email) continue;

    // Check if today matches user's preferred delivery day (default: sunday)
    const prefDay = (setting.weekly_email_day as string | null) ?? "sunday";
    const sendOnDay = prefDay === "saturday" ? 6 : 0;
    if (nowDay !== sendOnDay) continue;

    // Fetch current week data
    const { data: weekRow } = await supabase
      .from("weeks")
      .select("data")
      .eq("user_id", setting.user_id)
      .eq("week_of", monday)
      .maybeSingle();

    if (!weekRow?.data) continue;

    const weekData = weekRow.data as WeekData;
    const report = generateReport(weekData);

    // Send via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "COIL <noreply@coil.5am.team>",
        to: [email],
        subject: `COIL Weekly Report — Week of ${monday}`,
        text: report,
      }),
    });

    if (res.ok) sent++;
  }

  return NextResponse.json({ sent, total: settings.length });
}
