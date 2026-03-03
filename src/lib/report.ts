// Shared report generation — used by both client (page.tsx) and server (cron API route)

type TerritoryKey = "self" | "health" | "relationships" | "wealth" | "business";

interface DayData {
  territories: Record<TerritoryKey, boolean>;
  wolf: string[];
  drinks: number;
  gratitude: string;
  wins: string;
  journal: string;
  reflection: string;
}

export interface WeekData {
  weekOf: string;
  days: Record<string, DayData>;
  weekly: {
    wins: string;
    gratitude: string;
    biggestWin: string;
    lessons: string;
    focusAchieved: string;
    focusNext: string;
    stretchNext: string;
    onTrack: string;
    cupOverflowing: string;
    improve: string;
  };
}

const TERRITORIES: { key: TerritoryKey; label: string }[] = [
  { key: "self", label: "Self" },
  { key: "health", label: "Health" },
  { key: "relationships", label: "Relationships" },
  { key: "wealth", label: "Wealth" },
  { key: "business", label: "Business" },
];

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

const TOTAL_POSSIBLE = 35;

function formatWeekOf(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const WEEKLY_FIELDS: [keyof WeekData["weekly"], string][] = [
  ["biggestWin",    "Biggest Win"],
  ["wins",          "Other Wins"],
  ["gratitude",     "Gratitude"],
  ["lessons",       "Lessons"],
  ["focusAchieved", "Focus achieved"],
  ["focusNext",     "Focus next week"],
  ["stretchNext",   "Stretch"],
  ["onTrack",       "On track"],
  ["cupOverflowing","Cup overflowing"],
  ["improve",       "Improve"],
];

function weeklyLines(w: WeekData["weekly"]): string[] {
  return WEEKLY_FIELDS.map(([key, label]) => `${label}: ${w[key] || "—"}`);
}

function calcScore(data: WeekData): number {
  let score = 0;
  for (const day of DAYS) {
    const d = data.days[day];
    if (d) score += Object.values(d.territories).filter(Boolean).length;
  }
  return score;
}

function calcTerritoryScore(data: WeekData, key: TerritoryKey): number {
  return DAYS.filter((d) => data.days[d]?.territories[key]).length;
}

function calcWeekDrinks(data: WeekData): number {
  return DAYS.reduce((sum, d) => sum + (data.days[d]?.drinks ?? 0), 0);
}

export function generatePlainReport(data: WeekData): string {
  const weekOf = new Date(data.weekOf);
  const score = calcScore(data);
  // TPM treats every \n as a paragraph gap. Entire report = one block of text.
  // Days separated by " // ", fields within a day by " | ".
  const allParts: string[] = [];

  // Header + territories
  const terrParts = TERRITORIES.map(t => {
    const s = calcTerritoryScore(data, t.key);
    const dots = DAYS.map(d => data.days[d]?.territories[t.key] ? "Y" : "-").join("");
    return `${t.label} ${dots} ${s}/7`;
  });
  const totalDrinks = calcWeekDrinks(data);
  const drinkStr = totalDrinks > 0 ? ` | Drinks: ${totalDrinks}` : "";
  allParts.push(`COIL — Week of ${formatWeekOf(weekOf)} | Score: ${score}/${TOTAL_POSSIBLE} | ${terrParts.join(" | ")}${drinkStr}`);

  // Daily entries separated by " // "
  const dayParts: string[] = [];
  for (const day of DAYS) {
    const d = data.days[day];
    if (!d) continue;
    const hasContent = d.gratitude || d.wins || d.journal || d.reflection || d.wolf?.length;
    if (!hasContent) continue;
    const parts: string[] = [];
    const wolf = d.wolf?.length ? ` (Wolf: ${d.wolf.join(", ")})` : "";
    parts.push(`${DAY_LABELS[day]}${wolf}`);
    if (d.gratitude) parts.push(`Grateful: ${d.gratitude}`);
    if (d.wins) parts.push(`Wins: ${d.wins}`);
    if (d.journal) parts.push(d.journal);
    if (d.reflection) parts.push(`Better: ${d.reflection}`);
    dayParts.push(parts.join("\n"));
  }
  if (dayParts.length) allParts.push(dayParts.join("\n\n"));

  // Weekly reflection
  allParts.push(weeklyLines(data.weekly).join("\n"));

  return allParts.join("\n\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Bold the "Key: value" label in HTML output
function boldKey(s: string): string {
  return esc(s).replace(/^([^:]+:)/, "<strong>$1</strong>");
}

// Returns both plain text and HTML (with <br> for soft line breaks).
// Tiptap/ProseMirror treats pasted <br> as Shift+Enter — no paragraph gaps.
export function generatePlainReportHtml(data: WeekData): { plain: string; html: string } {
  const weekOf = new Date(data.weekOf);
  const score = calcScore(data);
  const lines: string[] = [];

  // Header line
  lines.push(`COIL — Week of ${formatWeekOf(weekOf)} | Score: ${score}/${TOTAL_POSSIBLE}`);
  // Territory lines — one per territory
  const totalDrinks = calcWeekDrinks(data);
  for (const t of TERRITORIES) {
    const s = calcTerritoryScore(data, t.key);
    const dots = DAYS.map(d => data.days[d]?.territories[t.key] ? "Y" : "-").join(" ");
    lines.push(`${t.label.padEnd(14)} ${dots}  ${s}/7`);
  }
  if (totalDrinks > 0) lines.push(`Drinks: ${totalDrinks}`);

  // Daily entries — one line per day
  const dailyHtmlLines: string[] = []; // separate html for day entries (uses <h3>)
  for (const day of DAYS) {
    const d = data.days[day];
    if (!d) continue;
    const hasContent = d.gratitude || d.wins || d.journal || d.reflection || d.wolf?.length;
    if (!hasContent) continue;
    const wolf = d.wolf?.length ? ` · Wolf: ${d.wolf.join(", ")}` : "";
    const plainParts: string[] = [];
    const htmlFieldLines: string[] = [];
    plainParts.push(`${DAY_LABELS[day]}${wolf}`);
    if (d.gratitude) { plainParts.push(`Grateful: ${d.gratitude}`); htmlFieldLines.push(`<strong>Grateful:</strong> ${esc(d.gratitude)}`); }
    if (d.wins) { plainParts.push(`Wins: ${d.wins}`); htmlFieldLines.push(`<strong>Wins:</strong> ${esc(d.wins)}`); }
    if (d.journal) { plainParts.push(d.journal); htmlFieldLines.push(esc(d.journal)); }
    if (d.reflection) { plainParts.push(`Better: ${d.reflection}`); htmlFieldLines.push(`<strong>Better:</strong> ${esc(d.reflection)}`); }
    lines.push(plainParts.join("  "));
    const dayHeading = `<h3>${esc(DAY_LABELS[day])}${esc(wolf)}</h3>`;
    dailyHtmlLines.push(dayHeading + (htmlFieldLines.length ? htmlFieldLines.join("<br>") : ""));
  }

  // Weekly reflection
  const reflParts = weeklyLines(data.weekly);
  lines.push(reflParts.join("\n"));

  const numTerrLines = TERRITORIES.length + (totalDrinks > 0 ? 1 : 0) + 1;
  const headerLines = lines.slice(0, numTerrLines);

  const plain = lines.join("\n");
  const htmlParts: string[] = [`<p>${headerLines.map(boldKey).join("<br>")}</p>`];
  if (dailyHtmlLines.length) htmlParts.push(dailyHtmlLines.join(""));
  if (reflParts.length) {
    const weeklyHtml = `<h2>Weekly Reflection</h2>` + reflParts.map(p => `<p>${boldKey(p)}</p>`).join("");

    htmlParts.push(weeklyHtml);
  }
  const html = htmlParts.join("");
  return { plain, html };
}

export function generateEmailHtml(data: WeekData): string {
  const weekOf = new Date(data.weekOf);
  const score = calcScore(data);
  const totalDrinks = calcWeekDrinks(data);
  const w = data.weekly;

  const style = {
    body: `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 32px 24px;`,
    h1: `font-size: 28px; font-weight: 700; color: #b8860b; margin: 0 0 4px 0;`,
    subtitle: `font-size: 13px; color: #888; margin: 0 0 24px 0;`,
    section: `margin: 24px 0;`,
    h2: `font-size: 13px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #888; margin: 0 0 10px 0; border-bottom: 1px solid #eee; padding-bottom: 6px;`,
    h3: `font-size: 15px; font-weight: 600; color: #1a1a1a; margin: 16px 0 4px 0;`,
    table: `width: 100%; border-collapse: collapse; font-size: 13px;`,
    th: `padding: 6px 8px; background: #b8860b; color: #fff; text-align: center; font-weight: 600;`,
    thLeft: `padding: 6px 8px; background: #b8860b; color: #fff; text-align: left; font-weight: 600;`,
    td: `padding: 5px 8px; border-bottom: 1px solid #f0f0f0; text-align: center;`,
    tdLeft: `padding: 5px 8px; border-bottom: 1px solid #f0f0f0; text-align: left;`,
    tdBold: `padding: 5px 8px; border-bottom: 1px solid #f0f0f0; text-align: center; font-weight: 700;`,
    label: `font-weight: 600; color: #555; min-width: 140px; display: inline-block;`,
    value: `color: #1a1a1a;`,
    score: `font-size: 32px; font-weight: 700; color: #b8860b;`,
  };

  // Territory table
  const terrRows = TERRITORIES.map(t => {
    const cells = DAYS.map(d => {
      const hit = data.days[d]?.territories[t.key];
      return `<td style="${style.td}">${hit ? `<span style="color:#4a9e6b;font-weight:700">Y</span>` : `<span style="color:#ccc">-</span>`}</td>`;
    }).join("");
    const total = calcTerritoryScore(data, t.key);
    return `<tr><td style="${style.tdLeft}">${esc(t.label)}</td>${cells}<td style="${style.tdBold}">${total}/7</td></tr>`;
  }).join("");
  const totals = DAYS.map(d => Object.values(data.days[d]?.territories ?? {}).filter(Boolean).length);
  const totalRow = `<tr style="background:#f9f9f9"><td style="${style.tdLeft}"><strong>Total</strong></td>${totals.map(n => `<td style="${style.tdBold}">${n}</td>`).join("")}<td style="${style.tdBold}">${score}/${TOTAL_POSSIBLE}</td></tr>`;

  // Daily journal
  const dayHtml = DAYS.map(day => {
    const d = data.days[day];
    if (!d) return "";
    const hasContent = d.gratitude || d.wins || d.journal || d.reflection || d.wolf?.length;
    if (!hasContent) return "";
    const wolf = d.wolf?.length ? ` <span style="color:#888;font-size:13px">· Wolf: ${esc(d.wolf.join(", "))}</span>` : "";
    const fields = [
      d.gratitude ? `<div><span style="${style.label}">Grateful:</span> <span style="${style.value}">${esc(d.gratitude)}</span></div>` : "",
      d.wins ? `<div><span style="${style.label}">Wins:</span> <span style="${style.value}">${esc(d.wins)}</span></div>` : "",
      d.journal ? `<div style="color:#333;margin:4px 0">${esc(d.journal)}</div>` : "",
      d.reflection ? `<div><span style="${style.label}">Better:</span> <span style="${style.value}">${esc(d.reflection)}</span></div>` : "",
    ].filter(Boolean).join("");
    return `<div style="margin-bottom:12px"><div style="${style.h3}">${DAY_LABELS[day]}${wolf}</div>${fields}</div>`;
  }).join("");

  // Weekly reflection — always show all fields
  const reflHtml = WEEKLY_FIELDS.map(([key, label]) => {
    const v = w[key] || "—";
    return `<div style="margin-bottom:6px"><span style="${style.label}">${esc(label)}:</span> <span style="${style.value}">${esc(v)}</span></div>`;
  }).join("");

  return `<div style="${style.body}">
  <h1 style="${style.h1}">COIL</h1>
  <p style="${style.subtitle}">Weekly Report — Week of ${esc(formatWeekOf(weekOf))}</p>
  <div style="margin-bottom:24px"><span style="${style.score}">${score}</span><span style="color:#888;font-size:18px"> / ${TOTAL_POSSIBLE}</span></div>

  <div style="${style.section}">
    <h2 style="${style.h2}">Territories</h2>
    <table style="${style.table}">
      <tr><th style="${style.thLeft}">Territory</th>${DAYS.map(d => `<th style="${style.th}">${DAY_LABELS[d]}</th>`).join("")}<th style="${style.th}">Total</th></tr>
      ${terrRows}${totalRow}
    </table>
    ${totalDrinks > 0 ? `<p style="margin:8px 0 0;font-size:13px;color:#888">Drinks this week: ${totalDrinks}</p>` : ""}
  </div>

  ${dayHtml ? `<div style="${style.section}"><h2 style="${style.h2}">Daily Journal</h2>${dayHtml}</div>` : ""}

  ${reflHtml ? `<div style="${style.section}"><h2 style="${style.h2}">Weekly Reflection</h2>${reflHtml}</div>` : ""}
</div>`;
}

export function generateReport(data: WeekData): string {
  const weekOf = new Date(data.weekOf);
  const score = calcScore(data);
  const lines: string[] = [
    `## Weekly Score: ${score}/${TOTAL_POSSIBLE}`,
    ``,
    `## Daily Scores`,
    `| Territory | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total |`,
    `|-----------|-----|-----|-----|-----|-----|-----|-----|-------|`,
  ];
  for (const t of TERRITORIES) {
    const row = DAYS.map((d) => (data.days[d]?.territories[t.key] ? "✅" : "⬜")).join(" | ");
    const total = calcTerritoryScore(data, t.key);
    lines.push(`| ${t.label.padEnd(9)} | ${row} | ${total}/7 |`);
  }
  const totals = DAYS.map((d) => Object.values(data.days[d]?.territories ?? {}).filter(Boolean).length);
  lines.push(`| **Total** | ${totals.join(" | ")} | **${score}/${TOTAL_POSSIBLE}** |`);
  lines.push(``);
  lines.push(`## Alcohol Tracking`);
  const drinkRow = DAYS.map((d) => data.days[d]?.drinks ?? 0).join(" | ");
  lines.push(`| Mon | Tue | Wed | Thu | Fri | Sat | Sun | Weekly Total |`);
  lines.push(`|-----|-----|-----|-----|-----|-----|-----|--------------|`);
  lines.push(`| ${drinkRow} | **${calcWeekDrinks(data)}** |`);
  lines.push(``);
  lines.push(`## Daily Journal`);
  lines.push(``);
  for (const day of DAYS) {
    const d = data.days[day];
    if (!d) continue;
    lines.push(`### ${DAY_LABELS[day]}`);
    if (d.wolf?.length) lines.push(`**Wolf:** ${d.wolf.join(", ")}`);
    lines.push(`**Drinks:** ${d.drinks ?? 0}`);
    if (d.gratitude) lines.push(`**Grateful:** ${d.gratitude}`);
    if (d.wins) lines.push(`**Wins:** ${d.wins}`);
    if (d.journal) lines.push(`**Notes:** ${d.journal}`);
    if (d.reflection) lines.push(`**Could do better:** ${d.reflection}`);
    lines.push(``);
  }
  lines.push(`## Weekly Reflection`);
  lines.push(``);
  lines.push(...weeklyLines(data.weekly));
  return lines.join("\n");
}
