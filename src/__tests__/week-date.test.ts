import { describe, expect, it } from "vitest";
import { calendarDate, addCalendarDays, weekKey, weekOffsetBetween } from "../lib/week-date";

describe("stable calendar week identity", () => {
  it.each(["America/Los_Angeles", "Europe/Lisbon", "Pacific/Auckland", "UTC"])("ignores browser TZ %s and uses settings", (browserZone) => {
    const previous = process.env.TZ;
    process.env.TZ = browserZone;
    try {
      expect(weekKey(new Date("2026-08-28T06:08:45Z"), "monday", "America/Los_Angeles")).toBe("2026-08-24");
      expect(weekKey(new Date("2026-08-24T00:30:00Z"), "monday", "America/Los_Angeles")).toBe("2026-08-17");
      expect(weekKey(new Date("2026-08-24T00:30:00Z"), "monday", "Europe/Lisbon")).toBe("2026-08-24");
    } finally { process.env.TZ = previous; }
  });
  it("supports Sunday weeks, DST transitions and year boundaries", () => {
    expect(weekKey(new Date("2026-08-28T06:08:45Z"), "sunday", "America/Los_Angeles")).toBe("2026-08-23");
    expect(weekKey(new Date("2026-03-09T06:30:00Z"), "monday", "America/Los_Angeles")).toBe("2026-03-02");
    expect(weekKey(new Date("2026-01-01T12:00:00Z"), "monday", "UTC")).toBe("2025-12-29");
    expect(addCalendarDays("2026-03-02", 7)).toBe("2026-03-09");
    expect(weekOffsetBetween("2026-03-09", "2026-03-02")).toBe(-1);
  });
  it("keeps a stored calendar key without converting to browser timezone", () => {
    expect(calendarDate("2026-08-24T07:00:00.000Z")).toBe("2026-08-24");
    expect(calendarDate("2026-08-23")).toBe("2026-08-23");
    expect(addCalendarDays("2026-12-28", 7)).toBe("2027-01-04");
  });
  it.each(["nope", "2026-02-30", "2026-13-01", "2026-08-24junk", ""])("rejects invalid dates: %s", (value) => {
    expect(() => calendarDate(value)).toThrow();
  });
});
