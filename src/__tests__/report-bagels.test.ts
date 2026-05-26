import { describe, expect, it } from "vitest";
import { generateEmailHtml, generatePlainReport, generatePlainReportHtml, generateReport, type WeekData } from "@/lib/report";
import { generateReportPdf } from "@/lib/generatePdf";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function makeWeek(): WeekData {
  return {
    weekOf: "2025-01-06T00:00:00.000Z",
    days: Object.fromEntries(DAYS.map((day, i) => [
      day,
      {
        territories: { self: day === "mon", health: false, relationships: false, wealth: false, business: false },
        wolf: [],
        drinks: i === 0 ? 2 : 0,
        bagels: i < 4 ? 1 : 0,
        steps10k: i < 5,
        coldPlunge: i === 0,
        fasting: i === 6,
        gratitude: "",
        wins: "",
        journal: "",
        reflection: "",
      },
    ])),
    weekly: {
      wins: "", gratitude: "", biggestWin: "", lessons: "", focusAchieved: "",
      focusNext: "", stretchNext: "", onTrack: "", cupOverflowing: "", improve: "",
    },
  } as WeekData;
}

describe("bagel tracking in report outputs", () => {
  it("includes both drinks and bagels in AI chat copy output", () => {
    const report = generateReport(makeWeek());
    expect(report).toContain("## Alcohol Tracking");
    expect(report).toContain("| 2 | 0 | 0 | 0 | 0 | 0 | 0 | **2** |");
    expect(report).toContain("## Bagel Tracking 🥯");
    expect(report).toContain("| 1 | 1 | 1 | 1 | 0 | 0 | 0 | **4** |");
    expect(report).toContain("**Drinks:** 2");
    expect(report).toContain("**Bagels:** 1");
  });

  it("includes both drinks and bagels in rich copy plain/html output", () => {
    const { plain, html } = generatePlainReportHtml(makeWeek());
    expect(plain).toContain("Drinks: 2");
    expect(plain).toContain("Bagels: 4");
    expect(html).toContain("Drinks:");
    expect(html).toContain("Bagels:");
  });

  it("includes both drinks and bagels in plain report output", () => {
    const report = generatePlainReport(makeWeek());
    expect(report).toContain("Drinks: 2");
    expect(report).toContain("Bagels: 4");
  });

  it("includes both drinks and bagels in email HTML output", () => {
    const html = generateEmailHtml(makeWeek());
    expect(html).toContain("Drinks this week: 2");
    expect(html).toContain("Bagels this week: 4");
  });

  it("removes disabled bagels from report outputs", () => {
    const settings = { bagelsEnabled: false, steps10kEnabled: false, coldPlungeEnabled: false, fastingEnabled: false };
    expect(generateReport(makeWeek(), settings)).not.toContain("Bagel");
    expect(generatePlainReport(makeWeek(), settings)).not.toContain("Bagels");
    expect(generatePlainReportHtml(makeWeek(), settings).plain).not.toContain("Bagels");
    expect(generateEmailHtml(makeWeek(), settings)).not.toContain("Bagels");
  });

  it("adds optional boolean trackers only when enabled", () => {
    const settings = { bagelsEnabled: false, steps10kEnabled: true, coldPlungeEnabled: true, fastingEnabled: true };
    const report = generateReport(makeWeek(), settings);
    expect(report).toContain("## 10k Steps Tracking 👟");
    expect(report).toContain("## Cold Plunge Tracking 🧊");
    expect(report).toContain("## Fasting Tracking ⏳");
    expect(report).toContain("**5/7**");
    expect(report).toContain("**1/7**");
  });

  it("generates the PDF with tracker-aware data", async () => {
    const pdf = await generateReportPdf(makeWeek(), { bagelsEnabled: true, steps10kEnabled: true, coldPlungeEnabled: true, fastingEnabled: true });
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
