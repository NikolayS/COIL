import { describe, expect, it } from "vitest";
import { DEFAULT_TRACKER_SETTINGS } from "@/lib/tracking";
import { generateMonthlyReviewPdf } from "@/lib/generatePdf";
import {
  buildMonthlyEvidence,
  decodeStoredReview,
  encodeStoredReview,
  emptyMonthlyPlan,
  mergeMonthlyPlanWithCycle,
  nextMonthKey,
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
  it("plans the month after the reviewed month across year boundaries", () => {
    expect(nextMonthKey("2026-07")).toBe("2026-08");
    expect(nextMonthKey("2026-12")).toBe("2027-01");
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

  it("preserves existing cycle goals when the monthly plan leaves fields blank", () => {
    const plan = emptyMonthlyPlan("2026-08");
    plan.territories.business.outcome = "New business outcome";
    const existing = {
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      mustWin: "Existing must-win",
      territories: emptyMonthlyPlan("2026-08").territories,
    };
    existing.territories.business.outcome = "Old business outcome";
    existing.territories.business.keystoneHabit = "Daily sales call";
    const merged = mergeMonthlyPlanWithCycle(plan, existing);
    expect(merged.responses.mustWin).toBe("Existing must-win");
    expect(merged.territories.business).toEqual({
      outcome: "New business outcome",
      keystoneHabit: "Daily sales call",
    });
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
