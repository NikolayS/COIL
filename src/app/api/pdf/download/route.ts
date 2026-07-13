import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateReportPdf } from "@/lib/generatePdf";
import type { WeekData } from "@/lib/report";
import { trackerSettingsFromRow } from "@/lib/tracking";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const weekOf = searchParams.get("weekOf"); // ISO date string e.g. "2026-03-02"
  if (!weekOf) return NextResponse.json({ error: "weekOf required" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: row } = await supabase
    .from("weeks")
    .select("data")
    .eq("user_id", user.id)
    .eq("week_of", weekOf)
    .maybeSingle();

  if (!row?.data) return NextResponse.json({ error: "No data for this week" }, { status: 404 });

  const { data: settings } = await supabase
    .from("settings")
    .select("tracker_definitions, bagels_enabled, steps10k_enabled, cold_plunge_enabled, fasting_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  const pdfBytes = await generateReportPdf(row.data as WeekData, trackerSettingsFromRow(settings));
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="coil-${weekOf}.pdf"`,
    },
  });
}
