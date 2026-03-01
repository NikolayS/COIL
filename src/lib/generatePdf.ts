// PDF report generator using pdf-lib + embedded Liberation Sans fonts
// Returns a Buffer containing the PDF bytes

import { PDFDocument, rgb, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import type { WeekData } from "./report";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TERRITORIES = [
  { key: "self" as const, label: "Self" },
  { key: "health" as const, label: "Health" },
  { key: "relationships" as const, label: "Relationships" },
  { key: "wealth" as const, label: "Wealth" },
  { key: "business" as const, label: "Business" },
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

export async function generateReportPdf(data: WeekData): Promise<Uint8Array> {
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
    const words = str.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (fontRegular.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // ── HEADER ──
  drawText("COIL", MARGIN, y, { bold: true, size: 26, color: COLORS.primary });
  y -= 30;
  drawText("Daily Territory Tracker & Journal", MARGIN, y, { size: 10, color: COLORS.mid });
  y -= 18;
  hline(y, COLORS.primary);
  y -= 16;

  const weekDate = new Date(data.weekOf + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  drawText(`Weekly Report — Week of ${weekDate}`, MARGIN, y, { bold: true, size: 16 });
  y -= 32;

  // ── SCORE SUMMARY ──
  let totalScore = 0;
  for (const day of DAYS) {
    const d = data.days[day];
    if (d) totalScore += Object.values(d.territories).filter(Boolean).length;
  }

  page.drawRectangle({ x: MARGIN, y: y - 8, width: 160, height: 30, color: COLORS.rowAlt });
  drawText("Weekly Score:", MARGIN + 8, y + 6, { bold: true, size: 12 });
  drawText(`${totalScore} / 35`, MARGIN + 102, y + 6, { bold: true, size: 12, color: COLORS.primary });
  y -= 42;

  // ── TERRITORY TABLE ──
  checkY(120);
  drawText("Daily Territory Scores", MARGIN, y, { bold: true, size: 12 });
  y -= 16;

  const COL_TERRITORY = 108;
  const COL_DAY = 32;
  const COL_TOTAL = 42;
  const ROW_H = 17;

  function drawTableHeader() {
    page.drawRectangle({ x: MARGIN, y: y - 4, width: COL_W, height: ROW_H, color: COLORS.primary });
    let x = MARGIN + 4;
    const headers = ["Territory", ...DAY_LABELS, "Total"];
    const widths = [COL_TERRITORY, ...Array(7).fill(COL_DAY), COL_TOTAL];
    for (let i = 0; i < headers.length; i++) {
      page.drawText(headers[i], { x, y: y + 2, font: fontBold, size: 9, color: COLORS.white });
      x += widths[i];
    }
    y -= ROW_H;
  }

  drawTableHeader();

  for (let ti = 0; ti < TERRITORIES.length; ti++) {
    const t = TERRITORIES[ti];
    const bg = ti % 2 === 0 ? COLORS.rowAlt : COLORS.white;
    page.drawRectangle({ x: MARGIN, y: y - 4, width: COL_W, height: ROW_H, color: bg });
    let x = MARGIN + 4;
    const widths = [COL_TERRITORY, ...Array(7).fill(COL_DAY), COL_TOTAL];
    const cells = [
      t.label,
      ...DAYS.map((d) => (data.days[d]?.territories[t.key] ? "Y" : "-")),
      `${DAYS.filter((d) => data.days[d]?.territories[t.key]).length}/7`,
    ];
    for (let i = 0; i < cells.length; i++) {
      const isY = cells[i] === "Y";
      page.drawText(cells[i], {
        x, y: y + 2,
        font: isY ? fontBold : fontRegular,
        size: 9,
        color: isY ? COLORS.green : COLORS.dark,
      });
      x += widths[i];
    }
    y -= ROW_H;
  }

  // Totals row
  const dayTotals = DAYS.map((d) =>
    Object.values(data.days[d]?.territories ?? {}).filter(Boolean).length
  );
  page.drawRectangle({ x: MARGIN, y: y - 4, width: COL_W, height: ROW_H, color: rgb(0.88, 0.88, 0.88) });
  {
    let x = MARGIN + 4;
    const widths = [COL_TERRITORY, ...Array(7).fill(COL_DAY), COL_TOTAL];
    const cells = ["Total", ...dayTotals.map(String), `${totalScore}/35`];
    for (let i = 0; i < cells.length; i++) {
      page.drawText(cells[i], { x, y: y + 2, font: fontBold, size: 9, color: COLORS.dark });
      x += widths[i];
    }
  }
  y -= ROW_H + 20;

  // ── DRINKS ──
  checkY(60);
  drawText("Drinks", MARGIN, y, { bold: true, size: 12 });
  y -= 16;

  const drinkColW = COL_W / 8;
  page.drawRectangle({ x: MARGIN, y: y - 4, width: COL_W, height: ROW_H, color: COLORS.primary });
  {
    let x = MARGIN + 4;
    for (const lbl of [...DAY_LABELS, "Total"]) {
      page.drawText(lbl, { x, y: y + 2, font: fontBold, size: 9, color: COLORS.white });
      x += drinkColW;
    }
  }
  y -= ROW_H;

  const drinkVals = DAYS.map((d) => data.days[d]?.drinks ?? 0);
  const totalDrinks = drinkVals.reduce((a, b) => a + b, 0);
  page.drawRectangle({ x: MARGIN, y: y - 4, width: COL_W, height: ROW_H, color: COLORS.rowAlt });
  {
    let x = MARGIN + 4;
    for (const v of [...drinkVals.map(String), String(totalDrinks)]) {
      page.drawText(v, { x, y: y + 2, font: fontRegular, size: 9, color: COLORS.dark });
      x += drinkColW;
    }
  }
  y -= ROW_H + 24;

  // ── DAILY JOURNAL ──
  checkY(40);
  hline(y + 6);
  y -= 4;
  drawText("Daily Journal", MARGIN, y, { bold: true, size: 12 });
  y -= 20;

  for (const day of DAYS) {
    const d = data.days[day];
    if (!d) continue;
    const hasContent = d.journal || d.reflection || (d.wolf && d.wolf.length > 0);
    if (!hasContent) continue;

    checkY(40);
    const label = DAY_LABELS[DAYS.indexOf(day)];
    drawText(label, MARGIN, y, { bold: true, size: 11, color: COLORS.primary });
    if (d.wolf?.length) {
      const wolfW = fontBold.widthOfTextAtSize(label, 11) + 6;
      drawText(`Wolf: ${d.wolf.join(", ")}`, MARGIN + wolfW, y, { size: 10, color: COLORS.mid });
    }
    y -= 15;

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
        drawText(line, MARGIN + 10, y, { italic: true, size: 9, color: COLORS.mid });
        y -= 12;
      }
    }
    y -= 8;
  }

  // ── WEEKLY REFLECTION ──
  checkY(50);
  y -= 4;
  hline(y + 6);
  y -= 4;
  drawText("Weekly Reflection", MARGIN, y, { bold: true, size: 12 });
  y -= 20;

  const w = data.weekly;
  const reflFields: [string, string | undefined][] = [
    ["Wins", w.wins],
    ["Gratitude", w.gratitude],
    ["Lessons", w.lessons],
    ["Focus achieved", w.focusAchieved],
    ["Focus next week", w.focusNext],
    ["Stretch next week", w.stretchNext],
    ["On track", w.onTrack],
    ["Cup overflowing", w.cupOverflowing],
    ["Areas to improve", w.improve],
  ];

  for (const [label, val] of reflFields) {
    if (!val?.trim()) continue;
    checkY(28);
    const labelStr = `${label}: `;
    const labelW = fontBold.widthOfTextAtSize(labelStr, 10);
    const valueLines = wrapText(val, COL_W - labelW - 4, 10);

    drawText(labelStr, MARGIN, y, { bold: true, size: 10 });
    if (valueLines.length > 0) {
      drawText(valueLines[0], MARGIN + labelW, y, { size: 10 });
      y -= 13;
      for (let li = 1; li < valueLines.length; li++) {
        checkY(13);
        drawText(valueLines[li], MARGIN + 10, y, { size: 10 });
        y -= 13;
      }
    } else {
      y -= 13;
    }
    y -= 4;
  }

  // ── FOOTER on each page ──
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    p.drawText(`COIL — coil.5am.team  ·  Page ${i + 1} of ${pages.length}`, {
      x: MARGIN, y: 20, font: fontRegular, size: 8, color: COLORS.mid,
    });
  }

  return doc.save();
}
