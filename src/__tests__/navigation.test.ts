import { describe, expect, it } from "vitest";
import { defaultViewForTab, parseTab, resolveView } from "@/lib/navigation";

describe("URL-backed app navigation", () => {
  it("parses current and legacy section names", () => {
    expect(parseTab("weekly")).toBe("week");
    expect(parseTab("cycle")).toBe("plan");
    expect(parseTab("export")).toBe("review");
    expect(parseTab(null)).toBe("today");
  });

  it("accepts only subtabs supported by the active section", () => {
    expect(resolveView("week", "report")).toBe("report");
    expect(resolveView("today", "report")).toBe("plan");
    expect(resolveView("review", "plan")).toBe("plan");
    expect(resolveView("plan", "review")).toBe("plan");
  });

  it("uses review-oriented defaults for past weeks", () => {
    expect(defaultViewForTab("today", -1)).toBe("close");
    expect(defaultViewForTab("week", -1)).toBe("review");
  });
});
