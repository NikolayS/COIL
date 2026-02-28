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
  const body = await request.json();
  const { userId, overrideEmail } = body as { userId: string; overrideEmail?: string | null };

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const resendApiKey = process.env.RESEND_API_KEY!;

  if (!serviceRoleKey || !resendApiKey) {
    return NextResponse.json({ error: "Missing server configuration" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get user's auth email and saved report_email
  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  const authEmail = userData?.user?.email;
  if (!authEmail) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Load saved report_email setting
  const { data: settings } = await supabase
    .from("settings")
    .select("report_email")
    .eq("user_id", userId)
    .maybeSingle();

  // Priority: inline override > saved report_email > auth email
  const email = overrideEmail?.trim() || settings?.report_email || authEmail;

  // Try current week, then previous week
  const currentMonday = getMondayOfWeek(new Date()).toISOString().slice(0, 10);
  const prevMonday = getMondayOfWeek(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ).toISOString().slice(0, 10);

  let weekRow: { data: unknown } | null = null;
  let usedMonday = currentMonday;

  const { data: curr } = await supabase
    .from("weeks")
    .select("data")
    .eq("user_id", userId)
    .eq("week_of", currentMonday)
    .maybeSingle();

  if (curr?.data) {
    weekRow = curr;
  } else {
    const { data: prev } = await supabase
      .from("weeks")
      .select("data")
      .eq("user_id", userId)
      .eq("week_of", prevMonday)
      .maybeSingle();
    if (prev?.data) {
      weekRow = prev;
      usedMonday = prevMonday;
    }
  }

  let emailSubject: string;
  let emailBody: string;

  if (!weekRow?.data) {
    // No week data yet — send a connectivity test email anyway
    emailSubject = `[TEST - no data yet] COIL Email Test`;
    emailBody = `This is a connectivity test for COIL weekly reports.\n\nNo week data exists yet — add some data to get a real report.\n\nIf you received this email, your email delivery is working correctly.`;
    usedMonday = "none";
  } else {
    const weekData = weekRow.data as WeekData;
    const report = generateReport(weekData);
    emailSubject = `[TEST] COIL Weekly Report — Week of ${usedMonday}`;
    emailBody = `[THIS IS A TEST EMAIL]\n\n${report}`;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "COIL <noreply@coil.5am.team>",
      to: [email],
      subject: emailSubject,
      text: emailBody,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  return NextResponse.json({ ok: true, week: usedMonday, email });
}
