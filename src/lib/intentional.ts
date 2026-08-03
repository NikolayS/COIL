export const TERRITORY_KEYS = [
  "self",
  "health",
  "wealth",
  "relationships",
  "business",
] as const;

export type TerritoryKey = (typeof TERRITORY_KEYS)[number];

export interface TerritoryCommitment {
  outcome: string;
  keystoneHabit: string;
}

export interface CycleData {
  startsOn: string;
  endsOn: string;
  mustWin: string;
  territories: Record<TerritoryKey, TerritoryCommitment>;
}

export interface DailyIntentions {
  commitments: Record<TerritoryKey, string>;
  basics: {
    ars: boolean;
    ad: boolean;
    workout: boolean;
    cfo: boolean;
  };
  arsSteps: {
    outsideWithoutScreens: boolean;
    walk: boolean;
    meditate: boolean;
    reviewPreviousDay: boolean;
    reviewTodayGoals: boolean;
  };
  tomorrowPriority: string;
}

export interface WeeklyIntentions {
  priorities: Record<TerritoryKey, string>;
  criticalActions: [string, string, string];
}

export type ReviewType = "month" | "quarter";
export type DailyPhase = "plan" | "close";

export interface ReviewPeriod {
  startsOn: string;
  endsOn: string;
  label: string;
}

export interface ReviewData {
  responses: Record<string, string>;
}

export function defaultDailyPhase(daysAgo: number): DailyPhase {
  return daysAgo > 0 ? "close" : "plan";
}

export function isDailyPhaseLocked(daysAgo: number, phase: DailyPhase, unlocked: boolean): boolean {
  if (unlocked) return false;
  if (phase === "plan") return daysAgo > 0;
  return daysAgo < 0 || daysAgo >= 2;
}

export function emptyTerritoryText(): Record<TerritoryKey, string> {
  return Object.fromEntries(TERRITORY_KEYS.map((key) => [key, ""])) as Record<TerritoryKey, string>;
}

export function emptyTerritoryCommitments(): Record<TerritoryKey, TerritoryCommitment> {
  return Object.fromEntries(
    TERRITORY_KEYS.map((key) => [key, { outcome: "", keystoneHabit: "" }]),
  ) as Record<TerritoryKey, TerritoryCommitment>;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createDefaultCycle(today = new Date()): CycleData {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 29);

  return {
    startsOn: isoDate(start),
    endsOn: isoDate(end),
    mustWin: "",
    territories: emptyTerritoryCommitments(),
  };
}

export function migrateDayIntentions(value: Record<string, unknown>): DailyIntentions {
  const savedCommitments = value.commitments && typeof value.commitments === "object"
    ? value.commitments as Record<string, unknown>
    : {};
  const savedBasics = value.basics && typeof value.basics === "object"
    ? value.basics as Record<string, unknown>
    : {};
  const savedArsSteps = value.arsSteps && typeof value.arsSteps === "object"
    ? value.arsSteps as Record<string, unknown>
    : {};

  return {
    commitments: Object.fromEntries(
      TERRITORY_KEYS.map((key) => [key, typeof savedCommitments[key] === "string" ? savedCommitments[key] : ""]),
    ) as Record<TerritoryKey, string>,
    basics: {
      ars: savedBasics.ars === true,
      ad: savedBasics.ad === true,
      workout: savedBasics.workout === true,
      cfo: savedBasics.cfo === true,
    },
    arsSteps: {
      outsideWithoutScreens: savedArsSteps.outsideWithoutScreens === true,
      walk: savedArsSteps.walk === true,
      meditate: savedArsSteps.meditate === true,
      reviewPreviousDay: savedArsSteps.reviewPreviousDay === true,
      reviewTodayGoals: savedArsSteps.reviewTodayGoals === true,
    },
    tomorrowPriority: typeof value.tomorrowPriority === "string" ? value.tomorrowPriority : "",
  };
}

export function migrateWeeklyIntentions(value: Record<string, unknown>): WeeklyIntentions {
  const savedPriorities = value.priorities && typeof value.priorities === "object"
    ? value.priorities as Record<string, unknown>
    : {};
  const savedActions = Array.isArray(value.criticalActions) ? value.criticalActions : [];

  return {
    priorities: Object.fromEntries(
      TERRITORY_KEYS.map((key) => [key, typeof savedPriorities[key] === "string" ? savedPriorities[key] : ""]),
    ) as Record<TerritoryKey, string>,
    criticalActions: [0, 1, 2].map((index) =>
      typeof savedActions[index] === "string" ? savedActions[index] : "",
    ) as [string, string, string],
  };
}

export function getReviewPeriod(type: ReviewType, key: string): ReviewPeriod {
  if (type === "month") {
    const match = /^(\d{4})-(\d{2})$/.exec(key);
    const year = Number(match?.[1]);
    const month = Number(match?.[2]);
    if (!match || month < 1 || month > 12) throw new Error("Invalid month");

    const startsOn = new Date(Date.UTC(year, month - 1, 1));
    const endsOn = new Date(Date.UTC(year, month, 0));
    return {
      startsOn: isoDate(startsOn),
      endsOn: isoDate(endsOn),
      label: startsOn.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    };
  }

  const match = /^(\d{4})-Q([1-4])$/.exec(key);
  if (!match) throw new Error("Invalid quarter");
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const startsOn = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const endsOn = new Date(Date.UTC(year, quarter * 3, 0));
  return {
    startsOn: isoDate(startsOn),
    endsOn: isoDate(endsOn),
    label: `Q${quarter} ${year}`,
  };
}
