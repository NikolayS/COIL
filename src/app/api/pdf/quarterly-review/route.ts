import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateConsolidatedReportPdf } from "@/lib/generatePdf";
import { QUARTERLY_REVIEW_PROMPTS } from "@/lib/review-prompts";
import { getReviewPeriod } from "@/lib/intentional";
import { trackerSettingsFromRow } from "@/lib/tracking";
import type { WeekData } from "@/lib/report";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const year = params.get("year");
  const quarter = params.get("quarter");
  if (!year || !/^(20[2-9]\d|2100)$/.test(year) || !quarter || !/^[1-4]$/.test(quarter)) {
    return NextResponse.json({ error: "Valid year and quarter required" }, { status: 400 });
  }
  const period = getReviewPeriod("quarter", `${year}-Q${quarter}`);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const earliest = new Date(`${period.startsOn}T12:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - 6);
  const [weeks, review, settings] = await Promise.all([
    supabase.from("weeks").select("week_of, data").eq("user_id", user.id)
      .gte("week_of", earliest.toISOString().slice(0, 10)).lte("week_of", period.endsOn).order("week_of"),
    supabase.from("period_reviews").select("responses").eq("user_id", user.id)
      .eq("review_type", "quarter").eq("starts_on", period.startsOn).maybeSingle(),
    supabase.from("settings").select("tracker_definitions, bagels_enabled, steps10k_enabled, cold_plunge_enabled, fasting_enabled")
      .eq("user_id", user.id).maybeSingle(),
  ]);
  const error = weeks.error ?? review.error ?? settings.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const pdf = await generateConsolidatedReportPdf(
    (weeks.data ?? []).map((row) => ({ ...(row.data as WeekData), weekOf: row.week_of })),
    { start: period.startsOn, end: period.endsOn, label: period.label },
    trackerSettingsFromRow(settings.data),
    { prompts: QUARTERLY_REVIEW_PROMPTS, responses: review.data?.responses ?? {} },
  );
  return new NextResponse(Buffer.from(pdf), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="coil-quarterly-review-${year}-Q${quarter}.pdf"`,
    "Cache-Control": "private, no-store",
  } });
}
