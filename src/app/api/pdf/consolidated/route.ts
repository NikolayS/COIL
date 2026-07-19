import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateConsolidatedReportPdf } from "@/lib/generatePdf";
import type { WeekData } from "@/lib/report";
import { trackerSettingsFromRow } from "@/lib/tracking";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string | null): Date | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const startValue = searchParams.get("start");
  const endValue = searchParams.get("end");
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end || !startValue || !endValue || start > end) {
    return NextResponse.json({ error: "Valid start and end dates are required" }, { status: 400 });
  }
  const rangeDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (rangeDays > 372) {
    return NextResponse.json({ error: "Date range cannot exceed one year" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Include any weekly report that overlaps the requested calendar period.
  const earliestWeek = new Date(start);
  earliestWeek.setUTCDate(earliestWeek.getUTCDate() - 6);
  const { data: rows, error } = await supabase
    .from("weeks")
    .select("week_of, data")
    .eq("user_id", user.id)
    .gte("week_of", earliestWeek.toISOString().slice(0, 10))
    .lte("week_of", endValue)
    .order("week_of", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ error: "No weekly reports in this period" }, { status: 404 });

  const { data: settings } = await supabase
    .from("settings")
    .select("tracker_definitions, bagels_enabled, steps10k_enabled, cold_plunge_enabled, fasting_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  const label = searchParams.get("label")?.replace(/[\r\n\t]/g, " ").slice(0, 80) || `${startValue} to ${endValue}`;
  const pdfBytes = await generateConsolidatedReportPdf(
    rows.map((row) => ({ ...(row.data as WeekData), weekOf: (row.data as WeekData).weekOf || row.week_of })),
    { label, start: startValue, end: endValue },
    trackerSettingsFromRow(settings),
  );
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="coil-review-${startValue}-${endValue}.pdf"`,
    },
  });
}
