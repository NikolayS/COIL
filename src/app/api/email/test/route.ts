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
  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const resendApiKey = process.env.RESEND_API_KEY!;

  if (!serviceRoleKey || !resendApiKey) {
    return NextResponse.json({ error: "Missing server configuration" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get user email
  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (!email) return NextResponse.json({ error: "User not found" }, { status: 404 });

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

  if (!weekRow?.data) {
    return NextResponse.json({ error: "No week data found" }, { status: 404 });
  }

  const weekData = weekRow.data as WeekData;
  const report = generateReport(weekData);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "COIL <noreply@coil.5am.team>",
      to: [email],
      subject: `[TEST] COIL Weekly Report — Week of ${usedMonday}`,
      text: `[THIS IS A TEST EMAIL]\n\n${report}`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  return NextResponse.json({ ok: true, week: usedMonday, email });
}
