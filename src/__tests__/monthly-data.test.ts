import { describe, expect, it } from "vitest";
import {
  evidenceQueryRange,
  monthlyWeeksFromResult,
  monthlyWeeksFromRows,
} from "@/lib/monthly-data";

describe("monthly review evidence loading", () => {
  it("loads the reviewed month, overlapping weeks, and the full comparison month", () => {
    expect(evidenceQueryRange({ startsOn: "2026-07-01", endsOn: "2026-07-31" }, "month"))
      .toEqual({ startsOn: "2026-05-26", endsOn: "2026-07-31" });
  });

  it("handles the previous-year comparison window", () => {
    expect(evidenceQueryRange({ startsOn: "2027-01-01", endsOn: "2027-01-31" }, "month"))
      .toEqual({ startsOn: "2026-11-25", endsOn: "2027-01-31" });
  });

  it("loads only overlapping weeks for quarterly reviews", () => {
    expect(evidenceQueryRange({ startsOn: "2026-07-01", endsOn: "2026-09-30" }, "quarter"))
      .toEqual({ startsOn: "2026-06-25", endsOn: "2026-09-30" });
  });

  it("uses the database week date instead of stale embedded navigation state", () => {
    expect(monthlyWeeksFromRows([{
      week_of: "2026-07-27",
      data: {
        weekOf: "2026-08-02T00:00:00.000Z",
        days: { mon: { trackers: { fasting: true } } },
      },
    }])).toEqual([{
      weekOf: "2026-07-27",
      days: { mon: { trackers: { fasting: true } } },
    }]);
  });

  it("ignores malformed database rows instead of inventing empty weeks", () => {
    expect(monthlyWeeksFromRows([
      { week_of: "2026-07-20", data: null },
      { week_of: "not-a-date", data: { days: { mon: {} } } },
      { week_of: "2026-07-27", data: { days: null } },
    ])).toEqual([]);
  });

  it("never turns a failed evidence query into an authoritative empty month", () => {
    expect(() => monthlyWeeksFromResult({ data: null, error: { message: "network down" } }))
      .toThrow("network down");
  });
});
