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
  const { userId, overrideEmail, weekChoice } = body as { userId: string; overrideEmail?: string | null; weekChoice?: "current" | "previous" };

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

  const currentMonday = getMondayOfWeek(new Date()).toISOString().slice(0, 10);
  const prevMonday = getMondayOfWeek(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ).toISOString().slice(0, 10);

  // Use weekChoice if provided, otherwise try current then previous
  const mondaysToTry = weekChoice === "previous"
    ? [prevMonday]
    : weekChoice === "current"
    ? [currentMonday]
    : [currentMonday, prevMonday];

  let weekRow: { data: unknown } | null = null;
  let usedMonday = mondaysToTry[0];

  for (const monday of mondaysToTry) {
    const { data } = await supabase
      .from("weeks")
      .select("data")
      .eq("user_id", userId)
      .eq("week_of", monday)
      .maybeSingle();
    if (data?.data) {
      weekRow = data;
      usedMonday = monday;
      break;
    }
  }

  if (!weekRow?.data) {
    return NextResponse.json({ error: "No week data found" }, { status: 404 });
  }

  const weekData = weekRow.data as WeekData;
  const report = generateReport(weekData);
  const emailSubject = `[TEST] COIL Weekly Report — Week of ${usedMonday}`;
  const emailBody = `[THIS IS A TEST EMAIL]\n\n${report}`;

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
      html: `<pre style="font-family:monospace;font-size:14px;line-height:1.6;white-space:pre-wrap">${emailBody.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre>`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  return NextResponse.json({ ok: true, week: usedMonday, email });
}
