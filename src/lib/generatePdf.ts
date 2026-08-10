// PDF report generator using pdf-lib + embedded Liberation Sans fonts
// Returns a Buffer containing the PDF bytes

import { PDFDocument, rgb, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import type { WeekData } from "./report";
import { enabledTrackers, getTrackerValue, DEFAULT_TRACKER_SETTINGS, type TrackerSettings } from "./tracking";
import { MONTHLY_PLAN_PROMPTS, MONTHLY_REVIEW_PROMPTS, monthRange, type MonthlyEvidence } from "./monthly";
import { TERRITORY_KEYS, type CycleData, type ReviewData } from "./intentional";

export function wrapPdfText(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string[] {
  const wrapped: string[] = [];

  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      wrapped.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > maxWidth) {
        wrapped.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) wrapped.push(line);
  }

  return wrapped;
}

export function monthlyPdfAnswerKeepTogetherHeight(promptLineCount: number, answerLineCount: number): number {
  return (Math.max(1, promptLineCount) + Math.min(2, Math.max(1, answerLineCount))) * 13 + 12;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TERRITORIES = [
  { key: "self" as const, label: "Self" },
  { key: "health" as const, label: "Health" },
  { key: "wealth" as const, label: "Wealth" },
  { key: "relationships" as const, label: "Relationships" },
  { key: "business" as const, label: "Business" },
];

const TERRITORY_COLORS = [
  rgb(0.24, 0.63, 0.42),
  rgb(0.78, 0.31, 0.31),
  rgb(0.23, 0.49, 0.75),
  rgb(0.82, 0.52, 0.16),
  rgb(0.48, 0.27, 0.86),
];

const COLORS = {
  primary: rgb(0.65, 0.48, 0.15),
  dark: rgb(0.1, 0.1, 0.1),
  mid: rgb(0.45, 0.45, 0.45),
  light: rgb(0.85, 0.85, 0.85),
  rowAlt: rgb(0.96, 0.96, 0.96),
  white: rgb(1, 1, 1),
  green: rgb(0.15, 0.55, 0.15),
};

function fontPath(name: string): string {
  // Works both in dev (relative to src/) and in Next.js standalone build
  const candidates = [
    path.join(process.cwd(), "src/fonts", name),
    path.join(__dirname, "../fonts", name),
    path.join(__dirname, "../../src/fonts", name),
    // standalone build copies public/ but not src/ — use process.cwd()
    path.join(process.cwd(), "fonts", name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Font not found: ${name}. Tried: ${candidates.join(", ")}`);
}

export async function generateReportPdf(data: WeekData, settings: TrackerSettings = DEFAULT_TRACKER_SETTINGS): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  // Load fonts
  const regularBytes = fs.readFileSync(fontPath("LiberationSans-Regular.ttf"));
  const boldBytes = fs.readFileSync(fontPath("LiberationSans-Bold.ttf"));
  const italicBytes = fs.readFileSync(fontPath("LiberationSans-Italic.ttf"));

  const fontRegular = await doc.embedFont(regularBytes);
  const fontBold = await doc.embedFont(boldBytes);
  const fontItalic = await doc.embedFont(italicBytes);

  const PAGE_W = 595; // A4
  const PAGE_H = 842;
  const MARGIN = 45;
  const COL_W = PAGE_W - MARGIN * 2;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function checkY(needed: number) {
    if (y - needed < MARGIN + 20) newPage();
  }

  type DrawTextOpts = {
    bold?: boolean;
    italic?: boolean;
    size?: number;
    color?: RGB;
  };

  function drawText(str: string, x: number, yPos: number, opts: DrawTextOpts = {}) {
    const font = opts.bold ? fontBold : opts.italic ? fontItalic : fontRegular;
    const size = opts.size ?? 11;
    const color = opts.color ?? COLORS.dark;
    if (!str) return;
    page.drawText(str, { x, y: yPos, font, size, color });
  }

  function hline(yPos: number, color: RGB = COLORS.light) {
    page.drawLine({
      start: { x: MARGIN, y: yPos },
      end: { x: PAGE_W - MARGIN, y: yPos },
      thickness: 0.5,
      color,
    });
  }

  function wrapText(str: string, maxWidth: number, size: number): string[] {
    return wrapPdfText(str, maxWidth, (value) => fontRegular.widthOfTextAtSize(value, size));
  }

  // ── HEADER ──
  drawText("COIL  ·  WEEKLY REPORT", MARGIN, y, { bold: true, size: 10, color: COLORS.primary });
  y -= 20;
  hline(y, COLORS.primary);
  y -= 24;

  const weekStart = new Date(data.weekOf.includes("T") ? data.weekOf : data.weekOf + "T12:00:00Z");
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const startLabel = weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  const endLabel = weekEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  drawText(`${startLabel} - ${endLabel}`, MARGIN, y, { bold: true, size: 18 });
  y -= 32;

  // ── SCORE SUMMARY ──
  let totalScore = 0;
  for (const day of DAYS) {
    const d = data.days[day];
    if (d) totalScore += Object.values(d.territories).filter(Boolean).length;
  }

  const scorePercent = Math.round(totalScore / 35 * 100);
  page.drawRectangle({ x: MARGIN, y: y - 8, width: 220, height: 30, color: COLORS.rowAlt });
  drawText("Weekly Score", MARGIN + 8, y + 6, { bold: true, size: 12 });
  drawText(`${totalScore} / 35  (${scorePercent}%)`, MARGIN + 94, y + 6, { bold: true, size: 12, color: COLORS.primary });
  y -= 42;

  // ── COMPACT SCORECARD ──
  const trackers = enabledTrackers(settings);
  const cardHeight = 48 + TERRITORIES.length * 27 + (trackers.length ? 18 + trackers.length * 20 : 0) + 18;
  checkY(cardHeight);
  const cardTop = y;
  page.drawRectangle({
    x: MARGIN,
    y: cardTop - cardHeight,
    width: COL_W,
    height: cardHeight,
    color: rgb(0.96, 0.95, 0.99),
    borderColor: rgb(0.78, 0.76, 0.84),
    borderWidth: 0.8,
  });
  y -= 24;
  drawText("TERRITORY BREAKDOWN", MARGIN + 16, y, { bold: true, size: 10, color: COLORS.mid });
  y -= 24;

  const labelX = MARGIN + 16;
  const barX = MARGIN + 128;
  const barW = 290;
  const scoreX = PAGE_W - MARGIN - 38;
  for (let ti = 0; ti < TERRITORIES.length; ti++) {
    const territory = TERRITORIES[ti];
    const score = DAYS.filter((day) => data.days[day]?.territories[territory.key]).length;
    const color = TERRITORY_COLORS[ti];
    drawText(territory.label, labelX, y, { bold: true, size: 10, color });
    page.drawRectangle({ x: barX, y: y + 1, width: barW, height: 7, color: rgb(0.88, 0.87, 0.91) });
    if (score > 0) page.drawRectangle({ x: barX, y: y + 1, width: barW * score / 7, height: 7, color });
    drawText(`${score}/7`, scoreX, y, { size: 10 });
    y -= 27;
  }

  if (trackers.length) {
    page.drawLine({
      start: { x: MARGIN + 16, y: y + 10 },
      end: { x: PAGE_W - MARGIN - 16, y: y + 10 },
      thickness: 0.5,
      color: rgb(0.65, 0.63, 0.7),
    });
    y -= 7;
  }

  for (const tracker of trackers) {
    const values = DAYS.map((day) => Number(getTrackerValue(data.days[day] as unknown as Record<string, unknown>, tracker)));
    const result = tracker.type === "boolean"
      ? `${values.filter(Boolean).length}/7 achieved`
      : tracker.type === "rating"
        ? (() => {
            const rated = values.filter((value) => value > 0);
            return rated.length ? `${(rated.reduce((sum, value) => sum + value, 0) / rated.length).toFixed(1)}/5 average` : "no entries";
          })()
        : `${values.reduce((sum, value) => sum + value, 0)} this week`;
    page.drawCircle({ x: labelX + 3, y: y + 4, size: 2.5, color: COLORS.primary });
    drawText(tracker.label, labelX + 12, y, { size: 10 });
    const resultWidth = fontRegular.widthOfTextAtSize(result, 9);
    drawText(result, PAGE_W - MARGIN - 16 - resultWidth, y, { size: 9, color: COLORS.mid });
    y -= 20;
  }
  y = cardTop - cardHeight - 24;

  // ── WEEKLY SUMMARY ──
  checkY(50);
  drawText("Weekly Summary", MARGIN, y, { bold: true, size: 15 });
  y -= 24;

  const w = data.weekly;
  const summaryFields: [string, string | undefined][] = [
    ["Biggest Win", w.biggestWin],
    ["Wins", w.wins],
    ["Gratitude", w.gratitude],
    ["Lessons and Challenges", w.lessons],
    ["Focus Achieved", w.focusAchieved],
    ["Focus Next Week", w.focusNext],
    ["Stretch Next Week", w.stretchNext],
    ["Am I On Track?", w.onTrack],
    ["Cup Overflowing", w.cupOverflowing],
    ["Areas to Improve", w.improve],
  ];

  for (const [label, value] of summaryFields) {
    if (!value?.trim()) continue;
    const valueLines = wrapText(value, COL_W, 10);
    checkY(18 + Math.min(valueLines.length, 2) * 13);
    drawText(label, MARGIN, y, { bold: true, size: 11, color: COLORS.dark });
    y -= 15;
    for (const line of valueLines) {
      checkY(13);
      drawText(line, MARGIN, y, { size: 10 });
      y -= 13;
    }
    y -= 8;
  }

  // ── DAILY RECORD LOG ──
  const daysWithContent = DAYS.filter((day) => {
    const dayData = data.days[day];
    return dayData && (dayData.journal || dayData.reflection || dayData.gratitude || dayData.wins || dayData.wolf?.length);
  });

  if (daysWithContent.length) {
    if (doc.getPageCount() === 1) {
      newPage();
    } else {
      y -= 8;
      hline(y);
      y -= 24;
    }
    drawText("Daily Record Log", MARGIN, y, { bold: true, size: 15 });
    y -= 12;
    drawText("The detail behind the weekly summary", MARGIN, y, { size: 9, color: COLORS.mid });
    y -= 24;
  }

  for (const day of daysWithContent) {
    const d = data.days[day];
    if (!d) continue;
    const hasContent = d.journal || d.reflection || d.gratitude || d.wins || (d.wolf && d.wolf.length > 0);
    if (!hasContent) continue;

    checkY(40);
    const label = DAY_LABELS[DAYS.indexOf(day)];
    drawText(label, MARGIN, y, { bold: true, size: 11, color: COLORS.primary });
    if (d.wolf?.length) {
      const wolfW = fontBold.widthOfTextAtSize(label, 11) + 6;
      drawText(`Wolf: ${d.wolf.join(", ")}`, MARGIN + wolfW, y, { size: 10, color: COLORS.mid });
    }
    y -= 15;

    if (d.gratitude) {
      checkY(13);
      drawText("Grateful:", MARGIN + 10, y, { bold: true, size: 9, color: COLORS.mid });
      y -= 12;
      const lines = wrapText(d.gratitude, COL_W - 12, 9);
      for (const line of lines) {
        checkY(12);
        drawText(line, MARGIN + 10, y, { size: 9 });
        y -= 12;
      }
    }
    if (d.wins) {
      checkY(13);
      drawText("Wins:", MARGIN + 10, y, { bold: true, size: 9, color: COLORS.mid });
      y -= 12;
      const lines = wrapText(d.wins, COL_W - 12, 9);
      for (const line of lines) {
        checkY(12);
        drawText(line, MARGIN + 10, y, { size: 9 });
        y -= 12;
      }
    }
    if (d.journal) {
      const lines = wrapText(d.journal, COL_W - 12, 10);
      for (const line of lines) {
        checkY(13);
        drawText(line, MARGIN + 10, y, { size: 10 });
        y -= 13;
      }
    }
    if (d.reflection) {
      checkY(13);
      const reflLines = wrapText(`Better: ${d.reflection}`, COL_W - 12, 9);
      for (const line of reflLines) {
        checkY(12);
        drawText(line, MARGIN + 10, y, { italic: true, size: 9, color: COLORS.mid });
        y -= 12;
      }
    }
    y -= 8;
  }

  // ── FOOTER on each page ──
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const version = process.env.NEXT_PUBLIC_BUILD_VERSION || "dev";
    const generated = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
    const left = `COIL — coil.5am.team  ·  Page ${i + 1} of ${pages.length}`;
    const right = `${version}  ·  ${generated}`;
    p.drawText(left, {
      x: MARGIN, y: 20, font: fontRegular, size: 8, color: COLORS.mid,
    });
    const rightWidth = fontRegular.widthOfTextAtSize(right, 7);
    p.drawText(right, {
      x: p.getWidth() - MARGIN - rightWidth, y: 20, font: fontRegular, size: 7, color: COLORS.mid,
    });
  }

  return doc.save();
}

export async function generateConsolidatedReportPdf(
  weeks: WeekData[],
  period: { label: string; start: string; end: string },
  settings: TrackerSettings = DEFAULT_TRACKER_SETTINGS,
): Promise<Uint8Array> {
  if (weeks.length === 0) throw new Error("At least one week is required");

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fs.readFileSync(fontPath("LiberationSans-Regular.ttf")));
  const bold = await doc.embedFont(fs.readFileSync(fontPath("LiberationSans-Bold.ttf")));
  const cover = doc.addPage([595, 842]);
  const margin = 54;

  cover.drawText("COIL", { x: margin, y: 742, font: bold, size: 32, color: COLORS.primary });
  cover.drawText("Consolidated Review", { x: margin, y: 694, font: bold, size: 24, color: COLORS.dark });
  cover.drawText(period.label, { x: margin, y: 655, font: regular, size: 17, color: COLORS.mid });
  cover.drawLine({
    start: { x: margin, y: 628 },
    end: { x: 595 - margin, y: 628 },
    thickness: 1,
    color: COLORS.primary,
  });

  const formatDate = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
  cover.drawText(`${weeks.length} weekly report${weeks.length === 1 ? "" : "s"}`, {
    x: margin, y: 586, font: bold, size: 14, color: COLORS.dark,
  });
  cover.drawText(`${formatDate(period.start)} - ${formatDate(period.end)}`, {
    x: margin, y: 558, font: regular, size: 11, color: COLORS.mid,
  });
  cover.drawText("Reports are ordered chronologically, oldest first.", {
    x: margin, y: 520, font: regular, size: 10, color: COLORS.mid,
  });

  for (const week of weeks) {
    const weeklyPdf = await PDFDocument.load(await generateReportPdf(week, settings));
    const pages = await doc.copyPages(weeklyPdf, weeklyPdf.getPageIndices());
    pages.forEach((page) => doc.addPage(page));
  }

  const generated = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  cover.drawText(`COIL - coil.5am.team  |  Generated ${generated}`, {
    x: margin, y: 24, font: regular, size: 8, color: COLORS.mid,
  });

  return doc.save();
}

export async function generateMonthlyReviewPdf(input: {
  label: string;
  evidence: MonthlyEvidence;
  review: ReviewData;
  goals: CycleData | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fs.readFileSync(fontPath("LiberationSans-Regular.ttf")));
  const bold = await doc.embedFont(fs.readFileSync(fontPath("LiberationSans-Bold.ttf")));
  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 48;
  const WIDTH = PAGE_W - MARGIN * 2;
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const addPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  const ensure = (height: number) => { if (y - height < 42) addPage(); };
  const wrap = (value: string, maxWidth = WIDTH, size = 10): string[] => {
    const paragraphs = value.replace(/\r/g, "").split("\n");
    const lines: string[] = [];
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(""); continue; }
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (regular.widthOfTextAtSize(candidate, size) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      if (line) lines.push(line);
    }
    return lines;
  };
  const text = (value: string, opts: { size?: number; isBold?: boolean; color?: RGB; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    const lines = wrap(value, WIDTH, size);
    ensure(Math.max(1, lines.length) * (size + 3));
    for (const line of lines) {
      if (line) page.drawText(line, { x: MARGIN, y, font: opts.isBold ? bold : regular, size, color: opts.color ?? COLORS.dark });
      y -= size + 3;
    }
    y -= opts.gap ?? 3;
  };
  const answerKeepHeight = (prompt: string, value: string) => monthlyPdfAnswerKeepTogetherHeight(
    wrap(prompt, WIDTH, 10).length,
    wrap(value.trim() || "—", WIDTH, 10).length,
  );
  const section = (title: string, followingHeight = 0) => {
    ensure(51 + followingHeight);
    y -= 7;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.7, color: COLORS.light });
    y -= 19;
    text(title, { size: 14, isBold: true, color: COLORS.primary, gap: 8 });
  };
  const answer = (prompt: string, value: string) => {
    ensure(answerKeepHeight(prompt, value));
    text(prompt, { size: 10, isBold: true, gap: 2 });
    text(value.trim() || "—", { size: 10, color: value.trim() ? COLORS.dark : COLORS.mid, gap: 10 });
  };

  text("COIL", { size: 28, isBold: true, color: COLORS.primary, gap: 8 });
  text(`Monthly Review — ${input.label}`, { size: 18, isBold: true, gap: 4 });
  text(`${input.evidence.trackedDays}/${input.evidence.elapsedDays} days with recorded activity`, { size: 10, color: COLORS.mid, gap: 14 });
  page.drawRectangle({ x: MARGIN, y: y - 4, width: 190, height: 30, color: COLORS.rowAlt });
  page.drawText(`Execution: ${input.evidence.score}/${input.evidence.possible}`, { x: MARGIN + 9, y: y + 6, font: bold, size: 12, color: COLORS.primary });
  y -= 42;

  section("Evidence by territory");
  for (const key of TERRITORY_KEYS) {
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    text(`${label}: ${input.evidence.territoryTotals[key]}/${input.evidence.elapsedDays} days | Commitments ${input.evidence.commitmentsCompleted[key]}/${input.evidence.commitmentsPlanned[key]}`, { size: 10, gap: 2 });
  }
  text(`Basics: ARS ${input.evidence.basics.ars} | Alpha Decompression ${input.evidence.basics.ad} | CFO ${input.evidence.basics.cfo}`, { size: 10, gap: 4 });
  for (const tracker of input.evidence.trackers) text(`${tracker.label}: ${tracker.summary}`, { size: 10, gap: 1 });

  section("Weekly trend");
  if (!input.evidence.weeklyTrend.length) text("No tracked weeks.", { color: COLORS.mid });
  for (const week of input.evidence.weeklyTrend) text(`Week of ${week.startsOn}: ${week.score}/${week.possible} across ${week.trackedDays} tracked days`, { size: 10, gap: 2 });

  section("Goals context");
  if (!input.goals) {
    text("No goals were set for this month. This review is based on actual evidence and reflection.", { color: COLORS.mid });
  } else {
    answer("Must-win", input.goals.mustWin);
    for (const key of TERRITORY_KEYS) {
      const territory = input.goals.territories[key];
      if (territory.outcome || territory.keystoneHabit) answer(`${key} — outcome / keystone habit`, `${territory.outcome || "—"} / ${territory.keystoneHabit || "—"}`);
    }
  }

  const firstReviewPrompt = MONTHLY_REVIEW_PROMPTS[0];
  section("Monthly Review", firstReviewPrompt ? answerKeepHeight(firstReviewPrompt[1], input.review.responses[firstReviewPrompt[0]] ?? "") : 0);
  for (const [key, prompt] of MONTHLY_REVIEW_PROMPTS) answer(prompt, input.review.responses[key] ?? "");

  const firstRecordedItem = input.evidence.wins[0] ?? input.evidence.reflections[0];
  section("Recorded wins and reflections", firstRecordedItem ? answerKeepHeight(`Entry — ${firstRecordedItem.date}`, firstRecordedItem.text) : 16);
  if (!input.evidence.wins.length && !input.evidence.reflections.length) text("No journal evidence recorded.", { color: COLORS.mid });
  for (const item of input.evidence.wins) answer(`Win — ${item.date}`, item.text);
  for (const item of input.evidence.reflections) answer(`Reflection — ${item.date}`, item.text);

  if (input.review.plan) {
    const firstPlanPrompt = MONTHLY_PLAN_PROMPTS[0];
    section(`Monthly Plan — ${monthRange(input.review.plan.targetMonth).label}`, firstPlanPrompt ? answerKeepHeight(firstPlanPrompt[1], input.review.plan.responses[firstPlanPrompt[0]] ?? "") : 0);
    for (const [key, prompt] of MONTHLY_PLAN_PROMPTS) answer(prompt, input.review.plan.responses[key] ?? "");
    const firstTerritory = input.review.plan.territories[TERRITORY_KEYS[0]];
    section("Territory plan", answerKeepHeight(`${TERRITORY_KEYS[0]} — outcome / keystone habit`, `${firstTerritory.outcome || "—"} / ${firstTerritory.keystoneHabit || "—"}`));
    for (const key of TERRITORY_KEYS) {
      const territory = input.review.plan.territories[key];
      answer(`${key} — outcome / keystone habit`, `${territory.outcome || "—"} / ${territory.keystoneHabit || "—"}`);
    }
  }

  const pages = doc.getPages();
  const generated = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  pages.forEach((pdfPage, index) => {
    pdfPage.drawText(`COIL — ${input.label}  ·  Page ${index + 1} of ${pages.length}`, { x: MARGIN, y: 20, font: regular, size: 8, color: COLORS.mid });
    const right = generated;
    pdfPage.drawText(right, { x: PAGE_W - MARGIN - regular.widthOfTextAtSize(right, 7), y: 20, font: regular, size: 7, color: COLORS.mid });
  });
  return doc.save();
}
