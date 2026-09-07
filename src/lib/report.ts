import { calendarDateObject } from "./week-date";
// Shared report generation — used by both client (page.tsx) and server (cron API route)

import { enabledTrackers, getTrackerValue, trackerValueLabel, DEFAULT_TRACKER_SETTINGS, type TrackerDefinition, type TrackerSettings, type TrackerValue } from "./tracking";

type TerritoryKey = "self" | "health" | "relationships" | "wealth" | "business";

interface DayData {
  territories: Record<TerritoryKey, boolean>;
  wolf: string[];
  drinks: number;
  bagels?: number;
  steps10k?: boolean;
  coldPlunge?: boolean;
  fasting?: boolean;
  trackers?: Record<string, TrackerValue>;
  gratitude: string;
  wins: string;
  journal: string;
  reflection: string;
  commitments?: Partial<Record<TerritoryKey, string>>;
  basics?: {
    ars?: boolean;
    ad?: boolean;
    workout?: boolean;
    cfo?: boolean;
  };
  tomorrowPriority?: string;
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
    priorities?: Partial<Record<TerritoryKey, string>>;
    criticalActions?: string[];
  };
}

const TERRITORIES: { key: TerritoryKey; label: string }[] = [
  { key: "self", label: "Self" },
  { key: "health", label: "Health" },
  { key: "wealth", label: "Wealth" },
  { key: "relationships", label: "Relationships" },
  { key: "business", label: "Business" },
];

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

const TOTAL_POSSIBLE = 35;

function formatWeekOf(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const WEEKLY_FIELDS: [keyof WeekData["weekly"], string][] = [
  ["biggestWin",    "Biggest Win"],
  ["wins",          "Other Wins"],
  ["gratitude",     "Gratitude"],
  ["lessons",       "Lessons and Challenges"],
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

function weeklyPlanLines(w: WeekData["weekly"]): string[] {
  const priorities = TERRITORIES.flatMap((territory) => {
    const priority = w.priorities?.[territory.key]?.trim();
    return priority ? [`${territory.label}: ${priority}`] : [];
  });
  const criticalActions = w.criticalActions?.map((action) => action.trim()).filter(Boolean) ?? [];
  if (criticalActions.length) priorities.push(`Critical actions: ${criticalActions.join("; ")}`);
  return priorities;
}

function dailyCommitmentLines(day: DayData): string[] {
  return TERRITORIES.flatMap((territory) => {
    const commitment = day.commitments?.[territory.key]?.trim();
    return commitment ? [`${territory.label} commitment: ${commitment}`] : [];
  });
}

function completedBasics(day: DayData): string[] {
  const labels: [keyof NonNullable<DayData["basics"]>, string][] = [
    ["ars", "ARS"],
    ["ad", "AD"],
    ["workout", "Workout"],
    ["cfo", "Be the CFO"],
  ];
  return labels.flatMap(([key, label]) => day.basics?.[key] ? [label] : []);
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

function trackerValues(data: WeekData, tracker: TrackerDefinition): TrackerValue[] {
  return DAYS.map((day) => getTrackerValue(data.days[day] as unknown as Record<string, unknown>, tracker));
}

function trackerSummary(data: WeekData, tracker: TrackerDefinition): string {
  const values = trackerValues(data, tracker);
  if (tracker.type === "boolean") return `${values.filter(Boolean).length}/7`;
  if (tracker.type === "rating") {
    const rated = values.map(Number).filter((value) => value > 0);
    return rated.length ? `${(rated.reduce((sum, value) => sum + value, 0) / rated.length).toFixed(1)}/5 avg` : "—";
  }
  const total = values.reduce<number>((sum, value) => sum + Number(value), 0);
  return `${total}${tracker.unit ? ` ${tracker.unit}` : ""}`;
}

export function generatePlainReport(data: WeekData, settings: TrackerSettings = DEFAULT_TRACKER_SETTINGS): string {
  const weekOf = calendarDateObject(data.weekOf);
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
  const trackerParts = enabledTrackers(settings).map((tracker) => `${tracker.emoji} ${tracker.label}: ${trackerSummary(data, tracker)}`);
  allParts.push(`COIL — Week of ${formatWeekOf(weekOf)} | Score: ${score}/${TOTAL_POSSIBLE} | ${[...terrParts, ...trackerParts].join(" | ")}`);

  // Daily entries separated by " // "
  const dayParts: string[] = [];
  for (const day of DAYS) {
    const d = data.days[day];
    if (!d) continue;
    const hasContent = d.gratitude || d.wins || d.journal || d.reflection || d.wolf?.length ||
      dailyCommitmentLines(d).length || completedBasics(d).length || d.tomorrowPriority;
    if (!hasContent) continue;
    const parts: string[] = [];
    const wolf = d.wolf?.length ? ` (Wolf: ${d.wolf.join(", ")})` : "";
    parts.push(`${DAY_LABELS[day]}${wolf}`);
    parts.push(...dailyCommitmentLines(d));
    const basics = completedBasics(d);
    if (basics.length) parts.push(`Basics: ${basics.join(", ")}`);
    if (d.gratitude) parts.push(`Grateful: ${d.gratitude}`);
    if (d.wins) parts.push(`Wins: ${d.wins}`);
    if (d.journal) parts.push(d.journal);
    if (d.reflection) parts.push(`Better: ${d.reflection}`);
    if (d.tomorrowPriority) parts.push(`Tomorrow's #1: ${d.tomorrowPriority}`);
    dayParts.push(parts.join("\n"));
  }
  if (dayParts.length) allParts.push(dayParts.join("\n\n"));

  const planLines = weeklyPlanLines(data.weekly);
  if (planLines.length) allParts.push(planLines.join("\n"));

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
export function generatePlainReportHtml(data: WeekData, settings: TrackerSettings = DEFAULT_TRACKER_SETTINGS): { plain: string; html: string } {
  const weekOf = calendarDateObject(data.weekOf);
  const score = calcScore(data);
  const lines: string[] = [];

  // Header line
  lines.push(`COIL — Week of ${formatWeekOf(weekOf)} | Score: ${score}/${TOTAL_POSSIBLE}`);
  // Territory lines — one per territory
  for (const t of TERRITORIES) {
    const s = calcTerritoryScore(data, t.key);
    const dots = DAYS.map(d => data.days[d]?.territories[t.key] ? "Y" : "-").join(" ");
    lines.push(`${t.label.padEnd(14)} ${dots}  ${s}/7`);
  }
  for (const tracker of enabledTrackers(settings)) {
    lines.push(`${tracker.emoji} ${tracker.label}: ${trackerSummary(data, tracker)}`);
  }

  // Daily entries — one line per day
  const dailyHtmlLines: string[] = []; // separate html for day entries (uses <h3>)
  for (const day of DAYS) {
    const d = data.days[day];
    if (!d) continue;
    const hasContent = d.gratitude || d.wins || d.journal || d.reflection || d.wolf?.length ||
      dailyCommitmentLines(d).length || completedBasics(d).length || d.tomorrowPriority;
    if (!hasContent) continue;
    const wolf = d.wolf?.length ? ` · Wolf: ${d.wolf.join(", ")}` : "";
    const plainParts: string[] = [];
    const htmlFieldLines: string[] = [];
    plainParts.push(`${DAY_LABELS[day]}${wolf}`);
    for (const line of dailyCommitmentLines(d)) {
      plainParts.push(line);
      htmlFieldLines.push(boldKey(line));
    }
    const basics = completedBasics(d);
    if (basics.length) {
      plainParts.push(`Basics: ${basics.join(", ")}`);
      htmlFieldLines.push(`<strong>Basics:</strong> ${esc(basics.join(", "))}`);
    }
    if (d.gratitude) { plainParts.push(`Grateful: ${d.gratitude}`); htmlFieldLines.push(`<strong>Grateful:</strong> ${esc(d.gratitude)}`); }
    if (d.wins) { plainParts.push(`Wins: ${d.wins}`); htmlFieldLines.push(`<strong>Wins:</strong> ${esc(d.wins)}`); }
    if (d.journal) { plainParts.push(d.journal); htmlFieldLines.push(esc(d.journal)); }
    if (d.reflection) { plainParts.push(`Better: ${d.reflection}`); htmlFieldLines.push(`<strong>Better:</strong> ${esc(d.reflection)}`); }
    if (d.tomorrowPriority) {
      plainParts.push(`Tomorrow's #1: ${d.tomorrowPriority}`);
      htmlFieldLines.push(`<strong>Tomorrow's #1:</strong> ${esc(d.tomorrowPriority)}`);
    }
    lines.push(plainParts.join("  "));
    const dayHeading = `<h3>${esc(DAY_LABELS[day])}${esc(wolf)}</h3>`;
    dailyHtmlLines.push(dayHeading + (htmlFieldLines.length ? htmlFieldLines.join("<br>") : ""));
  }

  const planLines = weeklyPlanLines(data.weekly);
  if (planLines.length) lines.push(planLines.join("\n"));

  // Weekly reflection
  const reflParts = weeklyLines(data.weekly);
  lines.push(reflParts.join("\n"));

  const numTerrLines = TERRITORIES.length + enabledTrackers(settings).length + 1;
  const headerLines = lines.slice(0, numTerrLines);

  const plain = lines.join("\n");
  const htmlParts: string[] = [`<p>${headerLines.map(boldKey).join("<br>")}</p>`];
  if (planLines.length) htmlParts.push(`<h2>Weekly Plan</h2>${planLines.map((line) => `<p>${boldKey(line)}</p>`).join("")}`);
  if (dailyHtmlLines.length) htmlParts.push(dailyHtmlLines.join(""));
  if (reflParts.length) {
    const weeklyHtml = `<h2>Weekly Reflection</h2>` + reflParts.map(p => `<p>${boldKey(p)}</p>`).join("");

    htmlParts.push(weeklyHtml);
  }
  const html = htmlParts.join("");
  return { plain, html };
}

export function generateEmailHtml(data: WeekData, settings: TrackerSettings = DEFAULT_TRACKER_SETTINGS): string {
  const weekOf = calendarDateObject(data.weekOf);
  const score = calcScore(data);
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
    const hasContent = d.gratitude || d.wins || d.journal || d.reflection || d.wolf?.length ||
      dailyCommitmentLines(d).length || completedBasics(d).length || d.tomorrowPriority;
    if (!hasContent) return "";
    const wolf = d.wolf?.length ? ` <span style="color:#888;font-size:13px">· Wolf: ${esc(d.wolf.join(", "))}</span>` : "";
    const fields = [
      ...dailyCommitmentLines(d).map((line) => `<div>${boldKey(line)}</div>`),
      completedBasics(d).length ? `<div><span style="${style.label}">Basics:</span> <span style="${style.value}">${esc(completedBasics(d).join(", "))}</span></div>` : "",
      d.gratitude ? `<div><span style="${style.label}">Grateful:</span> <span style="${style.value}">${esc(d.gratitude)}</span></div>` : "",
      d.wins ? `<div><span style="${style.label}">Wins:</span> <span style="${style.value}">${esc(d.wins)}</span></div>` : "",
      d.journal ? `<div style="color:#333;margin:4px 0">${esc(d.journal)}</div>` : "",
      d.reflection ? `<div><span style="${style.label}">Better:</span> <span style="${style.value}">${esc(d.reflection)}</span></div>` : "",
      d.tomorrowPriority ? `<div><span style="${style.label}">Tomorrow's #1:</span> <span style="${style.value}">${esc(d.tomorrowPriority)}</span></div>` : "",
    ].filter(Boolean).join("");
    return `<div style="margin-bottom:12px"><div style="${style.h3}">${DAY_LABELS[day]}${wolf}</div>${fields}</div>`;
  }).join("");

  // Weekly reflection — always show all fields
  const reflHtml = WEEKLY_FIELDS.map(([key, label]) => {
    const v = String(w[key] || "—");
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
    ${enabledTrackers(settings).map((tracker) => `<p style="margin:4px 0 0;font-size:13px;color:#888">${tracker.emoji} ${esc(tracker.label)}: ${esc(trackerSummary(data, tracker))}</p>`).join("")}
  </div>

  ${dayHtml ? `<div style="${style.section}"><h2 style="${style.h2}">Daily Journal</h2>${dayHtml}</div>` : ""}

  ${weeklyPlanLines(w).length ? `<div style="${style.section}"><h2 style="${style.h2}">Weekly Plan</h2>${weeklyPlanLines(w).map((line) => `<div>${boldKey(line)}</div>`).join("")}</div>` : ""}

  ${reflHtml ? `<div style="${style.section}"><h2 style="${style.h2}">Weekly Reflection</h2>${reflHtml}</div>` : ""}
</div>`;
}

export function generateReport(data: WeekData, settings: TrackerSettings = DEFAULT_TRACKER_SETTINGS): string {
  const weekOf = calendarDateObject(data.weekOf);
  const score = calcScore(data);
  const lines: string[] = [
    `# COIL Weekly Report — Week of ${formatWeekOf(weekOf)}`,
    ``,
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
  const planLines = weeklyPlanLines(data.weekly);
  if (planLines.length) {
    lines.push(`## Weekly Plan`);
    lines.push(``);
    for (const line of planLines) lines.push(`**${line.split(":")[0]}:**${line.slice(line.indexOf(":") + 1)}`);
    lines.push(``);
  }
  for (const tracker of enabledTrackers(settings)) {
    lines.push(`## ${tracker.label} Tracking ${tracker.emoji}`);
    const row = trackerValues(data, tracker).map((value) => tracker.type === "boolean" ? (value ? "✅" : "⬜") : trackerValueLabel(value, tracker)).join(" | ");
    lines.push(`| Mon | Tue | Wed | Thu | Fri | Sat | Sun | Weekly Total |`);
    lines.push(`|-----|-----|-----|-----|-----|-----|-----|--------------|`);
    lines.push(`| ${row} | **${trackerSummary(data, tracker)}** |`);
    lines.push(``);
  }
  lines.push(`## Daily Journal`);
  lines.push(``);
  for (const day of DAYS) {
    const d = data.days[day];
    if (!d) continue;
    lines.push(`### ${DAY_LABELS[day]}`);
    if (d.wolf?.length) lines.push(`**Wolf:** ${d.wolf.join(", ")}`);
    for (const line of dailyCommitmentLines(d)) {
      const separator = line.indexOf(":");
      lines.push(`**${line.slice(0, separator)}:**${line.slice(separator + 1)}`);
    }
    const basics = completedBasics(d);
    if (basics.length) lines.push(`**Basics:** ${basics.join(", ")}`);
    for (const tracker of enabledTrackers(settings)) {
      lines.push(`**${tracker.emoji} ${tracker.label}:** ${trackerValueLabel(getTrackerValue(d as unknown as Record<string, unknown>, tracker), tracker)}`);
    }
    if (d.gratitude) lines.push(`**Grateful:** ${d.gratitude}`);
    if (d.wins) lines.push(`**Wins:** ${d.wins}`);
    if (d.journal) lines.push(`**Notes:** ${d.journal}`);
    if (d.reflection) lines.push(`**Could do better:** ${d.reflection}`);
    if (d.tomorrowPriority) lines.push(`**Tomorrow's #1:** ${d.tomorrowPriority}`);
    lines.push(``);
  }
  lines.push(`## Weekly Reflection`);
  lines.push(``);
  lines.push(...weeklyLines(data.weekly));
  return lines.join("\n");
}
