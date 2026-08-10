import type { MonthlyWeek } from "./monthly";

type ReviewType = "month" | "quarter";

interface PeriodRange {
  startsOn: string;
  endsOn: string;
}

export interface StoredWeekRow {
  week_of: string;
  data: unknown;
}

interface WeekQueryResult {
  data: StoredWeekRow[] | null;
  error: { message: string } | null;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function localDateInTimeZone(instant: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return isoDate(instant);
  }
}

export function previousMonthKeyInTimeZone(instant: Date, timeZone: string): string {
  const localDate = localDateInTimeZone(instant, timeZone);
  const date = new Date(`${localDate.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return isoDate(date).slice(0, 7);
}

export function evidenceQueryRange(period: PeriodRange, type: ReviewType): PeriodRange {
  const earliest = new Date(`${period.startsOn}T12:00:00Z`);
  if (type === "month") earliest.setUTCMonth(earliest.getUTCMonth() - 1);
  earliest.setUTCDate(earliest.getUTCDate() - 6);
  return { startsOn: isoDate(earliest), endsOn: period.endsOn };
}

export function monthlyWeeksFromRows(rows: StoredWeekRow[]): MonthlyWeek[] {
  return rows.flatMap((row) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.week_of)) return [];
    const stored = row.data && typeof row.data === "object"
      ? row.data as { days?: unknown }
      : null;
    if (!stored?.days || typeof stored.days !== "object" || Array.isArray(stored.days)) return [];
    return [{
      weekOf: row.week_of,
      days: stored.days as MonthlyWeek["days"],
    }];
  });
}

export function monthlyWeeksFromResult(result: WeekQueryResult): MonthlyWeek[] {
  if (result.error) throw new Error(result.error.message);
  return monthlyWeeksFromRows(result.data ?? []);
}
