/**
 * Unit tests for pure helper functions extracted from src/app/page.tsx.
 *
 * Functions covered:
 *  - getMondayOfWeek(date)
 *  - calcScore(weekData)
 *  - migrateWeekData(data)
 *  - emptyWeekData(date)
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── Type definitions (mirrors src/app/page.tsx) ───────────────────────────────

type TerritoryKey = "self" | "health" | "relationships" | "wealth" | "business";
type WolfMode = "wise" | "open" | "loving" | "fierce";
type WolfModes = WolfMode[];

interface DayData {
  territories: Record<TerritoryKey, boolean>;
  wolf: WolfModes;
  drinks: number;
  journal: string;
  reflection: string;
}

interface WeekData {
  weekOf: string;
  days: Record<string, DayData>;
  weekly: {
    wins: string;
    gratitude: string;
    lessons: string;
    focusAchieved: string;
    focusNext: string;
    stretchNext: string;
    onTrack: string;
    cupOverflowing: string;
    improve: string;
  };
}

// ── Implementations (copied from src/app/page.tsx — keep in sync) ─────────────

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function emptyDayData(): DayData {
  return {
    territories: { self: false, health: false, relationships: false, wealth: false, business: false },
    wolf: [],
    drinks: 0,
    journal: "",
    reflection: "",
  };
}

function emptyWeekData(monday: Date): WeekData {
  return {
    weekOf: monday.toISOString(),
    days: Object.fromEntries(DAYS.map((d) => [d, emptyDayData()])),
    weekly: {
      wins: "", gratitude: "", lessons: "", focusAchieved: "",
      focusNext: "", stretchNext: "", onTrack: "", cupOverflowing: "", improve: "",
    },
  };
}

function calcScore(data: WeekData): number {
  let score = 0;
  for (const day of DAYS) {
    const d = data.days[day];
    if (d) score += Object.values(d.territories).filter(Boolean).length;
  }
  return score;
}

function migrateWeekData(data: WeekData): WeekData {
  const days = Object.fromEntries(
    Object.entries(data.days).map(([k, d]) => [
      k,
      { ...d, wolf: Array.isArray(d.wolf) ? d.wolf : d.wolf ? [d.wolf as unknown as WolfMode] : [] },
    ])
  );
  return { ...data, days };
}

// ── Helpers for constructing test data ────────────────────────────────────────

function dayWith(territories: Partial<Record<TerritoryKey, boolean>>): DayData {
  return {
    territories: {
      self: false,
      health: false,
      relationships: false,
      wealth: false,
      business: false,
      ...territories,
    },
    wolf: [],
    drinks: 0,
    journal: "",
    reflection: "",
  };
}

function weekWithDays(dayOverrides: Partial<Record<string, Partial<Record<TerritoryKey, boolean>>>>): WeekData {
  const base = emptyWeekData(getMondayOfWeek(new Date("2025-01-06"))); // a known Monday
  for (const [day, overrides] of Object.entries(dayOverrides)) {
    base.days[day] = dayWith(overrides ?? {});
  }
  return base;
}

// ── getMondayOfWeek ───────────────────────────────────────────────────────────

describe("getMondayOfWeek", () => {
  /**
   * Reference week: Mon 2025-01-06 → Sun 2025-01-12
   * We test all 7 days — each should return 2025-01-06
   */
  const EXPECTED_MONDAY = "2025-01-06";

  it("returns same Monday when input IS a Monday", () => {
    const result = getMondayOfWeek(new Date("2025-01-06T12:00:00"));
    expect(result.toISOString().slice(0, 10)).toBe(EXPECTED_MONDAY);
  });

  it("returns the Monday when input is Tuesday", () => {
    const result = getMondayOfWeek(new Date("2025-01-07T09:00:00"));
    expect(result.toISOString().slice(0, 10)).toBe(EXPECTED_MONDAY);
  });

  it("returns the Monday when input is Wednesday", () => {
    const result = getMondayOfWeek(new Date("2025-01-08T00:00:00"));
    expect(result.toISOString().slice(0, 10)).toBe(EXPECTED_MONDAY);
  });

  it("returns the Monday when input is Thursday", () => {
    const result = getMondayOfWeek(new Date("2025-01-09T23:59:00"));
    expect(result.toISOString().slice(0, 10)).toBe(EXPECTED_MONDAY);
  });

  it("returns the Monday when input is Friday", () => {
    const result = getMondayOfWeek(new Date("2025-01-10T08:00:00"));
    expect(result.toISOString().slice(0, 10)).toBe(EXPECTED_MONDAY);
  });

  it("returns the Monday when input is Saturday", () => {
    const result = getMondayOfWeek(new Date("2025-01-11T15:00:00"));
    expect(result.toISOString().slice(0, 10)).toBe(EXPECTED_MONDAY);
  });

  it("returns the PREVIOUS Monday when input is Sunday (ISO week: Sunday ends the week)", () => {
    // Sunday 2025-01-12 → Monday 2025-01-06 (not 2025-01-13)
    const result = getMondayOfWeek(new Date("2025-01-12T10:00:00"));
    expect(result.toISOString().slice(0, 10)).toBe(EXPECTED_MONDAY);
  });

  it("resets time to midnight", () => {
    const result = getMondayOfWeek(new Date("2025-01-08T14:30:45.123"));
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it("does not mutate the input date", () => {
    const input = new Date("2025-01-08T12:00:00");
    const originalTime = input.getTime();
    getMondayOfWeek(input);
    expect(input.getTime()).toBe(originalTime);
  });

  it("handles year-boundary crossing (Dec 31 → Jan in next year's week)", () => {
    // Wed 2025-12-31 → Monday 2025-12-29
    const result = getMondayOfWeek(new Date("2025-12-31T00:00:00"));
    expect(result.toISOString().slice(0, 10)).toBe("2025-12-29");
  });

  it("handles year-boundary crossing (Jan 1 2026 → Dec 29 2025)", () => {
    // Thu 2026-01-01 → Monday 2025-12-29
    const result = getMondayOfWeek(new Date("2026-01-01T00:00:00"));
    expect(result.toISOString().slice(0, 10)).toBe("2025-12-29");
  });

  it("handles Sunday Jan 5 2025 → Monday Dec 30 2024", () => {
    const result = getMondayOfWeek(new Date("2025-01-05T00:00:00"));
    expect(result.toISOString().slice(0, 10)).toBe("2024-12-30");
  });
});

// ── calcScore ─────────────────────────────────────────────────────────────────

describe("calcScore", () => {
  it("returns 0 for empty week (all false)", () => {
    const data = emptyWeekData(getMondayOfWeek(new Date("2025-01-06")));
    expect(calcScore(data)).toBe(0);
  });

  it("returns 35 for a perfect week (all 5 territories × 7 days)", () => {
    const data = emptyWeekData(getMondayOfWeek(new Date("2025-01-06")));
    for (const day of DAYS) {
      data.days[day].territories = {
        self: true,
        health: true,
        relationships: true,
        wealth: true,
        business: true,
      };
    }
    expect(calcScore(data)).toBe(35);
  });

  it("returns 1 for single territory checked on single day", () => {
    const data = weekWithDays({ mon: { self: true } });
    expect(calcScore(data)).toBe(1);
  });

  it("returns 5 for all territories checked on one day", () => {
    const data = weekWithDays({
      mon: { self: true, health: true, relationships: true, wealth: true, business: true },
    });
    expect(calcScore(data)).toBe(5);
  });

  it("returns 7 for a single territory checked every day", () => {
    const allDays = Object.fromEntries(DAYS.map((d) => [d, { self: true }]));
    const data = weekWithDays(allDays);
    expect(calcScore(data)).toBe(7);
  });

  it("returns 14 for two territories every day", () => {
    const allDays = Object.fromEntries(DAYS.map((d) => [d, { self: true, health: true }]));
    const data = weekWithDays(allDays);
    expect(calcScore(data)).toBe(14);
  });

  it("only counts true values, not drinks/journal/wolf", () => {
    const data = emptyWeekData(getMondayOfWeek(new Date("2025-01-06")));
    data.days["mon"].drinks = 5;
    data.days["mon"].journal = "busy day";
    data.days["mon"].wolf = ["wise"];
    // territories still all false
    expect(calcScore(data)).toBe(0);
  });

  it("handles missing day keys gracefully (skips them)", () => {
    const data = emptyWeekData(getMondayOfWeek(new Date("2025-01-06")));
    // Remove a day entirely
    delete data.days["wed"];
    // Should still count the other 6 days without throwing
    expect(() => calcScore(data)).not.toThrow();
    expect(calcScore(data)).toBe(0);
  });

  it("partial fill — mon+tue self+health = 4", () => {
    const data = weekWithDays({
      mon: { self: true, health: true },
      tue: { self: true, health: true },
    });
    expect(calcScore(data)).toBe(4);
  });
});

// ── emptyWeekData ─────────────────────────────────────────────────────────────

describe("emptyWeekData", () => {
  const monday = new Date("2025-01-06T00:00:00.000Z");
  let data: WeekData;

  beforeEach(() => {
    data = emptyWeekData(monday);
  });

  it("sets weekOf to the Monday ISO string", () => {
    expect(data.weekOf).toBe(monday.toISOString());
  });

  it("has all 7 day keys", () => {
    for (const day of DAYS) {
      expect(data.days[day]).toBeDefined();
    }
    expect(Object.keys(data.days)).toHaveLength(7);
  });

  it("all territories are false", () => {
    for (const day of DAYS) {
      expect(data.days[day].territories.self).toBe(false);
      expect(data.days[day].territories.health).toBe(false);
      expect(data.days[day].territories.relationships).toBe(false);
      expect(data.days[day].territories.wealth).toBe(false);
      expect(data.days[day].territories.business).toBe(false);
    }
  });

  it("all wolf arrays are empty", () => {
    for (const day of DAYS) {
      expect(data.days[day].wolf).toEqual([]);
    }
  });

  it("all drinks are 0", () => {
    for (const day of DAYS) {
      expect(data.days[day].drinks).toBe(0);
    }
  });

  it("all journal and reflection strings are empty", () => {
    for (const day of DAYS) {
      expect(data.days[day].journal).toBe("");
      expect(data.days[day].reflection).toBe("");
    }
  });

  it("weekly fields are all empty strings", () => {
    expect(data.weekly.wins).toBe("");
    expect(data.weekly.gratitude).toBe("");
    expect(data.weekly.lessons).toBe("");
    expect(data.weekly.focusAchieved).toBe("");
    expect(data.weekly.focusNext).toBe("");
    expect(data.weekly.stretchNext).toBe("");
    expect(data.weekly.onTrack).toBe("");
    expect(data.weekly.cupOverflowing).toBe("");
    expect(data.weekly.improve).toBe("");
  });

  it("calcScore of empty week is 0", () => {
    expect(calcScore(data)).toBe(0);
  });

  it("each day data is independent (not shared reference)", () => {
    data.days["mon"].territories.self = true;
    expect(data.days["tue"].territories.self).toBe(false);
  });
});

// ── migrateWeekData ───────────────────────────────────────────────────────────

describe("migrateWeekData", () => {
  function makeBaseWeek(days: Record<string, unknown>): WeekData {
    return {
      weekOf: new Date("2025-01-06").toISOString(),
      days: Object.fromEntries(
        Object.entries(days).map(([k, wolf]) => [
          k,
          {
            territories: { self: false, health: false, relationships: false, wealth: false, business: false },
            wolf,
            drinks: 0,
            journal: "",
            reflection: "",
          } as DayData,
        ])
      ),
      weekly: {
        wins: "", gratitude: "", lessons: "", focusAchieved: "",
        focusNext: "", stretchNext: "", onTrack: "", cupOverflowing: "", improve: "",
      },
    };
  }

  it("leaves already-array wolf unchanged", () => {
    const data = makeBaseWeek({ mon: ["wise", "fierce"] });
    const result = migrateWeekData(data);
    expect(result.days.mon.wolf).toEqual(["wise", "fierce"]);
  });

  it("wraps old string wolf into an array", () => {
    const data = makeBaseWeek({ mon: "wise" });
    const result = migrateWeekData(data);
    expect(result.days.mon.wolf).toEqual(["wise"]);
  });

  it("converts null wolf to empty array", () => {
    const data = makeBaseWeek({ mon: null });
    const result = migrateWeekData(data);
    expect(result.days.mon.wolf).toEqual([]);
  });

  it("converts undefined wolf to empty array", () => {
    const data = makeBaseWeek({ mon: undefined });
    const result = migrateWeekData(data);
    expect(result.days.mon.wolf).toEqual([]);
  });

  it("converts empty string wolf to empty array", () => {
    const data = makeBaseWeek({ mon: "" });
    const result = migrateWeekData(data);
    // empty string is falsy → empty array
    expect(result.days.mon.wolf).toEqual([]);
  });

  it("migrates all days in a week simultaneously", () => {
    const data = makeBaseWeek({
      mon: "open",
      tue: ["loving"],
      wed: null,
      thu: "fierce",
      fri: ["wise", "open"],
      sat: undefined,
      sun: "loving",
    });
    const result = migrateWeekData(data);
    expect(result.days.mon.wolf).toEqual(["open"]);
    expect(result.days.tue.wolf).toEqual(["loving"]);
    expect(result.days.wed.wolf).toEqual([]);
    expect(result.days.thu.wolf).toEqual(["fierce"]);
    expect(result.days.fri.wolf).toEqual(["wise", "open"]);
    expect(result.days.sat.wolf).toEqual([]);
    expect(result.days.sun.wolf).toEqual(["loving"]);
  });

  it("result wolf arrays support .includes() without throwing (was the crash)", () => {
    const data = makeBaseWeek({ mon: "wise", tue: null, wed: ["open"] });
    const result = migrateWeekData(data);
    for (const day of Object.values(result.days)) {
      expect(() => day.wolf.includes("wise")).not.toThrow();
      expect(Array.isArray(day.wolf)).toBe(true);
    }
  });

  it("preserves other day fields during migration", () => {
    const data = makeBaseWeek({ mon: "wise" });
    data.days.mon.drinks = 3;
    data.days.mon.journal = "great day";
    data.days.mon.territories.self = true;
    const result = migrateWeekData(data);
    expect(result.days.mon.drinks).toBe(3);
    expect(result.days.mon.journal).toBe("great day");
    expect(result.days.mon.territories.self).toBe(true);
  });

  it("preserves weekOf and weekly fields", () => {
    const data = makeBaseWeek({ mon: "wise" });
    data.weekly.wins = "shipped feature";
    const result = migrateWeekData(data);
    expect(result.weekOf).toBe(data.weekOf);
    expect(result.weekly.wins).toBe("shipped feature");
  });

  it("does not mutate the original data", () => {
    const data = makeBaseWeek({ mon: "wise" });
    const originalWolf = data.days.mon.wolf;
    migrateWeekData(data);
    expect(data.days.mon.wolf).toBe(originalWolf); // same reference, unchanged
  });
});
