import { describe, expect, it } from "vitest";
import {
  createDefaultCycle,
  defaultDailyPhase,
  getReviewPeriod,
  isDailyPhaseLocked,
  migrateDayIntentions,
  migrateWeeklyIntentions,
  seedWeeklyPrioritiesFromCycle,
} from "@/lib/intentional";

describe("daily Plan/Close phase", () => {
  it("defaults past days to Close and current/future days to Plan", () => {
    expect(defaultDailyPhase(7)).toBe("close");
    expect(defaultDailyPhase(1)).toBe("close");
    expect(defaultDailyPhase(0)).toBe("plan");
    expect(defaultDailyPhase(-1)).toBe("plan");
  });

  it("locks Plan for every past day until explicitly unlocked", () => {
    expect(isDailyPhaseLocked(1, "plan", false)).toBe(true);
    expect(isDailyPhaseLocked(7, "plan", false)).toBe(true);
    expect(isDailyPhaseLocked(1, "plan", true)).toBe(false);
  });

  it("keeps future Close and older Close entries protected", () => {
    expect(isDailyPhaseLocked(-1, "close", false)).toBe(true);
    expect(isDailyPhaseLocked(1, "close", false)).toBe(false);
    expect(isDailyPhaseLocked(2, "close", false)).toBe(true);
    expect(isDailyPhaseLocked(2, "close", true)).toBe(false);
  });
});

describe("createDefaultCycle", () => {
  it("creates the containing calendar month instead of an arbitrary 30-day range", () => {
    const cycle = createDefaultCycle(new Date("2026-07-31T12:00:00Z"));

    expect(cycle.startsOn).toBe("2026-07-01");
    expect(cycle.endsOn).toBe("2026-07-31");
  });

  it("creates outcome and keystone habit fields for all territories", () => {
    const cycle = createDefaultCycle(new Date("2026-07-31T12:00:00Z"));

    expect(Object.keys(cycle.territories)).toEqual([
      "self",
      "health",
      "wealth",
      "relationships",
      "business",
    ]);
    expect(cycle.territories.health).toEqual({ outcome: "", keystoneHabit: "" });
  });
});

describe("cycle carry-forward", () => {
  it("seeds blank weekly priorities and preserves user-entered ones", () => {
    const cycle = createDefaultCycle(new Date("2026-08-01T12:00:00Z"));
    cycle.territories.self.outcome = "Read every day";
    cycle.territories.business.outcome = "Ship release";

    expect(seedWeeklyPrioritiesFromCycle({
      self: "Already chose a book",
      health: "",
      wealth: "",
      relationships: "",
      business: "",
    }, cycle)).toEqual({
      self: "Already chose a book",
      health: "",
      wealth: "",
      relationships: "",
      business: "Ship release",
    });
  });
});

describe("getReviewPeriod", () => {
  it("returns the full calendar month, including leap day", () => {
    expect(getReviewPeriod("month", "2028-02")).toEqual({
      startsOn: "2028-02-01",
      endsOn: "2028-02-29",
      label: "February 2028",
    });
  });

  it("returns quarter boundaries", () => {
    expect(getReviewPeriod("quarter", "2026-Q4")).toEqual({
      startsOn: "2026-10-01",
      endsOn: "2026-12-31",
      label: "Q4 2026",
    });
  });

  it("rejects malformed period keys", () => {
    expect(() => getReviewPeriod("month", "2026-13")).toThrow("Invalid month");
    expect(() => getReviewPeriod("quarter", "2026-Q5")).toThrow("Invalid quarter");
  });
});

describe("intentional data migration", () => {
  it("backfills daily planning, Basics, and tomorrow priority", () => {
    const migrated = migrateDayIntentions({});

    expect(migrated.commitments).toEqual({
      self: "",
      health: "",
      wealth: "",
      relationships: "",
      business: "",
    });
    expect(migrated.basics).toEqual({
      ars: false,
      ad: false,
      workout: false,
      cfo: false,
    });
    expect(migrated.arsSteps).toEqual({
      outsideWithoutScreens: false,
      walk: false,
      meditate: false,
      reviewPreviousDay: false,
      reviewTodayGoals: false,
    });
    expect(migrated.tomorrowPriority).toBe("");
  });

  it("preserves existing intentional daily values", () => {
    const migrated = migrateDayIntentions({
      commitments: { self: "Read", health: "Train" },
      basics: { ars: true, ad: true, workout: true, cfo: true },
      arsSteps: {
        outsideWithoutScreens: true,
        walk: true,
        meditate: true,
        reviewPreviousDay: true,
        reviewTodayGoals: true,
      },
      tomorrowPriority: "Ship the proposal",
    });

    expect(migrated.commitments.self).toBe("Read");
    expect(migrated.commitments.health).toBe("Train");
    expect(migrated.basics).toEqual({ ars: true, ad: true, workout: true, cfo: true });
    expect(migrated.arsSteps).toEqual({
      outsideWithoutScreens: true,
      walk: true,
      meditate: true,
      reviewPreviousDay: true,
      reviewTodayGoals: true,
    });
    expect(migrated.tomorrowPriority).toBe("Ship the proposal");
  });

  it("backfills weekly priorities and three critical actions", () => {
    const migrated = migrateWeeklyIntentions({});

    expect(migrated.priorities.self).toBe("");
    expect(migrated.priorities.business).toBe("");
    expect(migrated.criticalActions).toEqual(["", "", ""]);
  });
});
