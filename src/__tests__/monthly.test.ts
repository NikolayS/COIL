import { describe, expect, it } from "vitest";
import { DEFAULT_TRACKER_SETTINGS } from "@/lib/tracking";
import { generateMonthlyReviewPdf } from "@/lib/generatePdf";
import {
  MONTHLY_REVIEW_PROMPTS,
  buildMonthlyEvidence,
  decodeStoredReview,
  encodeStoredReview,
  emptyMonthlyPlan,
  monthlyPlanStorageKey,
  monthRange,
  nextMonthKey,
  syncMonthlyPlanWithCycle,
  type MonthlyWeek,
} from "@/lib/monthly";

function day(overrides: Record<string, unknown> = {}) {
  return {
    territories: { self: false, health: false, wealth: false, relationships: false, business: false },
    commitments: { self: "", health: "", wealth: "", relationships: "", business: "" },
    basics: { ars: false, ad: false, workout: false, cfo: false },
    trackers: {},
    gratitude: "", wins: "", journal: "", reflection: "",
    ...overrides,
  };
}

describe("monthly review model", () => {
  it("uses one combined accomplishments prompt instead of two synonymous questions", () => {
    expect(MONTHLY_REVIEW_PROMPTS[0]).toEqual([
      "proud",
      "What were my greatest accomplishments this month, and which am I most proud of?",
    ]);
    expect(MONTHLY_REVIEW_PROMPTS).toHaveLength(10);
    expect(MONTHLY_REVIEW_PROMPTS.map(([key]) => String(key))).not.toContain("achievements");
  });

  it("preserves and combines distinct answers from the two legacy accomplishment fields", () => {
    const review = decodeStoredReview({
      proud: "I protected family time",
      achievements: "I shipped the release",
      lessons: "Focus",
    }, "2026-08");

    expect(review.responses).toEqual({
      proud: "I protected family time\n\nI shipped the release",
      lessons: "Focus",
    });
    expect(encodeStoredReview(review).__review).not.toHaveProperty("achievements");
  });

  it("uses one month-scoped storage key for both Review → Plan and the Plan tab", () => {
    expect(monthlyPlanStorageKey("2026-08")).toBe("coil_monthly_plan_2026-08");
    expect(() => monthlyPlanStorageKey("2026-13")).toThrow("Invalid month");
  });

  it("plans the month after the reviewed month across year boundaries", () => {
    expect(nextMonthKey("2026-07")).toBe("2026-08");
    expect(nextMonthKey("2026-12")).toBe("2027-01");
  });

  it("rejects month years outside the supported review range", () => {
    expect(() => monthRange("0099-01")).toThrow("Invalid month");
    expect(() => monthRange("2101-01")).toThrow("Invalid month");
  });

  it("loads legacy review answers without requiring goals", () => {
    const review = decodeStoredReview({ proud: "Shipped", lessons: "Focus" }, "2026-08");
    expect(review.responses).toEqual({ proud: "Shipped", lessons: "Focus" });
    expect(review.plan).toEqual(emptyMonthlyPlan("2026-08"));
  });

  it("round-trips review and next-month plan in existing JSON storage", () => {
    const review = decodeStoredReview({}, "2026-08");
    review.responses.proud = "Shipped";
    review.plan!.responses.mustWin = "Launch";
    review.plan!.territories.business.outcome = "Get ten users";
    expect(decodeStoredReview(encodeStoredReview(review), "2026-08")).toEqual(review);
  });

  it("falls back from an invalid stored plan month", () => {
    const review = decodeStoredReview({ __plan: { targetMonth: "2026-99" } }, "2026-08");
    expect(review.plan?.targetMonth).toBe("2026-08");
  });

  it("treats the month plan record as authoritative when reopening Review → Plan", () => {
    const plan = emptyMonthlyPlan("2026-08");
    plan.responses = { mustWin: "Stale review value", learning: "Read Designing Data-Intensive Applications" };
    plan.territories.business = { outcome: "Stale outcome", keystoneHabit: "Stale habit" };
    const cycle = {
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      mustWin: "Edited in Plan",
      territories: {
        ...plan.territories,
        business: { outcome: "", keystoneHabit: "Write daily" },
      },
    };

    const synced = syncMonthlyPlanWithCycle(plan, cycle);
    expect(synced.responses.mustWin).toBe("Edited in Plan");
    expect(synced.responses.learning).toBe("Read Designing Data-Intensive Applications");
    expect(synced.territories.business).toEqual({ outcome: "", keystoneHabit: "Write daily" });
  });
});

describe("monthly evidence", () => {
  const weeks: MonthlyWeek[] = [{
    weekOf: "2026-07-27",
    days: {
      mon: day(),
      tue: day({
        territories: { self: true, health: true, wealth: false, relationships: false, business: true },
        commitments: { self: "Read", health: "Train", wealth: "", relationships: "", business: "Ship" },
        basics: { ars: true, ad: false, cfo: true },
        wins: "Shipped the release",
      }),
      wed: day({ journal: "A recorded day with a zero score" }),
    },
  }];

  it.each([
    ["2026-02", "2026-02-28", 28],
    ["2028-02", "2028-02-29", 29],
    ["2026-04", "2026-04-30", 30],
    ["2026-07", "2026-07-31", 31],
  ])("uses the exact calendar length for %s", (month, through, expected) => {
    expect(buildMonthlyEvidence([], month, DEFAULT_TRACKER_SETTINGS, through).elapsedDays).toBe(expected);
  });

  it("uses only elapsed calendar days for an in-progress month", () => {
    expect(buildMonthlyEvidence([], "2026-08", DEFAULT_TRACKER_SETTINGS, "2026-08-03").elapsedDays).toBe(3);
    expect(buildMonthlyEvidence([], "2026-09", DEFAULT_TRACKER_SETTINGS, "2026-08-03").elapsedDays).toBe(0);
  });

  it("ignores malformed legacy day keys without losing valid evidence", () => {
    const evidence = buildMonthlyEvidence([{
      weekOf: "2026-07-27",
      days: {
        mon: day({ trackers: { fasting: true } }),
        invalid: day({ journal: "bad key" }),
      },
    }], "2026-07", {
      trackers: DEFAULT_TRACKER_SETTINGS.trackers.map((tracker) => ({
        ...tracker,
        enabled: tracker.id === "fasting",
      })),
    }, "2026-07-31");

    expect(evidence.trackedDays).toBe(1);
    expect(evidence.trackers[0].summary).toBe("1/31");
  });

  it("does not treat untouched calendar days as failed evidence", () => {
    const evidence = buildMonthlyEvidence(weeks, "2026-07", DEFAULT_TRACKER_SETTINGS, "2026-07-31");
    expect(evidence.elapsedDays).toBe(31);
    expect(evidence.trackedDays).toBe(2);
    expect(evidence.score).toBe(3);
    expect(evidence.possible).toBe(10);
  });

  it("summarizes commitments, basics, weekly trend, and notes", () => {
    const evidence = buildMonthlyEvidence(weeks, "2026-07", DEFAULT_TRACKER_SETTINGS, "2026-07-31");
    expect(evidence.commitmentsPlanned).toMatchObject({ self: 1, health: 1, business: 1 });
    expect(evidence.commitmentsCompleted).toMatchObject({ self: 1, health: 1, business: 1 });
    expect(evidence.basics).toEqual({ ars: 1, ad: 0, cfo: 1 });
    expect(evidence.weeklyTrend).toEqual([{ startsOn: "2026-07-27", trackedDays: 2, score: 3, possible: 10 }]);
    expect(evidence.wins).toEqual([{ date: "2026-07-28", text: "Shipped the release" }]);
  });

  it("groups weekly trend using the user's Sunday week start", () => {
    const evidence = buildMonthlyEvidence([{
      weekOf: "2026-07-05",
      days: {
        sun: day({ journal: "Sunday" }),
        mon: day({ journal: "Monday" }),
      },
    }], "2026-07", DEFAULT_TRACKER_SETTINGS, "2026-07-31", "sunday");

    expect(evidence.weeklyTrend).toEqual([{
      startsOn: "2026-07-05",
      trackedDays: 2,
      score: 0,
      possible: 10,
    }]);
  });

  it("uses calendar days, not tracked days, for boolean tracker frequency", () => {
    const evidence = buildMonthlyEvidence([{
      weekOf: "2026-07-27",
      days: {
        mon: day(),
        tue: day({ trackers: { gym: true } }),
        wed: day({ journal: "Tracked without gym" }),
      },
    }], "2026-07", DEFAULT_TRACKER_SETTINGS, "2026-07-31");

    expect(evidence.trackedDays).toBe(2);
    expect(evidence.trackers.find((tracker) => tracker.id === "gym")?.summary).toBe("1/31");
    expect(evidence.trackers.find((tracker) => tracker.id === "gym")?.entries).toEqual([
      { date: "2026-07-28", value: true },
    ]);
  });

  it("merges evidence from overlapping weekly records for the same calendar day", () => {
    const evidence = buildMonthlyEvidence([{
      weekOf: "2026-07-05",
      days: {
        mon: day({ bagels: 2, fasting: true }),
      },
    }, {
      weekOf: "2026-07-06",
      days: {
        mon: day({ bagels: 0, journal: "Edited from the Monday-start week" }),
      },
    }], "2026-07", {
      trackers: DEFAULT_TRACKER_SETTINGS.trackers.map((tracker) => ({
        ...tracker,
        enabled: tracker.id === "bagels" || tracker.id === "fasting",
      })),
    }, "2026-07-31");

    expect(evidence.trackedDays).toBe(1);
    expect(evidence.trackers.find((tracker) => tracker.id === "bagels")?.summary).toBe("2");
    expect(evidence.trackers.find((tracker) => tracker.id === "bagels")?.entries).toEqual([
      { date: "2026-07-06", value: 2 },
    ]);
    expect(evidence.trackers.find((tracker) => tracker.id === "fasting")?.summary).toBe("1/31");
  });

  it("generates a complete monthly PDF even when no goals were set", async () => {
    const review = decodeStoredReview({
      proud: "Shipped the release",
      __plan: {
        targetMonth: "2026-08",
        responses: { mustWin: "Launch the next iteration" },
        territories: {},
      },
    }, "2026-08");
    const pdf = await generateMonthlyReviewPdf({
      label: "July 2026",
      evidence: buildMonthlyEvidence(weeks, "2026-07", DEFAULT_TRACKER_SETTINGS, "2026-07-31"),
      review,
      goals: null,
    });
    expect(pdf.byteLength).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF");
  });
});
