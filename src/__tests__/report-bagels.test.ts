import { describe, expect, it } from "vitest";
import { generateEmailHtml, generatePlainReport, generatePlainReportHtml, generateReport, type WeekData } from "@/lib/report";
import { PDFDocument } from "pdf-lib";
import { generateConsolidatedReportPdf, generateReportPdf } from "@/lib/generatePdf";
import { DEFAULT_TRACKERS, type TrackerSettings } from "@/lib/tracking";

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
    expect(report).toContain("## Drinks Tracking 🥃");
    expect(report).toContain("| 2 | 0 | 0 | 0 | 0 | 0 | 0 | **2** |");
    expect(report).toContain("## Bagels Tracking 🥯");
    expect(report).toContain("| 1 | 1 | 1 | 1 | 0 | 0 | 0 | **4** |");
    expect(report).toContain("**🥃 Drinks:** 2");
    expect(report).toContain("**🥯 Bagels:** 1");
  });

  it("includes both drinks and bagels in rich copy plain/html output", () => {
    const { plain, html } = generatePlainReportHtml(makeWeek());
    expect(plain).toContain("Drinks: 2");
    expect(plain).toContain("Bagels: 4");
    expect(html).toContain("🥃 Drinks:");
    expect(html).toContain("🥯 Bagels:");
  });

  it("includes both drinks and bagels in plain report output", () => {
    const report = generatePlainReport(makeWeek());
    expect(report).toContain("Drinks: 2");
    expect(report).toContain("Bagels: 4");
  });

  it("includes both drinks and bagels in email HTML output", () => {
    const html = generateEmailHtml(makeWeek());
    expect(html).toContain("🥃 Drinks: 2");
    expect(html).toContain("🥯 Bagels: 4");
  });

  it("removes disabled bagels from report outputs", () => {
    const settings: TrackerSettings = { trackers: DEFAULT_TRACKERS.map((tracker) => ({ ...tracker, enabled: tracker.id === "drinks" })) };
    expect(generateReport(makeWeek(), settings)).not.toContain("Bagel");
    expect(generatePlainReport(makeWeek(), settings)).not.toContain("Bagels");
    expect(generatePlainReportHtml(makeWeek(), settings).plain).not.toContain("Bagels");
    expect(generateEmailHtml(makeWeek(), settings)).not.toContain("Bagels");
  });

  it("adds optional boolean trackers only when enabled", () => {
    const settings: TrackerSettings = { trackers: DEFAULT_TRACKERS.map((tracker) => ({ ...tracker, enabled: ["steps10k", "coldPlunge", "fasting"].includes(tracker.id) })) };
    const report = generateReport(makeWeek(), settings);
    expect(report).toContain("## 10k Steps Tracking 👟");
    expect(report).toContain("## Cold Plunge Tracking 🧊");
    expect(report).toContain("## Fasting Tracking ⏳");
    expect(report).toContain("**5/7**");
    expect(report).toContain("**1/7**");
  });

  it("generates the PDF with tracker-aware data", async () => {
    const pdf = await generateReportPdf(makeWeek(), { trackers: DEFAULT_TRACKERS });
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });

  it("combines multiple weekly reports behind a cover page", async () => {
    const first = makeWeek();
    const second = makeWeek();
    second.weekOf = "2025-01-13T00:00:00.000Z";
    const pdf = await generateConsolidatedReportPdf(
      [first, second],
      { label: "January 2025", start: "2025-01-01", end: "2025-01-31" },
    );
    const document = await PDFDocument.load(pdf);
    const firstReport = await PDFDocument.load(await generateReportPdf(first));
    const secondReport = await PDFDocument.load(await generateReportPdf(second));
    expect(document.getPageCount()).toBe(1 + firstReport.getPageCount() + secondReport.getPageCount());
  });

  it("summarizes custom count and rating trackers", () => {
    const week = makeWeek();
    week.days.mon.trackers = { pages: 12, energy: 4 };
    week.days.tue.trackers = { pages: 8, energy: 2 };
    const settings: TrackerSettings = { trackers: [
      { id: "pages", label: "Reading", emoji: "📚", type: "counter", unit: "pages", enabled: true },
      { id: "energy", label: "Energy", emoji: "⚡", type: "rating", enabled: true },
    ] };
    const report = generateReport(week, settings);
    expect(report).toContain("## Reading Tracking 📚");
    expect(report).toContain("**20 pages**");
    expect(report).toContain("## Energy Tracking ⚡");
    expect(report).toContain("**3.0/5 avg**");
  });
});
