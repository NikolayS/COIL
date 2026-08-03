import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateMonthlyReviewPdf } from "@/lib/generatePdf";
import {
  buildMonthlyEvidence,
  decodeStoredReview,
  monthRange,
  nextMonthKey,
  type MonthlyWeek,
} from "@/lib/monthly";
import {
  TERRITORY_KEYS,
  emptyTerritoryCommitments,
  type CycleData,
  type TerritoryCommitment,
} from "@/lib/intentional";
import { trackerSettingsFromRow } from "@/lib/tracking";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function normalizeCycle(row: {
  starts_on: string;
  ends_on: string;
  must_win: string | null;
  territories: unknown;
} | null): CycleData | null {
  if (!row) return null;
  const saved = row.territories && typeof row.territories === "object"
    ? row.territories as Partial<Record<(typeof TERRITORY_KEYS)[number], Partial<TerritoryCommitment>>>
    : {};
  const territories = emptyTerritoryCommitments();
  for (const key of TERRITORY_KEYS) {
    territories[key] = {
      outcome: typeof saved[key]?.outcome === "string" ? saved[key].outcome : "",
      keystoneHabit: typeof saved[key]?.keystoneHabit === "string" ? saved[key].keystoneHabit : "",
    };
  }
  return {
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    mustWin: row.must_win ?? "",
    territories,
  };
}

export async function GET(req: Request) {
  const month = new URL(req.url).searchParams.get("month");
  if (!month || !MONTH.test(month)) {
    return NextResponse.json({ error: "Valid month required (YYYY-MM)" }, { status: 400 });
  }
  const range = monthRange(month);
  const earliestWeek = new Date(`${range.startsOn}T12:00:00Z`);
  earliestWeek.setUTCDate(earliestWeek.getUTCDate() - 6);

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [weeksResult, reviewResult, cycleResult, settingsResult] = await Promise.all([
    supabase
      .from("weeks")
      .select("week_of, data")
      .eq("user_id", user.id)
      .gte("week_of", earliestWeek.toISOString().slice(0, 10))
      .lte("week_of", range.endsOn)
      .order("week_of", { ascending: true }),
    supabase
      .from("period_reviews")
      .select("responses")
      .eq("user_id", user.id)
      .eq("review_type", "month")
      .eq("starts_on", range.startsOn)
      .maybeSingle(),
    supabase
      .from("cycles")
      .select("starts_on, ends_on, must_win, territories")
      .eq("user_id", user.id)
      .lte("starts_on", range.endsOn)
      .gte("ends_on", range.startsOn)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("settings")
      .select("tracker_definitions, bagels_enabled, steps10k_enabled, cold_plunge_enabled, fasting_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const error = weeksResult.error ?? reviewResult.error ?? cycleResult.error ?? settingsResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const weeks: MonthlyWeek[] = (weeksResult.data ?? []).map((row) => {
    const data = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : {};
    return {
      weekOf: typeof data.weekOf === "string" ? data.weekOf : row.week_of,
      days: data.days && typeof data.days === "object"
        ? data.days as MonthlyWeek["days"]
        : {},
    };
  });
  const review = decodeStoredReview(reviewResult.data?.responses, nextMonthKey(month));
  const evidence = buildMonthlyEvidence(weeks, month, trackerSettingsFromRow(settingsResult.data));
  const pdfBytes = await generateMonthlyReviewPdf({
    label: range.label,
    evidence,
    review,
    goals: normalizeCycle(cycleResult.data),
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="coil-monthly-review-${month}.pdf"`,
    },
  });
}
