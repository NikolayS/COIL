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

export function generateReport(data: WeekData): string {
  const weekOf = new Date(data.weekOf);
  const score = calcScore(data);
  const lines: string[] = [
    `# COIL Weekly Report — Week of ${formatWeekOf(weekOf)}`,
    ``,
    `## Weekly Score: ${score}/${TOTAL_POSSIBLE}`,
    ``,
    `## Daily Territory Scores`,
    `| Territory | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total |`,
    `|-----------|-----|-----|-----|-----|-----|-----|-----|-------|`,
  ];
  for (const t of TERRITORIES) {
    const row = DAYS.map((d) => (data.days[d]?.territories[t.key] ? "✓" : "·")).join(" | ");
    const total = calcTerritoryScore(data, t.key);
    lines.push(`| ${t.label.padEnd(9)} | ${row} | ${total}/7 |`);
  }
  const totals = DAYS.map((d) => Object.values(data.days[d]?.territories ?? {}).filter(Boolean).length);
  lines.push(`| Total | ${totals.join(" | ")} | ${score}/${TOTAL_POSSIBLE} |`);
  lines.push(``);
  lines.push(`## Drinks`);
  const drinkRow = DAYS.map((d) => data.days[d]?.drinks ?? 0).join(" | ");
  lines.push(`| Mon | Tue | Wed | Thu | Fri | Sat | Sun | Weekly |`);
  lines.push(`|-----|-----|-----|-----|-----|-----|-----|--------|`);
  lines.push(`| ${drinkRow} | ${calcWeekDrinks(data)} |`);
  lines.push(``);
  lines.push(`## Daily Journal`);
  for (const day of DAYS) {
    const d = data.days[day];
    if (!d) continue;
    const wolf = d.wolf?.length ? ` · Wolf: ${d.wolf.join(", ")}` : "";
    lines.push(`### ${DAY_LABELS[day]}${wolf}`);
    if (d.gratitude) lines.push(`Grateful for: ${d.gratitude}`);
    if (d.wins) lines.push(`Wins: ${d.wins}`);
    if (d.journal) lines.push(d.journal);
    if (d.reflection) lines.push(`Better: ${d.reflection}`);
    lines.push(``);
  }
  lines.push(`## Weekly Reflection`);
  const w = data.weekly;
  if (w.biggestWin) lines.push(`Biggest Win: ${w.biggestWin}`);
  if (w.wins) lines.push(`Other Wins: ${w.wins}`);
  if (w.gratitude) lines.push(`Gratitude: ${w.gratitude}`);
  if (w.lessons) lines.push(`Lessons: ${w.lessons}`);
  if (w.focusAchieved) lines.push(`Focus achieved: ${w.focusAchieved}`);
  if (w.focusNext) lines.push(`Focus next week: ${w.focusNext}`);
  if (w.stretchNext) lines.push(`Stretch next week: ${w.stretchNext}`);
  if (w.onTrack) lines.push(`On track: ${w.onTrack}`);
  if (w.cupOverflowing) lines.push(`Cup overflowing: ${w.cupOverflowing}`);
  if (w.improve) lines.push(`Areas to improve: ${w.improve}`);
  return lines.join("\n");
}
