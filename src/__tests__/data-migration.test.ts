/**
 * Data migration tests.
 *
 * Regression: wolf field was stored as a single string ("wise") in old localStorage
 * data but code was changed to expect an array (WolfModes = string[]). Clicking
 * past days caused a client-side crash.
 *
 * Fix: migrateWeekData() normalizes wolf to an array on load.
 */

import { describe, it, expect } from "vitest";

type WolfMode = "wise" | "open" | "loving" | "fierce";
type WolfModes = WolfMode[];

interface DayData {
  territories: Record<string, boolean>;
  wolf: WolfModes;
  drinks: number;
  journal: string;
  reflection: string;
}

interface WeekData {
  weekOf: string;
  days: Record<string, DayData>;
  weekly: Record<string, string>;
}

// Copied from src/app/page.tsx — must stay in sync
function migrateWeekData(data: WeekData): WeekData {
  const days = Object.fromEntries(
    Object.entries(data.days).map(([k, d]) => [
      k,
      { ...d, wolf: Array.isArray(d.wolf) ? d.wolf : d.wolf ? [d.wolf as unknown as WolfMode] : [] },
    ])
  );
  return { ...data, days };
}

function makeDay(wolf: unknown): DayData {
  return {
    territories: { self: false, health: false, relationships: false, wealth: false, business: false },
    wolf: wolf as WolfModes,
    drinks: 0,
    journal: "",
    reflection: "",
  };
}

function makeWeek(days: Record<string, unknown>): WeekData {
  return {
    weekOf: new Date().toISOString(),
    days: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, makeDay(v)])),
    weekly: {},
  };
}

describe("wolf field migration", () => {
  it("leaves array wolf unchanged", () => {
    const week = makeWeek({ mon: ["wise", "fierce"] });
    const result = migrateWeekData(week);
    expect(result.days.mon.wolf).toEqual(["wise", "fierce"]);
  });

  it("wraps old string wolf in array", () => {
    const week = makeWeek({ mon: "wise" });
    const result = migrateWeekData(week);
    expect(result.days.mon.wolf).toEqual(["wise"]);
  });

  it("converts null wolf to empty array", () => {
    const week = makeWeek({ mon: null });
    const result = migrateWeekData(week);
    expect(result.days.mon.wolf).toEqual([]);
  });

  it("converts undefined wolf to empty array", () => {
    const week = makeWeek({ mon: undefined });
    const result = migrateWeekData(week);
    expect(result.days.mon.wolf).toEqual([]);
  });

  it("migrates all days in a week", () => {
    const week = makeWeek({ mon: "open", tue: ["loving"], wed: null, thu: "fierce" });
    const result = migrateWeekData(week);
    expect(result.days.mon.wolf).toEqual(["open"]);
    expect(result.days.tue.wolf).toEqual(["loving"]);
    expect(result.days.wed.wolf).toEqual([]);
    expect(result.days.thu.wolf).toEqual(["fierce"]);
  });

  it("migrated wolf values are always arrays (never crash .includes)", () => {
    const week = makeWeek({ mon: "wise", tue: null, wed: ["open"] });
    const result = migrateWeekData(week);
    for (const day of Object.values(result.days)) {
      // This is the operation that crashed before migration
      expect(() => day.wolf.includes("wise")).not.toThrow();
      expect(Array.isArray(day.wolf)).toBe(true);
    }
  });
});
