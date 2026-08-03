import {
  TERRITORY_KEYS,
  emptyTerritoryCommitments,
  type CycleData,
  type MonthlyPlan,
  type ReviewData,
  type TerritoryKey,
} from "./intentional";
import {
  enabledTrackers,
  getTrackerValue,
  trackerValueLabel,
  type TrackerSettings,
  type TrackerValue,
} from "./tracking";

export const MONTHLY_REVIEW_PROMPTS = [
  ["proud", "What did I accomplish this past month that I am most proud of?"],
  ["achievements", "What were my greatest achievements this past month?"],
  ["priority", "What was my biggest priority? Did I achieve it?"],
  ["changed", "How am I different from last month?"],
  ["plan", "What did not go according to plan? What needs more focus?"],
  ["stop", "What do I need to stop or do less of?"],
  ["start", "What do I need to start or do more of?"],
  ["lessons", "What were my greatest lessons?"],
  ["trajectory", "If every month looked like this, would I hit my goals?"],
  ["letGo", "What do I get to let go of?"],
  ["allow", "What am I allowing more of next month?"],
] as const;

export const MONTHLY_PLAN_PROMPTS = [
  ["mustWin", "What is the one thing I must accomplish this month?"],
  ["steps", "What concrete steps will achieve it?"],
  ["priorities", "What are my other priorities and areas of focus?"],
  ["identity", "How do I want to show up differently?"],
  ["growth", "How will I challenge myself to grow?"],
  ["learning", "What do I want to read or learn?"],
  ["practices", "What changes do I need in my morning or evening practices?"],
  ["habits", "What changes do I need in my daily keystone habits?"],
] as const;

export interface MonthlyDay {
  territories?: Partial<Record<TerritoryKey, boolean>>;
  commitments?: Partial<Record<TerritoryKey, string>>;
  basics?: { ars?: boolean; ad?: boolean; workout?: boolean; cfo?: boolean };
  wolf?: unknown[] | string;
  trackers?: Record<string, TrackerValue>;
  drinks?: number;
  bagels?: number;
  steps10k?: boolean;
  coldPlunge?: boolean;
  fasting?: boolean;
  gratitude?: string;
  wins?: string;
  journal?: string;
  reflection?: string;
}

export interface MonthlyWeek {
  weekOf: string;
  days: Record<string, MonthlyDay>;
}

export interface MonthlyEvidenceDay {
  date: string;
  data: MonthlyDay;
}

export interface MonthlyEvidence {
  startsOn: string;
  endsOn: string;
  elapsedDays: number;
  trackedDays: number;
  score: number;
  possible: number;
  territoryTotals: Record<TerritoryKey, number>;
  commitmentsPlanned: Record<TerritoryKey, number>;
  commitmentsCompleted: Record<TerritoryKey, number>;
  basics: { ars: number; ad: number; cfo: number };
  trackers: { id: string; label: string; emoji: string; summary: string }[];
  weeklyTrend: { startsOn: string; trackedDays: number; score: number; possible: number }[];
  wins: { date: string; text: string }[];
  reflections: { date: string; text: string }[];
}

const DAY_NUMBERS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function nextMonthKey(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("Invalid month");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(month: string): { startsOn: string; endsOn: string; label: string } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error("Invalid month");
  const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const end = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0));
  return {
    startsOn: isoDate(start),
    endsOn: isoDate(end),
    label: start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

export function emptyMonthlyPlan(targetMonth: string): MonthlyPlan {
  return { targetMonth, responses: {}, territories: emptyTerritoryCommitments() };
}

export function normalizeMonthlyPlan(value: unknown, targetMonth: string): MonthlyPlan {
  const saved = value && typeof value === "object" ? value as Partial<MonthlyPlan> : {};
  const savedResponses = saved.responses && typeof saved.responses === "object" ? saved.responses : {};
  const savedTerritories = saved.territories && typeof saved.territories === "object"
    ? saved.territories as Partial<MonthlyPlan["territories"]>
    : {};
  return {
    targetMonth: typeof saved.targetMonth === "string" && /^\d{4}-\d{2}$/.test(saved.targetMonth)
      ? saved.targetMonth
      : targetMonth,
    responses: Object.fromEntries(
      Object.entries(savedResponses).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
    territories: Object.fromEntries(TERRITORY_KEYS.map((key) => {
      const territory = savedTerritories[key];
      return [key, {
        outcome: cleanText(territory?.outcome),
        keystoneHabit: cleanText(territory?.keystoneHabit),
      }];
    })) as MonthlyPlan["territories"],
  };
}

export function mergeMonthlyPlanWithCycle(plan: MonthlyPlan, cycle: CycleData | null): MonthlyPlan {
  if (!cycle) return plan;
  return {
    ...plan,
    responses: {
      ...plan.responses,
      mustWin: cleanText(plan.responses.mustWin) || cycle.mustWin,
    },
    territories: Object.fromEntries(TERRITORY_KEYS.map((key) => [key, {
      outcome: cleanText(plan.territories[key].outcome) || cycle.territories[key].outcome,
      keystoneHabit: cleanText(plan.territories[key].keystoneHabit) || cycle.territories[key].keystoneHabit,
    }])) as MonthlyPlan["territories"],
  };
}

export function decodeStoredReview(value: unknown, targetMonth: string): ReviewData {
  const saved = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const nested = saved.__review && typeof saved.__review === "object"
    ? saved.__review as Record<string, unknown>
    : saved.responses && typeof saved.responses === "object"
      ? saved.responses as Record<string, unknown>
      : saved;
  return {
    responses: Object.fromEntries(
      Object.entries(nested).filter((entry): entry is [string, string] => !entry[0].startsWith("__") && typeof entry[1] === "string"),
    ),
    plan: normalizeMonthlyPlan(saved.__plan ?? saved.plan, targetMonth),
  };
}

export function encodeStoredReview(review: ReviewData): Record<string, unknown> {
  return { __review: review.responses, __plan: review.plan };
}

export function hasRecordedActivity(day: MonthlyDay | null | undefined): boolean {
  if (!day) return false;
  if (Object.values(day.territories ?? {}).some(Boolean)) return true;
  if (Object.values(day.commitments ?? {}).some((value) => cleanText(value) !== "")) return true;
  if (Object.values(day.basics ?? {}).some(Boolean)) return true;
  if (Array.isArray(day.wolf) ? day.wolf.length > 0 : Boolean(day.wolf)) return true;
  if (Object.values(day.trackers ?? {}).some((value) => Boolean(value))) return true;
  if ((day.drinks ?? 0) > 0 || (day.bagels ?? 0) > 0 || day.steps10k || day.coldPlunge || day.fasting) return true;
  return [day.gratitude, day.wins, day.journal, day.reflection].some((value) => cleanText(value) !== "");
}

export function periodDays(
  weeks: MonthlyWeek[],
  startsOn: string,
  endsOn: string,
  through = isoDate(new Date()),
): MonthlyEvidenceDay[] {
  return weeks.flatMap((week) => {
    const start = new Date(week.weekOf.includes("T") ? week.weekOf : `${week.weekOf}T12:00:00Z`);
    const startDayNumber = start.getUTCDay();
    return Object.entries(week.days).map(([day, data]) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + ((DAY_NUMBERS[day] - startDayNumber + 7) % 7));
      return { date: isoDate(date), data };
    });
  }).filter((day, index, days) =>
    day.date >= startsOn && day.date <= endsOn && day.date <= through &&
    days.findIndex((candidate) => candidate.date === day.date) === index
  ).sort((a, b) => a.date.localeCompare(b.date));
}

function weekStart(dateValue: string): string {
  const date = new Date(`${dateValue}T12:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - day + (day === 0 ? -6 : 1));
  return isoDate(date);
}

export function buildMonthlyEvidence(
  weeks: MonthlyWeek[],
  month: string,
  trackerSettings: TrackerSettings,
  through = isoDate(new Date()),
): MonthlyEvidence {
  const range = monthRange(month);
  const allDays = periodDays(weeks, range.startsOn, range.endsOn, through);
  const tracked = allDays.filter((day) => hasRecordedActivity(day.data));
  const elapsedEnd = [range.endsOn, through].sort()[0];
  const elapsedDays = elapsedEnd < range.startsOn
    ? 0
    : Math.floor((new Date(`${elapsedEnd}T12:00:00Z`).getTime() - new Date(`${range.startsOn}T12:00:00Z`).getTime()) / 86_400_000) + 1;
  const territoryTotals = Object.fromEntries(TERRITORY_KEYS.map((key) => [
    key,
    tracked.filter((day) => day.data.territories?.[key]).length,
  ])) as Record<TerritoryKey, number>;
  const commitmentsPlanned = Object.fromEntries(TERRITORY_KEYS.map((key) => [
    key,
    tracked.filter((day) => cleanText(day.data.commitments?.[key]) !== "").length,
  ])) as Record<TerritoryKey, number>;
  const commitmentsCompleted = Object.fromEntries(TERRITORY_KEYS.map((key) => [
    key,
    tracked.filter((day) => day.data.territories?.[key] && cleanText(day.data.commitments?.[key]) !== "").length,
  ])) as Record<TerritoryKey, number>;
  const groups = new Map<string, MonthlyEvidenceDay[]>();
  for (const day of tracked) {
    const key = weekStart(day.date);
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }

  return {
    startsOn: range.startsOn,
    endsOn: range.endsOn,
    elapsedDays,
    trackedDays: tracked.length,
    score: Object.values(territoryTotals).reduce((sum, value) => sum + value, 0),
    possible: tracked.length * TERRITORY_KEYS.length,
    territoryTotals,
    commitmentsPlanned,
    commitmentsCompleted,
    basics: {
      ars: tracked.filter((day) => day.data.basics?.ars).length,
      ad: tracked.filter((day) => day.data.basics?.ad).length,
      cfo: tracked.filter((day) => day.data.basics?.cfo).length,
    },
    trackers: enabledTrackers(trackerSettings).map((tracker) => {
      const values = tracked.map((day) => getTrackerValue(day.data as Record<string, unknown>, tracker));
      const summary = tracker.type === "boolean"
        ? `${values.filter(Boolean).length}/${elapsedDays}`
        : tracker.type === "rating"
          ? (() => {
              const rated = values.map(Number).filter((value) => value > 0);
              return rated.length ? `${(rated.reduce((sum, value) => sum + value, 0) / rated.length).toFixed(1)}/5` : "—";
            })()
          : trackerValueLabel(values.reduce<number>((sum, value) => sum + Number(value), 0), tracker);
      return { id: tracker.id, label: tracker.label, emoji: tracker.emoji, summary };
    }),
    weeklyTrend: [...groups.entries()].map(([startsOn, days]) => {
      const score = days.reduce((sum, day) =>
        sum + Object.values(day.data.territories ?? {}).filter(Boolean).length, 0);
      return { startsOn, trackedDays: days.length, score, possible: days.length * TERRITORY_KEYS.length };
    }),
    wins: tracked.flatMap((day) => {
      const text = cleanText(day.data.wins);
      return text ? [{ date: day.date, text }] : [];
    }),
    reflections: tracked.flatMap((day) => {
      const text = cleanText(day.data.reflection);
      return text ? [{ date: day.date, text }] : [];
    }),
  };
}

export function monthlyReportText(
  monthLabel: string,
  evidence: MonthlyEvidence,
  review: ReviewData,
  goals: { mustWin: string; territories: Record<TerritoryKey, { outcome: string; keystoneHabit: string }> } | null,
): string {
  const lines = [
    `# COIL Monthly Review — ${monthLabel}`,
    "",
    `Tracked days: ${evidence.trackedDays}/${evidence.elapsedDays}`,
    `Execution score: ${evidence.score}/${evidence.possible}`,
  ];
  if (goals) lines.push(`Goals context: ${goals.mustWin || "No must-win recorded"}`);
  else lines.push("Goals context: No goals were set; this review is based on actual evidence.");
  lines.push("", "## Monthly Review");
  for (const [key, prompt] of MONTHLY_REVIEW_PROMPTS) lines.push(`**${prompt}**\n${review.responses[key] || "—"}\n`);
  if (review.plan) {
    lines.push(`## Monthly Plan — ${monthRange(review.plan.targetMonth).label}`);
    for (const [key, prompt] of MONTHLY_PLAN_PROMPTS) lines.push(`**${prompt}**\n${review.plan.responses[key] || "—"}\n`);
    lines.push("## Territory Plan");
    for (const key of TERRITORY_KEYS) {
      const territory = review.plan.territories[key];
      lines.push(`**${key}:** ${territory.outcome || "—"} | Keystone: ${territory.keystoneHabit || "—"}`);
    }
  }
  return lines.join("\n");
}
