import { localDateInTimeZone } from "./monthly-data";

/** A week is a calendar date, not an instant. Never convert its key across timezones. */
export function calendarDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(value)) {
    throw new Error("Invalid calendar date");
  }
  const key = value.slice(0, 10);
  const date = new Date(`${key}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== key) {
    throw new Error("Invalid calendar date");
  }
  return key;
}

export function calendarDateObject(value: string): Date {
  return new Date(`${calendarDate(value)}T12:00:00Z`);
}

export function addCalendarDays(value: string, days: number): string {
  const date = calendarDateObject(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekKey(now: Date, start: "monday" | "sunday", timeZone: string): string {
  const today = localDateInTimeZone(now, timeZone);
  const weekday = calendarDateObject(today).getUTCDay();
  return addCalendarDays(today, -(start === "sunday" ? weekday : (weekday + 6) % 7));
}

export function weekOffsetBetween(current: string, selected: string): number {
  return Math.round((calendarDateObject(selected).getTime() - calendarDateObject(current).getTime()) / 604800000);
}
