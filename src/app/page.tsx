"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { Copy, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Minus, Plus, LogOut, Settings, Download, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { generateReport, generatePlainReportHtml } from "@/lib/report";
import { enabledTrackers, getTrackerValue, DEFAULT_TRACKER_SETTINGS, trackerSettingsFromJson, trackerSettingsFromRow, type TrackerDefinition, type TrackerSettings, type TrackerValue } from "@/lib/tracking";
import {
  MONTHLY_PLAN_PROMPTS,
  MONTHLY_REVIEW_PROMPTS,
  buildMonthlyEvidence,
  decodeStoredReview,
  encodeStoredReview,
  emptyMonthlyPlan,
  hasRecordedActivity,
  mergeMonthlyPlanWithCycle,
  monthRange,
  monthlyReportText,
  nextMonthKey,
  periodDays as collectPeriodDays,
  type MonthlyWeek,
} from "@/lib/monthly";
import {
  TERRITORY_KEYS,
  createDefaultCycle,
  defaultDailyPhase,
  getReviewPeriod,
  isDailyPhaseLocked,
  migrateDayIntentions,
  migrateWeeklyIntentions,
  type CycleData,
  type DailyPhase,
  type DailyIntentions,
  type MonthlyPlan,
  type ReviewData,
  type ReviewType,
  type TerritoryKey,
  type WeeklyIntentions,
} from "@/lib/intentional";
import type { User } from "@supabase/supabase-js";

// ── Types ──────────────────────────────────────────────────────────────────

type WolfMode = "wise" | "open" | "loving" | "fierce";
type WolfModes = WolfMode[];
type TabKey = "today" | "week" | "cycle" | "review";
type ReviewPeriod = "month" | "quarter" | "ytd" | "year" | "custom";

interface DayData extends DailyIntentions {
  territories: Record<TerritoryKey, boolean>;
  wolf: WolfModes;
  drinks: number;
  bagels: number;
  steps10k: boolean;
  coldPlunge: boolean;
  fasting: boolean;
  trackers: Record<string, TrackerValue>;
  gratitude: string;
  wins: string;
  journal: string;
  reflection: string;
}

interface WeekData {
  weekOf: string; // ISO date string for Monday
  days: Record<string, DayData>; // key: "mon" | "tue" etc.
  weekly: WeeklyIntentions & {
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

interface ArchivedWeek {
  weekOf: string;
  data: WeekData;
  archivedAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TERRITORIES: { key: TerritoryKey; label: string; color: string; textColor: string }[] = [
  { key: "self", label: "Self", color: "#4a9e6b", textColor: "text-[#4a9e6b]" },
  { key: "health", label: "Health", color: "#c85555", textColor: "text-[#c85555]" },
  { key: "wealth", label: "Wealth", color: "#4a7fc1", textColor: "text-[#4a7fc1]" },
  { key: "relationships", label: "Relationships", color: "#c9873a", textColor: "text-[#c9873a]" },
  { key: "business", label: "Business", color: "#8b5cf6", textColor: "text-[#8b5cf6]" },
];

const WOLF_MODES: { key: WolfMode; label: string }[] = [
  { key: "wise", label: "Wise" },
  { key: "open", label: "Open" },
  { key: "loving", label: "Loving" },
  { key: "fierce", label: "Fierce" },
];

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

const TOTAL_POSSIBLE = 35; // 5 territories × 7 days

// ── Helpers ────────────────────────────────────────────────────────────────

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function reviewPeriodRange(
  period: ReviewPeriod,
  options: { month: string; quarter: number; year: number; customStart: string; customEnd: string },
): { start: string; end: string; label: string } {
  if (period === "custom") {
    return { start: options.customStart, end: options.customEnd, label: "Custom Review" };
  }
  if (period === "month") {
    const [year, month] = options.month.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return {
      start: isoDate(start),
      end: isoDate(end),
      label: start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  }
  if (period === "quarter") {
    const start = new Date(Date.UTC(options.year, (options.quarter - 1) * 3, 1));
    const end = new Date(Date.UTC(options.year, options.quarter * 3, 0));
    return { start: isoDate(start), end: isoDate(end), label: `Q${options.quarter} ${options.year}` };
  }
  const start = new Date(Date.UTC(options.year, 0, 1));
  const end = period === "ytd" && options.year === new Date().getUTCFullYear()
    ? new Date()
    : new Date(Date.UTC(options.year, 11, 31));
  return {
    start: isoDate(start),
    end: isoDate(end),
    label: period === "ytd" ? `${options.year} Year to Date` : `${options.year} Annual Review`,
  };
}

function getMondayOfWeek(date: Date): Date {
  return getWeekStart(date, "monday");
}

function getWeekStart(date: Date, weekStart: "monday" | "sunday" = "monday"): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...6=Sat
  if (weekStart === "monday") {
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
  } else {
    // Sunday start
    const diff = d.getDate() - day;
    d.setDate(diff);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekOf(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getTodayKey(): string {
  const day = new Date().getDay();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][day];
}

function emptyDayData(): DayData {
  const intentions = migrateDayIntentions({});
  return {
    ...intentions,
    territories: { self: false, health: false, wealth: false, relationships: false, business: false },
    wolf: [],
    drinks: 0,
    bagels: 0,
    steps10k: false,
    coldPlunge: false,
    fasting: false,
    trackers: {},
    gratitude: "",
    wins: "",
    journal: "",
    reflection: "",
  };
}

function emptyWeekData(monday: Date): WeekData {
  const weeklyIntentions = migrateWeeklyIntentions({});
  return {
    weekOf: monday.toISOString(),
    days: Object.fromEntries(DAYS.map((d) => [d, emptyDayData()])),
    weekly: {
      ...weeklyIntentions,
      wins: "", gratitude: "", biggestWin: "", lessons: "", focusAchieved: "",
      focusNext: "", stretchNext: "", onTrack: "", cupOverflowing: "", improve: "",
    },
  };
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

// ── Storage ────────────────────────────────────────────────────────────────
// Demo/guest mode: localStorage only.
// Authenticated mode: Supabase only — localStorage never touched.

const STORAGE_KEY = "coil_current_week";
const ARCHIVE_KEY = "coil_archived_weeks";

function migrateWeekData(data: WeekData): WeekData {
  // Migrate wolf from old single string to array; backfill new day fields
  const days = Object.fromEntries(
    Object.entries(data.days).map(([k, d]) => [
      k,
      {
        ...d,
        ...migrateDayIntentions(d as unknown as Record<string, unknown>),
        wolf: Array.isArray(d.wolf) ? d.wolf : d.wolf ? [d.wolf as unknown as WolfMode] : [],
        bagels: d.bagels ?? 0,
        steps10k: d.steps10k ?? false,
        coldPlunge: d.coldPlunge ?? false,
        fasting: d.fasting ?? false,
        trackers: d.trackers ?? {},
        gratitude: d.gratitude ?? "",
        wins: d.wins ?? "",
      },
    ])
  );
  // Backfill new weekly field
  const weekly = {
    ...data.weekly,
    ...migrateWeeklyIntentions(data.weekly as unknown as Record<string, unknown>),
    biggestWin: data.weekly.biggestWin ?? "",
  };
  return { ...data, days, weekly };
}

// Demo-only helpers
function demoLoadCurrent(): WeekData {
  if (typeof window === "undefined") return emptyWeekData(getMondayOfWeek(new Date()));
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrateWeekData(JSON.parse(raw));
  } catch {}
  return emptyWeekData(getMondayOfWeek(new Date()));
}

function demoSaveCurrent(data: WeekData) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function demoLoadArchive(): ArchivedWeek[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (raw) return (JSON.parse(raw) as ArchivedWeek[]).map((w) => ({ ...w, data: migrateWeekData(w.data) }));
  } catch {}
  return [];
}

function demoSaveArchive(weeks: ArchivedWeek[]) {
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(weeks)); } catch {}
}

function demoClearAll() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ARCHIVE_KEY);
  } catch {}
}

// ── Supabase sync ──────────────────────────────────────────────────────────

async function syncCurrentToSupabase(userId: string, data: WeekData, signal?: AbortSignal, isPastWeek = false): Promise<string | null> {
  if (signal?.aborted) return "Timed out";
  const supabase = createClient();
  const weekOf = new Date(data.weekOf).toISOString().slice(0, 10);
  // For past weeks: preserve existing archived flag (don't reset to false)
  const row = isPastWeek
    ? { user_id: userId, week_of: weekOf, data, updated_at: new Date().toISOString() }
    : { user_id: userId, week_of: weekOf, data, archived: false, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("weeks").upsert(
    row,
    { onConflict: "user_id,week_of" }
  );
  if (signal?.aborted) return "Timed out";
  return error ? error.message : null;
}

function getMondayForOffset(offset: number, weekStart: "monday" | "sunday" = "monday"): Date {
  const d = getWeekStart(new Date(), weekStart);
  d.setDate(d.getDate() + offset * 7);
  return d;
}

async function fetchCurrentFromSupabase(userId: string, offset = 0, weekStart: "monday" | "sunday" = "monday"): Promise<WeekData | null> {
  const supabase = createClient();
  const monday = getMondayForOffset(offset, weekStart).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("weeks")
    .select("data")
    .eq("user_id", userId)
    .eq("week_of", monday)
    .eq("archived", false)
    .maybeSingle();
  return data?.data ? migrateWeekData(data.data as WeekData) : null;
}

async function fetchArchiveFromSupabase(userId: string): Promise<ArchivedWeek[]> {
  const supabase = createClient();
  const currentMonday = getMondayOfWeek(new Date()).toISOString().slice(0, 10);
  // Show ALL past weeks (not just archived ones) — any week before this week
  const { data } = await supabase
    .from("weeks")
    .select("week_of, data, updated_at")
    .eq("user_id", userId)
    .lt("week_of", currentMonday)
    .order("week_of", { ascending: false });
  if (!data) return [];
  return data.map((row) => ({
    weekOf: new Date(row.week_of).toISOString(),
    data: row.data as WeekData,
    archivedAt: row.updated_at,
  }));
}

async function archiveInSupabase(userId: string, data: WeekData) {
  const supabase = createClient();
  const weekOf = new Date(data.weekOf).toISOString().slice(0, 10);
  await supabase.from("weeks").upsert(
    { user_id: userId, week_of: weekOf, data, archived: true, updated_at: new Date().toISOString() },
    { onConflict: "user_id,week_of" }
  );
}

// ── SQL Dump Export ────────────────────────────────────────────────────────

async function downloadSqlDump(user: User, supabase: ReturnType<typeof createClient>) {
  const { data: rows } = await supabase
    .from("weeks")
    .select("*")
    .eq("user_id", user.id)
    .order("week_of");

  if (!rows || rows.length === 0) {
    alert("No data to export.");
    return;
  }

  const esc = (s: string) => s.replace(/'/g, "''");
  const now = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    `-- COIL data dump — ${now} — ${user.email}`,
    ``,
    `CREATE TABLE IF NOT EXISTS public.weeks (`,
    `  id uuid PRIMARY KEY,`,
    `  user_id uuid NOT NULL,`,
    `  week_of date NOT NULL,`,
    `  data jsonb NOT NULL DEFAULT '{}'::jsonb,`,
    `  archived boolean NOT NULL DEFAULT false,`,
    `  created_at timestamptz NOT NULL DEFAULT now(),`,
    `  updated_at timestamptz NOT NULL DEFAULT now(),`,
    `  UNIQUE (user_id, week_of)`,
    `);`,
    ``,
  ];

  const cols = "id, user_id, week_of, data, archived, created_at, updated_at";
  const valueRows = rows.map((r) => {
    const data = JSON.stringify(r.data).replace(/'/g, "''");
    return `  ('${esc(r.id)}', '${esc(r.user_id)}', '${r.week_of}', '${data}'::jsonb, ${r.archived}, '${r.created_at}', '${r.updated_at}')`;
  });

  lines.push(`INSERT INTO public.weeks (${cols}) VALUES`);
  lines.push(valueRows.join(",\n") + ";");

  const sql = lines.join("\n");
  const blob = new Blob([sql], { type: "application/sql" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `coil-dump-${now}.sql`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PhaseSwitch<T extends string>({
  value,
  options,
  onChange,
  prominent = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  prominent?: boolean;
}) {
  return (
    <div
      className={`grid gap-1 rounded-xl bg-[--bg-card] ${prominent ? "border-2 p-1.5" : "border p-1"}`}
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        borderColor: prominent ? "var(--gold-border)" : "var(--border)",
      }}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`rounded-lg px-3 font-mono uppercase tracking-[0.12em] transition-all ${prominent ? "py-3 text-sm font-bold" : "py-2 text-xs"}`}
            style={{
              color: active ? (prominent ? "var(--bg)" : "var(--gold)") : "var(--text-dim)",
              backgroundColor: active ? (prominent ? "var(--gold)" : "var(--gold-bg)") : "transparent",
              boxShadow: active && prominent ? "0 2px 8px color-mix(in srgb, var(--gold) 30%, transparent)" : "none",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function CommitmentRow({
  territory,
  value,
  placeholder,
  completed,
  showCompletion,
  onChange,
  onToggle,
}: {
  territory: typeof TERRITORIES[0];
  value: string;
  placeholder?: string;
  completed: boolean;
  showCompletion: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-xl border bg-[--bg-card] px-3 py-3"
      style={{ borderColor: completed ? territory.color + "70" : "var(--border)" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: territory.color }} />
        <span className="text-xs font-mono uppercase tracking-[0.12em]" style={{ color: territory.color }}>
          {territory.label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder || `One commitment for ${territory.label.toLowerCase()}…`}
          maxLength={180}
          className="min-w-0 flex-1 rounded-lg border border-[--border] bg-[--bg-input] px-3 py-2.5 text-sm text-[--text] placeholder-[--text-faint] focus:border-[--gold-border] focus:outline-none"
        />
        {showCompletion && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={`${completed ? "Undo" : "Complete"} ${territory.label} commitment`}
            aria-pressed={completed}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border-2 transition-all active:scale-95"
            style={{
              borderColor: territory.color,
              backgroundColor: completed ? territory.color : "transparent",
            }}
          >
            {completed && <Check size={16} color="#fff" />}
          </button>
        )}
      </div>
    </div>
  );
}

const BASIC_ITEMS: { key: keyof DailyIntentions["basics"]; label: string }[] = [
  { key: "ars", label: "Alpha Rise & Shine" },
  { key: "ad", label: "Alpha Decompression" },
  { key: "cfo", label: "Be the CFO" },
];

function WolfCheck({ value, onChange }: { value: WolfModes; onChange: (v: WolfModes) => void }) {
  const toggle = (key: WolfMode) => {
    if (value.includes(key)) {
      onChange(value.filter((k) => k !== key));
    } else {
      onChange([...value, key]);
    }
  };
  return (
    <div>
      <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-3">
        🐺 Wolf Check — Where did I show up?
      </p>
      <div className="grid grid-cols-4 gap-2">
        {WOLF_MODES.map(({ key, label }) => {
          const active = value.includes(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="py-3 rounded-lg text-sm font-medium border transition-all duration-200 active:scale-95"
              style={{
                borderColor: active ? "var(--gold)" : "var(--border)",
                backgroundColor: active ? "var(--gold-bg)" : "transparent",
                color: active ? "var(--gold)" : "var(--text-muted)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CountCounter({
  label,
  value,
  weeklyTotal,
  onChange,
  weeklyNote,
  comment,
}: {
  label: string;
  value: number;
  weeklyTotal: number;
  onChange: (v: number) => void;
  weeklyNote?: (weeklyTotal: number) => ReactNode;
  comment?: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-3">{label}</p>
      <div className="bg-[--bg-card] rounded-xl px-4 py-3 border border-[--border] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              aria-label={`Decrease ${label}`}
              onClick={() => onChange(Math.max(0, value - 1))}
              className="w-11 h-11 rounded-full bg-[--bg] border border-[--border] flex items-center justify-center active:scale-90 transition-transform"
            >
              <Minus size={14} className="text-[--text-muted]" />
            </button>
            <span className="font-mono text-2xl font-medium w-8 text-center" style={{color:"var(--gold)"}}>{value}</span>
            <button
              aria-label={`Increase ${label}`}
              onClick={() => onChange(value + 1)}
              className="w-11 h-11 rounded-full bg-[--bg] border border-[--border] flex items-center justify-center active:scale-90 transition-transform"
            >
              <Plus size={14} className="text-[--text-muted]" />
            </button>
          </div>
          <span className="text-sm text-[--text-dim]">
            {weeklyNote ? weeklyNote(weeklyTotal) : <>Weekly: {weeklyTotal}</>}
          </span>
        </div>
        {comment && <p className="text-xs text-[--text-muted] italic">{comment}</p>}
      </div>
    </div>
  );
}

function BooleanTrackerRow({ label, emoji, checked, onToggle }: { label: string; emoji: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl bg-[--bg-card] border border-[--border] active:bg-[--bg-card-hover]"
      style={{ borderColor: checked ? "var(--gold-border)" : undefined }}
    >
      <span className="text-[15px] font-medium tracking-wide">{emoji} {label}</span>
      <div
        className="w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200"
        style={{ borderColor: "var(--gold)", backgroundColor: checked ? "var(--gold)" : "transparent" }}
      >
        {checked && (
          <svg className="check-icon" width="12" height="9" viewBox="0 0 12 9" fill="none">
            <path d="M1 4L4.5 7.5L11 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </button>
  );
}

function RatingTrackerRow({ label, emoji, value, onChange }: { label: string; emoji: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="rounded-xl bg-[--bg-card] border border-[--border] px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[15px] font-medium tracking-wide">{emoji} {label}</span>
        <span className="text-xs font-mono text-[--text-faint]">{value > 0 ? `${value}/5` : "Not rated"}</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            onClick={() => onChange(value === rating ? 0 : rating)}
            aria-label={`${label}: ${rating} out of 5`}
            aria-pressed={value === rating}
            className="h-9 rounded-lg font-mono text-sm border transition-all active:scale-95"
            style={{
              borderColor: value === rating ? "var(--gold)" : "var(--border)",
              backgroundColor: value === rating ? "var(--gold-bg)" : "var(--bg)",
              color: value === rating ? "var(--gold)" : "var(--text-muted)",
            }}
          >
            {rating}
          </button>
        ))}
      </div>
    </div>
  );
}

function JournalField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  // Use local state to avoid React 19 controlled textarea thrashing.
  // Parent value syncs in on external changes (day switch, load);
  // local edits propagate to parent via debounced onChange.
  const [local, setLocal] = useState(value);
  const onChangeRef = useRef(onChange);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Sync from parent when value changes externally (day switch, data load)
  useEffect(() => {
    setLocal(value);
  }, [value]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setLocal(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChangeRef.current(v), 300);
  };

  // Flush on blur so we never lose the last few chars
  const handleBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChangeRef.current(local);
  };

  return (
    <div>
      <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-2">{label}</p>
      <textarea
        rows={3}
        value={local}
        onChange={handleInput}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full bg-[--bg-input] border border-[--border] rounded-xl px-4 py-3 text-[15px] text-[--text] placeholder-[--text-faint] focus:outline-none focus:border-[--gold-border] transition-colors"
      />
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────

function DailyTab({ data, onChange, trackerSettings, weekOffset = 0, weekStart = "monday" }: { data: WeekData; onChange: (d: WeekData | ((prev: WeekData | null) => WeekData | null)) => void; trackerSettings: TrackerSettings; weekOffset?: number; weekStart?: "monday" | "sunday" }) {
  const todayKey = getTodayKey();
  const [activeDay, setActiveDay] = useState(weekOffset < 0 ? "sun" : todayKey);
  const [phase, setPhase] = useState<DailyPhase>(weekOffset < 0 ? "close" : "plan");
  const [editUnlocked, setEditUnlocked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setActiveDay(weekOffset < 0 ? "sun" : todayKey);
    setPhase(weekOffset < 0 ? "close" : "plan");
  }, [weekOffset, todayKey]);

  const dayData = data.days[activeDay] ?? emptyDayData();
  const activeTrackers = enabledTrackers(trackerSettings);

  const weeklyTrackerTotal = (tracker: TrackerDefinition): number => {
    const values = DAYS.map((day) => getTrackerValue(data.days[day] as unknown as Record<string, unknown>, tracker));
    if (tracker.type === "boolean") return values.filter(Boolean).length;
    return values.reduce<number>((sum, value) => sum + Number(value), 0);
  };

  // How many days ago is a given day key?
  const daysAgo = (dayKey: string): number => {
    const dayOrder = weekStart === "sunday"
      ? ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
      : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const todayIdx = dayOrder.indexOf(todayKey);
    const dayIdx = dayOrder.indexOf(dayKey);
    return (todayIdx - dayIdx) + (-weekOffset * 7);
  };

  const activeDayAgo = daysAgo(activeDay);
  const isFuture = activeDayAgo < 0;
  const isUnlocked = Boolean(editUnlocked[`${weekOffset}:${activeDay}`]);
  const isLocked = isDailyPhaseLocked(activeDayAgo, phase, isUnlocked);
  const canUnlock = activeDayAgo > 0 && !isUnlocked;
  const orderedDays = weekStart === "sunday"
    ? ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
    : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const previousDayIndex = orderedDays.indexOf(activeDay) - 1;
  const carriedPriority = previousDayIndex >= 0
    ? data.days[orderedDays[previousDayIndex]]?.tomorrowPriority?.trim()
    : "";

  const unlockDay = () => {
    setEditUnlocked(prev => ({ ...prev, [`${weekOffset}:${activeDay}`]: true }));
  };

  const updateDay = useCallback(
    (patch: Partial<DayData>) => {
      onChange((prev: WeekData | null) => {
        if (!prev) return prev;
        const prevDay = prev.days[activeDay] ?? emptyDayData();
        return { ...prev, days: { ...prev.days, [activeDay]: { ...prevDay, ...patch } } };
      });
    },
    [onChange, activeDay]
  );

  const toggleTerritory = (key: TerritoryKey) => {
    updateDay({ territories: { ...dayData.territories, [key]: !dayData.territories[key] } });
  };

  const dayScore = Object.values(dayData.territories).filter(Boolean).length;
  const updateCommitment = (key: TerritoryKey, value: string) => {
    updateDay({ commitments: { ...dayData.commitments, [key]: value } });
  };
  const toggleBasic = (key: keyof DailyIntentions["basics"]) => {
    updateDay({ basics: { ...dayData.basics, [key]: !dayData.basics[key] } });
  };

  return (
    <div className="space-y-5">
      <PhaseSwitch
        value={phase}
        options={[
          { value: "plan", label: "Plan" },
          { value: "close", label: "Close" },
        ]}
        onChange={setPhase}
        prominent
      />

      {/* Day picker */}
      <div className="grid grid-cols-7 gap-1.5">
        {(weekStart === "sunday" ? ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const : DAYS).map((day) => {
          const score = Object.values(data.days[day]?.territories ?? {}).filter(Boolean).length;
          const isActive = activeDay === day;
          const isToday = day === todayKey;
          return (
            <button
              key={day}
              onClick={() => {
                setActiveDay(day);
                setPhase(defaultDailyPhase(daysAgo(day)));
              }}
              className="flex flex-col items-center py-2.5 rounded-xl transition-all duration-150 active:scale-95"
              style={{
                backgroundColor: isActive ? "var(--gold-bg)" : "transparent",
                border: isActive ? "1px solid var(--gold-border)" : "1px solid var(--border)",
              }}
            >
              <span
                className="text-[10px] font-mono tracking-wider mb-1"
                style={{ color: isActive ? "var(--gold)" : isToday ? "var(--gold-dim)" : "var(--text-dim)" }}
              >
                {DAY_LABELS[day].slice(0, 3)}
              </span>
              <span
                className="font-mono text-sm font-medium"
                style={{ color: isActive ? "var(--gold)" : score > 0 ? "var(--text)" : "var(--text-faint)" }}
              >
                {score}
              </span>
              {isToday && weekOffset === 0 && <span className="w-1 h-1 rounded-full" style={{backgroundColor: 'var(--gold)'}} />}
            </button>
          );
        })}
      </div>

      {/* Day score */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase">
          {phase === "plan" ? "Today's commitments" : "Commitment score"} — {DAY_LABELS[activeDay]}
        </p>
        <span className="font-mono text-sm" style={{color:"var(--gold)"}}>{dayScore}/5</span>
      </div>

      {/* Lock banner for old/future days */}
      {isLocked && (
        <div className="flex items-center justify-between rounded-xl px-4 py-3 border"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
          <span className="text-xs font-mono text-[--text-muted]">
            {isFuture
              ? "🔒 Plan now; close this day after it happens"
              : phase === "plan"
                ? `🔒 Past plan — ${activeDayAgo} ${activeDayAgo === 1 ? "day" : "days"} ago`
                : `🔒 ${activeDayAgo} days ago — read-only`}
          </span>
          {canUnlock && (
            <button
              onClick={unlockDay}
              className="text-xs font-mono px-3 py-1 rounded-lg transition-colors"
              style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--gold)" }}
            >
              Unlock
            </button>
          )}
        </div>
      )}

      {phase === "plan" ? (
        <div className={`space-y-3 ${isLocked ? "pointer-events-none opacity-50" : ""}`}>
          {carriedPriority && (
            <div className="rounded-xl border border-[--gold-border] bg-[--gold-bg] px-4 py-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[--gold]">Carried from yesterday</p>
              <p className="mt-1 text-sm text-[--text]">{carriedPriority}</p>
            </div>
          )}
          {TERRITORIES.map((territory) => (
            <CommitmentRow
              key={territory.key}
              territory={territory}
              value={dayData.commitments[territory.key]}
              placeholder={data.weekly.priorities[territory.key] || undefined}
              completed={dayData.territories[territory.key]}
              showCompletion={false}
              onChange={(value) => updateCommitment(territory.key, value)}
              onToggle={() => toggleTerritory(territory.key)}
            />
          ))}
          <p className="text-xs leading-5 text-[--text-faint]">
            Weekly priorities appear as suggestions. Write a concrete action you can finish today.
          </p>
        </div>
      ) : (
        <div className={`space-y-6 ${isLocked ? "pointer-events-none opacity-50" : ""}`}>
          <div className="space-y-3">
            {TERRITORIES.map((territory) => (
              <CommitmentRow
                key={territory.key}
                territory={territory}
                value={dayData.commitments[territory.key]}
                placeholder={data.weekly.priorities[territory.key] || undefined}
                completed={dayData.territories[territory.key]}
                showCompletion
                onChange={(value) => updateCommitment(territory.key, value)}
                onToggle={() => toggleTerritory(territory.key)}
              />
            ))}
          </div>

          <WolfCheck value={dayData.wolf} onChange={(wolf) => updateDay({ wolf })} />

          <div>
            <p className="mb-3 text-xs font-mono uppercase tracking-[0.15em] text-[--text-muted]">Basics</p>
            <div className="space-y-2">
              {BASIC_ITEMS.map((item) => (
                <BooleanTrackerRow
                  key={item.key}
                  label={item.label}
                  emoji={item.key === "ars" ? "🌅" : item.key === "cfo" ? "📈" : "⚡"}
                  checked={dayData.basics[item.key]}
                  onToggle={() => toggleBasic(item.key)}
                />
              ))}
            </div>
          </div>

          {activeTrackers.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-mono uppercase tracking-[0.15em] text-[--text-muted]">Optional trackers</p>
              <div className="space-y-2">
                {activeTrackers.map((tracker) => {
                  const value = getTrackerValue(dayData as unknown as Record<string, unknown>, tracker);
                  const setValue = (next: TrackerValue) => updateDay({ trackers: { ...dayData.trackers, [tracker.id]: next } });
                  if (tracker.type === "boolean") {
                    return (
                      <BooleanTrackerRow
                        key={tracker.id}
                        label={tracker.label}
                        emoji={tracker.emoji}
                        checked={Boolean(value)}
                        onToggle={() => setValue(!value)}
                      />
                    );
                  }
                  if (tracker.type === "rating") {
                    return (
                      <RatingTrackerRow
                        key={tracker.id}
                        label={tracker.label}
                        emoji={tracker.emoji}
                        value={Number(value)}
                        onChange={setValue}
                      />
                    );
                  }
                  return (
                    <CountCounter
                      key={tracker.id}
                      label={`${tracker.emoji} ${tracker.label} Today`}
                      value={Number(value)}
                      weeklyTotal={weeklyTrackerTotal(tracker)}
                      onChange={setValue}
                      weeklyNote={(total) => <>Weekly: {total}{tracker.unit ? ` ${tracker.unit}` : ""}</>}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <JournalField
              label="Gratitude"
              placeholder="What are you grateful for today?"
              value={dayData.gratitude}
              onChange={(gratitude) => updateDay({ gratitude })}
            />
            <JournalField
              label="Wins"
              placeholder="What did you win today?"
              value={dayData.wins}
              onChange={(wins) => updateDay({ wins })}
            />
            <JournalField
              label="Journal Notes"
              placeholder="Challenges, what happened today..."
              value={dayData.journal}
              onChange={(journal) => updateDay({ journal })}
            />
            <JournalField
              label="What could I have done better?"
              placeholder="Reflect honestly..."
              value={dayData.reflection}
              onChange={(reflection) => updateDay({ reflection })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function WeeklyTab({ data, onChange, trackerSettings, weekOffset = 0 }: { data: WeekData; onChange: (d: WeekData) => void; trackerSettings: TrackerSettings; weekOffset?: number }) {
  const [phase, setPhase] = useState<"plan" | "review">(weekOffset < 0 ? "review" : "plan");

  useEffect(() => {
    setPhase(weekOffset < 0 ? "review" : "plan");
  }, [weekOffset]);

  const updateWeekly = (patch: Partial<WeekData["weekly"]>) => {
    onChange({ ...data, weekly: { ...data.weekly, ...patch } });
  };

  const coreReflectionFields: { key: keyof WeekData["weekly"]; label: string; placeholder: string }[] = [
    { key: "biggestWin", label: "Biggest Win of the Week", placeholder: "The one win that stands above the rest..." },
    { key: "improve", label: "What could I have done better?", placeholder: "Be specific and useful..." },
    { key: "focusNext", label: "What will I do differently next week?", placeholder: "One clear change..." },
  ];
  const deeperReflectionFields: { key: keyof WeekData["weekly"]; label: string; placeholder: string }[] = [
    { key: "wins", label: "Other Wins", placeholder: "More wins from this week..." },
    { key: "gratitude", label: "Gratitude", placeholder: "Who or what am I grateful for?" },
    { key: "lessons", label: "Lessons / Challenges", placeholder: "What did I learn? What did I try and fail at?" },
    { key: "focusAchieved", label: "Did I achieve my focus & stretch from last week?", placeholder: "If not, why?" },
    { key: "stretchNext", label: "Stretch for the coming week", placeholder: "Push beyond comfort..." },
    { key: "onTrack", label: "Will I reach my goal if I continue this way?", placeholder: "" },
    { key: "cupOverflowing", label: "Is my cup overflowing?", placeholder: "Am I giving from abundance or depletion?" },
  ];

  return (
    <div className="space-y-6">
      <PhaseSwitch
        value={phase}
        options={[
          { value: "plan", label: "Plan" },
          { value: "review", label: "Review" },
        ]}
        onChange={setPhase}
      />

      {phase === "plan" ? (
        <>
          <div>
            <p className="mb-3 text-xs font-mono uppercase tracking-[0.15em] text-[--text-muted]">
              Priorities by territory
            </p>
            <div className="space-y-3">
              {TERRITORIES.map((territory) => (
                <CommitmentRow
                  key={territory.key}
                  territory={territory}
                  value={data.weekly.priorities[territory.key]}
                  completed={false}
                  showCompletion={false}
                  onChange={(value) => updateWeekly({
                    priorities: { ...data.weekly.priorities, [territory.key]: value },
                  })}
                  onToggle={() => undefined}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-mono uppercase tracking-[0.15em] text-[--text-muted]">
              Critical actions & habits
            </p>
            <p className="mb-3 mt-1 text-xs text-[--text-faint]">
              If these happen and nothing else does, the week still moves forward.
            </p>
            <div className="space-y-2">
              {data.weekly.criticalActions.map((action, index) => (
                <input
                  key={index}
                  value={action}
                  onChange={(event) => {
                    const criticalActions = [...data.weekly.criticalActions] as [string, string, string];
                    criticalActions[index] = event.target.value;
                    updateWeekly({ criticalActions });
                  }}
                  placeholder={`Critical action ${index + 1}`}
                  maxLength={180}
                  className="w-full rounded-xl border border-[--border] bg-[--bg-input] px-4 py-3 text-sm text-[--text] placeholder-[--text-faint] focus:border-[--gold-border] focus:outline-none"
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
      {/* Territory breakdown */}
      <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border] space-y-3">
        <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase">Territory Breakdown</p>
        {TERRITORIES.map((t) => {
          const score = calcTerritoryScore(data, t.key);
          const pct = (score / 7) * 100;
          return (
            <div key={t.key} className="flex items-center gap-3">
              <span className={`text-sm font-medium w-24 flex-shrink-0 ${t.textColor}`}>{t.label}</span>
              <div className="flex-1 h-2.5 bg-[--bg] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: t.color }}
                />
              </div>
              <span className="font-mono text-xs text-[--text-dim] w-8 text-right">{score}/7</span>
            </div>
          );
        })}
        <div className="pt-2 border-t border-[--border] space-y-2">
        {enabledTrackers(trackerSettings).map((tracker) => {
          const values = DAYS.map((day) => getTrackerValue(data.days[day] as unknown as Record<string, unknown>, tracker));
          const summary = tracker.type === "boolean"
            ? `${values.filter(Boolean).length}/7 achieved`
            : tracker.type === "rating"
              ? (() => {
                  const rated = values.map(Number).filter((value) => value > 0);
                  return rated.length ? `${(rated.reduce((sum, value) => sum + value, 0) / rated.length).toFixed(1)}/5 average` : "No ratings";
                })()
              : `${values.reduce<number>((sum, value) => sum + Number(value), 0)}${tracker.unit ? ` ${tracker.unit}` : ""} this week`;
          return (
            <div key={tracker.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-[--text-muted]">{tracker.emoji} {tracker.label}</span>
              <span className="font-mono text-xs text-[--text] text-right">{summary}</span>
            </div>
          );
        })}
        </div>
      </div>

      {coreReflectionFields.map(({ key, label, placeholder }) => (
        <JournalField
          key={key}
          label={label}
          placeholder={placeholder}
          value={String(data.weekly[key])}
          onChange={(v) => updateWeekly({ [key]: v })}
        />
      ))}
          <details className="rounded-xl border border-[--border] bg-[--bg-card] px-4 py-3">
            <summary className="cursor-pointer text-xs font-mono uppercase tracking-[0.12em] text-[--text-muted]">
              Go deeper
            </summary>
            <div className="mt-4 space-y-4">
              {deeperReflectionFields.map(({ key, label, placeholder }) => (
                <JournalField
                  key={key}
                  label={label}
                  placeholder={placeholder}
                  value={String(data.weekly[key])}
                  onChange={(value) => updateWeekly({ [key]: value })}
                />
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function ExportTab({
  data,
  user,
  trackerSettings,
}: {
  data: WeekData;
  user: User | null;
  trackerSettings: TrackerSettings;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedPlain, setCopiedPlain] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const initialDate = new Date(data.weekOf.includes("T") ? data.weekOf : `${data.weekOf}T12:00:00Z`);
  const initialYear = initialDate.getUTCFullYear();
  const [reviewPeriod, setReviewPeriod] = useState<ReviewPeriod>("month");
  const [reviewMonth, setReviewMonth] = useState(data.weekOf.slice(0, 7));
  const [reviewQuarter, setReviewQuarter] = useState(Math.floor(initialDate.getUTCMonth() / 3) + 1);
  const [reviewYear, setReviewYear] = useState(initialYear);
  const [customStart, setCustomStart] = useState(`${initialYear}-01-01`);
  const [customEnd, setCustomEnd] = useState(isoDate(new Date()));
  const [reviewDownloading, setReviewDownloading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const report = generateReport(data, trackerSettings);

  const handleSendEmail = async () => {
    if (!user) return;
    setEmailSending(true);
    setEmailResult(null);
    setEmailError(null);
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, weekOf: new Date(data.weekOf).toISOString().slice(0, 10), includePdf: true }),
      });
      const json = await res.json();
      if (res.ok) {
        setEmailResult(`Sent to ${json.email}`);
        setTimeout(() => setEmailResult(null), 4000);
      } else {
        setEmailError(json.error || "Failed to send");
        setTimeout(() => setEmailError(null), 4000);
      }
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Failed to send");
      setTimeout(() => setEmailError(null), 4000);
    }
    setEmailSending(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyPlain = async () => {
    const { plain, html } = generatePlainReportHtml(data, trackerSettings);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(plain);
    }
    setCopiedPlain(true);
    setTimeout(() => setCopiedPlain(false), 2000);
  };

  const handleSqlDump = () => {
    if (!user) return;
    const supabase = createClient();
    downloadSqlDump(user, supabase);
  };

  const handleConsolidatedPdf = async () => {
    const range = reviewPeriodRange(reviewPeriod, {
      month: reviewMonth, quarter: reviewQuarter, year: reviewYear, customStart, customEnd,
    });
    if (!range.start || !range.end || range.start > range.end) {
      setReviewError("Choose a valid date range.");
      return;
    }
    setReviewDownloading(true);
    setReviewError(null);
    try {
      const params = new URLSearchParams({ start: range.start, end: range.end, label: range.label });
      const response = await fetch(`/api/pdf/consolidated?${params}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Could not generate the review PDF");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `coil-review-${range.start}-${range.end}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Could not generate the review PDF");
    } finally {
      setReviewDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-[--text-muted] leading-relaxed mb-4">
          Week of {new Date(data.weekOf).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. Use AI Chat format for Claude/ChatGPT, or Rich Copy for TPM and similar apps.
        </p>
        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-mono text-sm tracking-[0.1em] uppercase font-medium transition-all duration-200 active:scale-[0.98]"
          style={{ backgroundColor: "var(--gold)", color: "var(--bg)" }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Copied!" : "Copy for AI Chat"}
        </button>
        <button
          onClick={handleCopyPlain}
          className="w-full flex items-center justify-center gap-2.5 py-4 mt-2 rounded-2xl font-mono text-sm tracking-[0.1em] uppercase font-medium border transition-all duration-200 active:scale-[0.98]"
          style={{ borderColor: "var(--gold)", color: "var(--gold)", backgroundColor: "transparent" }}
        >
          {copiedPlain ? <Check size={16} /> : <Copy size={16} />}
          {copiedPlain ? "Copied!" : "Rich Copy (for TPM)"}
        </button>
        {user && (
          <button
            onClick={() => {
              const weekOf = new Date(data.weekOf).toISOString().slice(0, 10);
              window.location.href = `/api/pdf/download?weekOf=${weekOf}`;
            }}
            className="w-full flex items-center justify-center gap-2.5 py-4 mt-2 rounded-2xl font-mono text-sm tracking-[0.1em] uppercase font-medium border transition-all duration-200 active:scale-[0.98]"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "transparent" }}
          >
            <Download size={16} />
            Download PDF
          </button>
        )}
        {user && (
          <div className="mt-2">
            <button
              onClick={handleSendEmail}
              disabled={emailSending}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-mono text-sm tracking-[0.1em] uppercase font-medium border transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "transparent" }}
            >
              <Mail size={16} />
              {emailSending ? "Sending…" : "Send Email"}
            </button>
            {emailResult && (
              <p className="text-center text-xs font-mono text-[--text-faint] mt-1.5">{emailResult}</p>
            )}
            {emailError && (
              <p className="text-center text-xs font-mono mt-1.5" style={{ color: "var(--error, #e55)" }}>{emailError}</p>
            )}
          </div>
        )}
        {user && (
          <div className="mt-2 rounded-2xl border border-[--border] p-3 space-y-2">
            <p className="text-xs text-[--text-faint] font-mono uppercase tracking-[0.1em]">Consolidated Review PDF</p>
            <select
              aria-label="Review period"
              value={reviewPeriod}
              onChange={(event) => setReviewPeriod(event.target.value as ReviewPeriod)}
              className="w-full rounded-xl border border-[--border] bg-[--bg-input] px-3 py-3 text-sm text-[--text]"
            >
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
              <option value="ytd">Year to date</option>
              <option value="year">Whole year</option>
              <option value="custom">Custom range</option>
            </select>
            {reviewPeriod === "month" && (
              <input
                aria-label="Review month"
                type="month"
                value={reviewMonth}
                onChange={(event) => setReviewMonth(event.target.value)}
                className="w-full rounded-xl border border-[--border] bg-[--bg-input] px-3 py-3 text-sm text-[--text]"
              />
            )}
            {reviewPeriod === "quarter" && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label="Review quarter"
                  value={reviewQuarter}
                  onChange={(event) => setReviewQuarter(Number(event.target.value))}
                  className="rounded-xl border border-[--border] bg-[--bg-input] px-3 py-3 text-sm text-[--text]"
                >
                  {[1, 2, 3, 4].map((quarter) => <option key={quarter} value={quarter}>Q{quarter}</option>)}
                </select>
                <input
                  aria-label="Review year"
                  type="number"
                  min="2000"
                  max="2100"
                  value={reviewYear}
                  onChange={(event) => setReviewYear(Number(event.target.value))}
                  className="rounded-xl border border-[--border] bg-[--bg-input] px-3 py-3 text-sm text-[--text]"
                />
              </div>
            )}
            {(reviewPeriod === "ytd" || reviewPeriod === "year") && (
              <input
                aria-label="Review year"
                type="number"
                min="2000"
                max="2100"
                value={reviewYear}
                onChange={(event) => setReviewYear(Number(event.target.value))}
                className="w-full rounded-xl border border-[--border] bg-[--bg-input] px-3 py-3 text-sm text-[--text]"
              />
            )}
            {reviewPeriod === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="Review start date"
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="rounded-xl border border-[--border] bg-[--bg-input] px-3 py-3 text-sm text-[--text]"
                />
                <input
                  aria-label="Review end date"
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="rounded-xl border border-[--border] bg-[--bg-input] px-3 py-3 text-sm text-[--text]"
                />
              </div>
            )}
            <button
              onClick={handleConsolidatedPdf}
              disabled={reviewDownloading}
              className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-mono text-xs tracking-[0.1em] uppercase font-medium transition-all active:scale-[0.98] disabled:opacity-40"
              style={{ backgroundColor: "var(--gold)", color: "var(--bg)" }}
            >
              <Download size={15} />
              {reviewDownloading ? "Building PDF…" : "Download Consolidated PDF"}
            </button>
            {reviewError && <p className="text-center text-xs" style={{ color: "var(--error, #e55)" }}>{reviewError}</p>}
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="bg-[--bg-input] rounded-2xl p-4 border border-[--border] overflow-auto max-h-64">
        <pre className="text-xs text-[--text-dim] font-mono whitespace-pre-wrap leading-relaxed">{report}</pre>
      </div>

      {/* Global data export */}
      {user && (
        <div className="border-t border-[--border] pt-4">
          <p className="text-xs text-[--text-faint] font-mono uppercase tracking-[0.1em] mb-3">All Data</p>
          <button
            onClick={handleSqlDump}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-mono text-sm tracking-[0.1em] uppercase font-medium border transition-all duration-200 active:scale-[0.98]"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "transparent" }}
          >
            <Download size={16} />
            Download SQL Dump (all weeks)
          </button>
        </div>
      )}
    </div>
  );
}

function PastWeeksTab({ archive }: { archive: ArchivedWeek[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (archive.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-[--text-dim] text-sm">No archived weeks yet.</p>
        <p className="text-[--text-faint] text-xs mt-2">
          Past weeks appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {[...archive].reverse().map((week) => {
        const score = calcScore(week.data);
        const isOpen = expanded === week.weekOf;
        return (
          <div key={week.weekOf} className="bg-[--bg-card] rounded-2xl border border-[--border] overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : week.weekOf)}
              className="w-full flex items-center justify-between px-4 py-4"
            >
              <div className="text-left">
                <p className="text-sm font-medium">Week of {formatWeekOf(new Date(week.weekOf))}</p>
                <p className="text-xs font-mono text-[--text-muted] mt-0.5">{score}/{TOTAL_POSSIBLE} points</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-24 bg-[--bg] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(score / TOTAL_POSSIBLE) * 100}%`, backgroundColor: "var(--gold)" }}
                  />
                </div>
                {isOpen ? <ChevronUp size={16} className="text-[--text-dim]" /> : <ChevronDown size={16} className="text-[--text-dim]" />}
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-[--border] pt-3">
                {TERRITORIES.map((t) => {
                  const s = calcTerritoryScore(week.data, t.key);
                  return (
                    <div key={t.key} className="flex items-center gap-3">
                      <span className={`text-xs w-24 flex-shrink-0 ${t.textColor}`}>{t.label}</span>
                      <div className="flex-1 h-1 bg-[--bg] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s / 7) * 100}%`, backgroundColor: t.color }} />
                      </div>
                      <span className="font-mono text-xs text-[--text-dim]">{s}/7</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function normalizeCycle(value: Partial<CycleData> | null | undefined): CycleData {
  const fallback = createDefaultCycle();
  return {
    startsOn: typeof value?.startsOn === "string" ? value.startsOn : fallback.startsOn,
    endsOn: typeof value?.endsOn === "string" ? value.endsOn : fallback.endsOn,
    mustWin: typeof value?.mustWin === "string" ? value.mustWin : "",
    territories: Object.fromEntries(
      TERRITORY_KEYS.map((key) => [
        key,
        {
          outcome: typeof value?.territories?.[key]?.outcome === "string" ? value.territories[key].outcome : "",
          keystoneHabit: typeof value?.territories?.[key]?.keystoneHabit === "string"
            ? value.territories[key].keystoneHabit
            : "",
        },
      ]),
    ) as CycleData["territories"],
  };
}

function CycleTab({ user }: { user: User | null }) {
  const [cycle, setCycle] = useState<CycleData>(() => {
    if (typeof window === "undefined" || user) return createDefaultCycle();
    try {
      const saved = localStorage.getItem("coil_active_cycle");
      return normalizeCycle(saved ? JSON.parse(saved) as Partial<CycleData> : null);
    } catch {
      return createDefaultCycle();
    }
  });
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const supabase = createClient();
    supabase
      .from("cycles")
      .select("id, starts_on, ends_on, must_win, territories")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setSaveError("Cycle storage will be available after the database migration.");
        if (data) {
          setCycleId(data.id);
          setCycle(normalizeCycle({
            startsOn: data.starts_on,
            endsOn: data.ends_on,
            mustWin: data.must_win,
            territories: data.territories,
          }));
        }
        setLoading(false);
      });
  }, [user]);

  const saveCycle = async () => {
    if (!cycle.startsOn || !cycle.endsOn || cycle.endsOn < cycle.startsOn) {
      setSaveStatus("error");
      setSaveError("The cycle end date must be on or after its start date.");
      return;
    }
    setSaveStatus("saving");
    setSaveError(null);
    if (!user) {
      localStorage.setItem("coil_active_cycle", JSON.stringify(cycle));
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
      return;
    }

    const payload = {
        user_id: user.id,
        starts_on: cycle.startsOn,
        ends_on: cycle.endsOn,
        must_win: cycle.mustWin,
        territories: cycle.territories,
        status: "active",
        updated_at: new Date().toISOString(),
      };
    const supabase = createClient();
    const query = cycleId
      ? supabase.from("cycles").update(payload).eq("id", cycleId)
      : supabase.from("cycles").insert(payload);
    const { data: saved, error } = await query.select("id").single();

    if (error) {
      setSaveStatus("error");
      setSaveError(error.message);
      return;
    }
    setCycleId(saved.id);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 1500);
  };

  if (loading) {
    return <p className="py-10 text-center text-xs font-mono uppercase tracking-[0.15em] text-[--text-faint]">Loading cycle…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-[0.15em] text-[--text-muted]">30-day cycle</p>
        <p className="mt-1 text-sm text-[--text-faint]">Define the outcomes. Daily commitments are how you prove them.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-[--text-muted]">
          <span className="mb-1 block font-mono uppercase tracking-[0.1em]">Starts</span>
          <input
            type="date"
            value={cycle.startsOn}
            onChange={(event) => setCycle({ ...cycle, startsOn: event.target.value })}
            className="w-full rounded-xl border border-[--border] bg-[--bg-input] px-3 py-2.5 text-sm text-[--text] focus:border-[--gold-border] focus:outline-none"
          />
        </label>
        <label className="text-xs text-[--text-muted]">
          <span className="mb-1 block font-mono uppercase tracking-[0.1em]">Ends</span>
          <input
            type="date"
            value={cycle.endsOn}
            min={cycle.startsOn}
            onChange={(event) => setCycle({ ...cycle, endsOn: event.target.value })}
            className="w-full rounded-xl border border-[--border] bg-[--bg-input] px-3 py-2.5 text-sm text-[--text] focus:border-[--gold-border] focus:outline-none"
          />
        </label>
      </div>

      <JournalField
        label="The one thing I must accomplish"
        placeholder="The must-win for this cycle..."
        value={cycle.mustWin}
        onChange={(mustWin) => setCycle((current) => ({ ...current, mustWin }))}
      />

      <div className="space-y-4">
        {TERRITORIES.map((territory) => (
          <div key={territory.key} className="rounded-2xl border border-[--border] bg-[--bg-card] p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: territory.color }} />
              <p className="text-xs font-mono uppercase tracking-[0.15em]" style={{ color: territory.color }}>
                {territory.label}
              </p>
            </div>
            <div className="space-y-3">
              <input
                value={cycle.territories[territory.key].outcome}
                onChange={(event) => setCycle({
                  ...cycle,
                  territories: {
                    ...cycle.territories,
                    [territory.key]: {
                      ...cycle.territories[territory.key],
                      outcome: event.target.value,
                    },
                  },
                })}
                placeholder="Outcome"
                maxLength={240}
                className="w-full rounded-xl border border-[--border] bg-[--bg-input] px-3 py-2.5 text-sm text-[--text] placeholder-[--text-faint] focus:border-[--gold-border] focus:outline-none"
              />
              <input
                value={cycle.territories[territory.key].keystoneHabit}
                onChange={(event) => setCycle({
                  ...cycle,
                  territories: {
                    ...cycle.territories,
                    [territory.key]: {
                      ...cycle.territories[territory.key],
                      keystoneHabit: event.target.value,
                    },
                  },
                })}
                placeholder="Keystone habit"
                maxLength={180}
                className="w-full rounded-xl border border-[--border] bg-[--bg-input] px-3 py-2.5 text-sm text-[--text] placeholder-[--text-faint] focus:border-[--gold-border] focus:outline-none"
              />
            </div>
          </div>
        ))}
      </div>

      {saveError && <p className="text-sm text-red-400">{saveError}</p>}
      <button
        type="button"
        onClick={saveCycle}
        disabled={saveStatus === "saving" || !cycle.startsOn || !cycle.endsOn || cycle.endsOn < cycle.startsOn}
        className="w-full rounded-2xl py-4 text-sm font-mono uppercase tracking-[0.12em] disabled:opacity-50"
        style={{ backgroundColor: "var(--gold)", color: "var(--bg)" }}
      >
        {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Save cycle"}
      </button>
    </div>
  );
}

const QUARTERLY_REVIEW_PROMPTS = [
  ["accomplished", "What did I accomplish this quarter?"],
  ["setbacks", "What were my major setbacks or challenges?"],
  ["continue", "What practices should I continue?"],
  ["focus", "Which territory needs greater focus?"],
  ["lessons", "What were the major lessons?"],
  ["feeling", "How do I want to feel over the next three months?"],
  ["oneThing", "What one outcome would meaningfully change my life next quarter?"],
  ["steps", "What concrete steps will achieve it?"],
] as const;

function ReviewTab({
  user,
  data,
  onChange,
  archive,
  trackerSettings,
}: {
  user: User | null;
  data: WeekData;
  onChange: (data: WeekData) => void;
  archive: ArchivedWeek[];
  trackerSettings: TrackerSettings;
}) {
  const now = new Date();
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const defaultReviewMonth = `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, "0")}`;
  const [type, setType] = useState<ReviewType>("month");
  const [monthlyPhase, setMonthlyPhase] = useState<"review" | "plan">("review");
  const [month, setMonth] = useState(defaultReviewMonth);
  const [quarterYear, setQuarterYear] = useState(now.getUTCFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getUTCMonth() / 3) + 1);
  const [review, setReview] = useState<ReviewData>(() => ({
    responses: {},
    plan: emptyMonthlyPlan(nextMonthKey(defaultReviewMonth)),
  }));
  const [reviewCycle, setReviewCycle] = useState<CycleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState(false);
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const safeMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : defaultReviewMonth;
  const safeQuarterYear = Number.isInteger(quarterYear) && quarterYear >= 2020 && quarterYear <= 2100
    ? quarterYear
    : now.getUTCFullYear();
  const periodKey = type === "month" ? safeMonth : `${safeQuarterYear}-Q${quarter}`;
  const period = getReviewPeriod(type, periodKey);
  const targetMonth = type === "month" ? nextMonthKey(safeMonth) : currentMonth;

  useEffect(() => {
    let cancelled = false;
    const loadReview = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setSaveError(null);
      setReviewCycle(null);
      if (!user) {
        try {
          const saved = localStorage.getItem(`coil_review_${type}_${periodKey}`);
          const parsed = saved ? JSON.parse(saved) as unknown : {};
          setReview(type === "month"
            ? decodeStoredReview(parsed, targetMonth)
            : { responses: parsed && typeof parsed === "object" && "responses" in parsed
              ? (parsed as ReviewData).responses
              : parsed as Record<string, string> });
          if (type === "month") {
            const cycleValue = localStorage.getItem("coil_active_cycle");
            if (cycleValue) {
              const cycle = normalizeCycle(JSON.parse(cycleValue) as Partial<CycleData>);
              if (cycle.startsOn <= period.endsOn && cycle.endsOn >= period.startsOn) setReviewCycle(cycle);
              const targetRange = monthRange(targetMonth);
              if (cycle.startsOn === targetRange.startsOn && cycle.endsOn === targetRange.endsOn) {
                setReview((current) => ({
                  ...current,
                  plan: mergeMonthlyPlanWithCycle(current.plan ?? emptyMonthlyPlan(targetMonth), cycle),
                }));
              }
            }
          }
        } catch {
          setReview(type === "month"
            ? { responses: {}, plan: emptyMonthlyPlan(targetMonth) }
            : { responses: {} });
        }
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const targetRange = monthRange(targetMonth);
      const [savedResult, cycleResult, planCycleResult] = await Promise.all([
        supabase
          .from("period_reviews")
          .select("responses")
          .eq("user_id", user.id)
          .eq("review_type", type)
          .eq("starts_on", period.startsOn)
          .maybeSingle(),
        type === "month"
          ? supabase
              .from("cycles")
              .select("starts_on, ends_on, must_win, territories")
              .eq("user_id", user.id)
              .lte("starts_on", period.endsOn)
              .gte("ends_on", period.startsOn)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        type === "month"
          ? supabase
              .from("cycles")
              .select("starts_on, ends_on, must_win, territories")
              .eq("user_id", user.id)
              .eq("starts_on", targetRange.startsOn)
              .eq("ends_on", targetRange.endsOn)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (cancelled) return;
      if (savedResult.error) setSaveError("Review storage will be available after the database migration.");
      const targetCycle = planCycleResult.data ? normalizeCycle({
        startsOn: planCycleResult.data.starts_on,
        endsOn: planCycleResult.data.ends_on,
        mustWin: planCycleResult.data.must_win,
        territories: planCycleResult.data.territories,
      }) : null;
      setReview(type === "month"
        ? (() => {
            const saved = decodeStoredReview(savedResult.data?.responses, targetMonth);
            return { ...saved, plan: mergeMonthlyPlanWithCycle(saved.plan ?? emptyMonthlyPlan(targetMonth), targetCycle) };
          })()
        : { responses: savedResult.data?.responses && typeof savedResult.data.responses === "object"
          ? savedResult.data.responses as Record<string, string>
          : {} });
      if (cycleResult.data) {
        setReviewCycle(normalizeCycle({
          startsOn: cycleResult.data.starts_on,
          endsOn: cycleResult.data.ends_on,
          mustWin: cycleResult.data.must_win,
          territories: cycleResult.data.territories,
        }));
      }
      setLoading(false);
    };
    void loadReview();
    return () => {
      cancelled = true;
    };
  }, [periodKey, type, user, targetMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const allWeeks: MonthlyWeek[] = [
    { weekOf: data.weekOf, days: data.days },
    ...archive,
  ].map((week) => "days" in week ? week : ({ weekOf: week.weekOf, days: week.data.days }))
    .filter((week, index, weeks) =>
    weeks.findIndex((candidate) => candidate.weekOf === week.weekOf) === index
  );
  const today = isoDate(new Date());
  const monthlyEvidence = buildMonthlyEvidence(allWeeks, safeMonth, trackerSettings, today);
  const previousEvidence = buildMonthlyEvidence(allWeeks, (() => {
    const date = new Date(`${safeMonth}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - 1);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  })(), trackerSettings, today);
  const selectedDays = collectPeriodDays(allWeeks, period.startsOn, period.endsOn, today);
  const trackedPeriodDays = selectedDays.filter((day) => hasRecordedActivity(day.data));
  const totalScore = trackedPeriodDays.reduce(
    (sum, day) => sum + Object.values(day.data.territories ?? {}).filter(Boolean).length,
    0,
  );
  const possibleScore = trackedPeriodDays.length * 5;
  const territoryTotals = Object.fromEntries(
    TERRITORY_KEYS.map((key) => [
      key,
      trackedPeriodDays.filter((day) => day.data.territories?.[key]).length,
    ]),
  ) as Record<TerritoryKey, number>;
  const prompts = type === "month" ? MONTHLY_REVIEW_PROMPTS : QUARTERLY_REVIEW_PROMPTS;

  const saveReview = async (applyPlan = false) => {
    setSaveStatus("saving");
    setSaveError(null);
    let reviewToSave = review;
    let cycleToApply: CycleData | null = null;
    if (applyPlan && type === "month" && review.plan) {
      const planRange = monthRange(review.plan.targetMonth);
      let existingCycle: CycleData | null = null;
      if (!user) {
        try {
          const value = localStorage.getItem("coil_active_cycle");
          if (value) {
            const candidate = normalizeCycle(JSON.parse(value) as Partial<CycleData>);
            if (candidate.startsOn === planRange.startsOn && candidate.endsOn === planRange.endsOn) existingCycle = candidate;
          }
        } catch {}
      } else {
        const { data: existing } = await createClient().from("cycles")
          .select("starts_on, ends_on, must_win, territories")
          .eq("user_id", user.id)
          .eq("starts_on", planRange.startsOn)
          .eq("ends_on", planRange.endsOn)
          .maybeSingle();
        if (existing) existingCycle = normalizeCycle({
          startsOn: existing.starts_on,
          endsOn: existing.ends_on,
          mustWin: existing.must_win,
          territories: existing.territories,
        });
      }
      const mergedPlan = mergeMonthlyPlanWithCycle(review.plan, existingCycle);
      reviewToSave = { ...review, plan: mergedPlan };
      cycleToApply = {
        startsOn: planRange.startsOn,
        endsOn: planRange.endsOn,
        mustWin: mergedPlan.responses.mustWin ?? "",
        territories: mergedPlan.territories,
      };
      setReview(reviewToSave);
    }
    const snapshot = type === "month" ? monthlyEvidence : {
      days: trackedPeriodDays.length, score: totalScore, possible: possibleScore, territories: territoryTotals,
    };
    const storedResponses = type === "month" ? encodeStoredReview(reviewToSave) : review.responses;
    if (!user) {
      localStorage.setItem(`coil_review_${type}_${periodKey}`, JSON.stringify(storedResponses));
    } else {
      const { error } = await createClient().from("period_reviews").upsert({
        user_id: user.id,
        review_type: type,
        starts_on: period.startsOn,
        ends_on: period.endsOn,
        responses: storedResponses,
        snapshot,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,review_type,starts_on" });
      if (error) {
        setSaveStatus("error");
        setSaveError(error.message);
        return;
      }
    }

    if (cycleToApply) {
      const cycle = cycleToApply;
      const planRange = { startsOn: cycle.startsOn, endsOn: cycle.endsOn };
      if (!user) {
        localStorage.setItem("coil_active_cycle", JSON.stringify(cycle));
      } else {
        const { error } = await createClient().from("cycles").upsert({
          user_id: user.id,
          starts_on: cycle.startsOn,
          ends_on: cycle.endsOn,
          must_win: cycle.mustWin,
          territories: cycle.territories,
          status: "active",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,starts_on,ends_on" });
        if (error) {
          setSaveStatus("error");
          setSaveError(error.message);
          return;
        }
      }
      const weekStartDate = new Date(data.weekOf);
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
      if (isoDate(weekStartDate) <= planRange.endsOn && isoDate(weekEndDate) >= planRange.startsOn) {
        onChange({
          ...data,
          weekly: {
            ...data.weekly,
            priorities: Object.fromEntries(TERRITORY_KEYS.map((key) => [
              key,
              cycle.territories[key].outcome.trim() || data.weekly.priorities[key],
            ])) as Record<TerritoryKey, string>,
          },
        });
      }
    }
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 1500);
  };

  const updatePlan = (updater: (plan: MonthlyPlan) => MonthlyPlan) => {
    setReview((current) => ({
      ...current,
      plan: updater(current.plan ?? emptyMonthlyPlan(targetMonth)),
    }));
  };

  const copyMonthlyReport = async () => {
    await navigator.clipboard.writeText(monthlyReportText(period.label, monthlyEvidence, review, reviewCycle));
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 1500);
  };

  const currentRate = monthlyEvidence.possible ? monthlyEvidence.score / monthlyEvidence.possible : null;
  const previousRate = previousEvidence.possible ? previousEvidence.score / previousEvidence.possible : null;
  const rateDelta = currentRate !== null && previousRate !== null ? Math.round((currentRate - previousRate) * 100) : null;

  return (
    <div className="space-y-6">
      <PhaseSwitch
        value={type}
        options={[
          { value: "month", label: "Month" },
          { value: "quarter", label: "Quarter" },
        ]}
        onChange={setType}
      />

      {type === "month" ? (
        <div className="space-y-3">
          <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[--text-muted]">
            Review month
            <input
              type="month"
              value={month}
              onChange={(event) => { if (event.target.value) setMonth(event.target.value); }}
              className="mt-2 w-full rounded-xl border border-[--border] bg-[--bg-input] px-4 py-3 text-sm text-[--text] focus:border-[--gold-border] focus:outline-none"
            />
          </label>
          <PhaseSwitch
            value={monthlyPhase}
            options={[{ value: "review", label: "Review" }, { value: "plan", label: "Plan next month" }]}
            onChange={setMonthlyPhase}
            prominent
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <select
            value={quarter}
            onChange={(event) => setQuarter(Number(event.target.value))}
            className="rounded-xl border border-[--border] bg-[--bg-input] px-4 py-3 text-sm text-[--text] focus:border-[--gold-border] focus:outline-none"
          >
            {[1, 2, 3, 4].map((value) => <option key={value} value={value}>Q{value}</option>)}
          </select>
          <input
            type="number"
            value={quarterYear}
            min={2020}
            max={2100}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value)) setQuarterYear(value);
            }}
            className="rounded-xl border border-[--border] bg-[--bg-input] px-4 py-3 text-sm text-[--text] focus:border-[--gold-border] focus:outline-none"
          />
        </div>
      )}

      {type === "month" ? (
        <>
          <div className="rounded-2xl border border-[--border] bg-[--bg-card] p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.15em] text-[--text-muted]">{period.label} evidence</p>
                <p className="mt-1 text-xs text-[--text-faint]">
                  {monthlyEvidence.trackedDays}/{monthlyEvidence.elapsedDays} days with recorded activity
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-xl text-[--gold]">{monthlyEvidence.score}/{monthlyEvidence.possible}</p>
                {rateDelta !== null && <p className="text-xs text-[--text-faint]">{rateDelta >= 0 ? "+" : ""}{rateDelta} pts vs prior month</p>}
              </div>
            </div>
            {monthlyEvidence.trackedDays === 0 && (
              <p className="mt-4 rounded-xl border border-[--border] bg-[--bg] p-3 text-sm text-[--text-muted]">
                No tracked days found. You can still complete the review from memory; the app will not pretend missing days were failures.
              </p>
            )}
            <div className="mt-4 space-y-3 border-t border-[--border] pt-4">
              {TERRITORIES.map((territory) => (
                <div key={territory.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: territory.color }}>{territory.label}</span>
                    <span className="font-mono text-xs text-[--text-muted]">
                      {monthlyEvidence.territoryTotals[territory.key]}/{monthlyEvidence.elapsedDays}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[--text-faint]">
                    Commitments: {monthlyEvidence.commitmentsCompleted[territory.key]}/{monthlyEvidence.commitmentsPlanned[territory.key]} completed
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[--border] bg-[--bg-card] p-4 space-y-4">
            <p className="text-xs font-mono uppercase tracking-[0.15em] text-[--text-muted]">Patterns</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[{ label: "ARS", value: monthlyEvidence.basics.ars }, { label: "AD", value: monthlyEvidence.basics.ad }, { label: "CFO", value: monthlyEvidence.basics.cfo }].map((item) => (
                <div key={item.label} className="rounded-xl bg-[--bg] p-3">
                  <p className="font-mono text-lg text-[--gold]">{item.value}</p>
                  <p className="text-[10px] uppercase text-[--text-faint]">{item.label}</p>
                </div>
              ))}
            </div>
            {monthlyEvidence.trackers.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {monthlyEvidence.trackers.map((tracker) => (
                  <div key={tracker.id} className="flex items-center justify-between rounded-xl bg-[--bg] px-3 py-2 text-sm">
                    <span>{tracker.emoji} {tracker.label}</span><span className="font-mono text-xs text-[--gold]">{tracker.summary}</span>
                  </div>
                ))}
              </div>
            )}
            {monthlyEvidence.weeklyTrend.length > 0 && (
              <div className="space-y-2 border-t border-[--border] pt-3">
                <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-[--text-faint]">Weekly trend</p>
                {monthlyEvidence.weeklyTrend.map((week) => (
                  <div key={week.startsOn} className="flex justify-between text-sm">
                    <span className="text-[--text-muted]">Week of {new Date(`${week.startsOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    <span className="font-mono text-xs">{week.score}/{week.possible} · {week.trackedDays}d</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border p-4" style={{ borderColor: reviewCycle ? "var(--gold-border)" : "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <p className="text-xs font-mono uppercase tracking-[0.15em] text-[--text-muted]">Goals context</p>
            {reviewCycle ? (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-[--text]">{reviewCycle.mustWin || "No must-win recorded"}</p>
                {TERRITORIES.filter((territory) => reviewCycle.territories[territory.key].outcome).map((territory) => (
                  <p key={territory.key} className="text-xs text-[--text-muted]"><span style={{ color: territory.color }}>{territory.label}:</span> {reviewCycle.territories[territory.key].outcome}</p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-[--text-muted]">
                No goals were set for {period.label}. That is not a blocker—review what actually happened, then use Plan to create the next month.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-[--border] bg-[--bg-card] p-4">
          <div className="flex items-end justify-between">
            <div><p className="text-xs font-mono uppercase tracking-[0.15em] text-[--text-muted]">{period.label}</p><p className="mt-1 text-xs text-[--text-faint]">{trackedPeriodDays.length} tracked days</p></div>
            <p className="font-mono text-xl text-[--gold]">{totalScore}/{possibleScore}</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-xs font-mono uppercase tracking-[0.15em] text-[--text-faint]">Loading review…</p>
      ) : type === "month" && monthlyPhase === "plan" ? (
        <div className="space-y-5">
          <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[--text-muted]">
            Plan month
            <input
              type="month"
              value={review.plan?.targetMonth ?? targetMonth}
              onChange={(event) => { if (event.target.value) updatePlan((plan) => ({ ...plan, targetMonth: event.target.value })); }}
              className="mt-2 w-full rounded-xl border border-[--border] bg-[--bg-input] px-4 py-3 text-sm text-[--text]"
            />
          </label>
          <p className="text-sm text-[--text-muted]">
            {period.label} Review → {monthRange(review.plan?.targetMonth ?? targetMonth).label} Plan
          </p>
          {MONTHLY_PLAN_PROMPTS.map(([key, label]) => (
            <JournalField
              key={key}
              label={label}
              placeholder="Make it concrete..."
              value={review.plan?.responses[key] ?? ""}
              onChange={(value) => updatePlan((plan) => ({ ...plan, responses: { ...plan.responses, [key]: value } }))}
            />
          ))}
          <div className="space-y-3">
            <p className="text-xs font-mono uppercase tracking-[0.15em] text-[--text-muted]">Territory outcomes → Week → Day</p>
            {TERRITORIES.map((territory) => (
              <div key={territory.key} className="rounded-2xl border border-[--border] bg-[--bg-card] p-4 space-y-2">
                <p className="text-xs font-mono uppercase tracking-[0.12em]" style={{ color: territory.color }}>{territory.label}</p>
                <input
                  value={review.plan?.territories[territory.key].outcome ?? ""}
                  onChange={(event) => updatePlan((plan) => ({ ...plan, territories: { ...plan.territories, [territory.key]: { ...plan.territories[territory.key], outcome: event.target.value } } }))}
                  placeholder="Outcome / priority"
                  className="w-full rounded-xl border border-[--border] bg-[--bg-input] px-3 py-2.5 text-sm text-[--text]"
                />
                <input
                  value={review.plan?.territories[territory.key].keystoneHabit ?? ""}
                  onChange={(event) => updatePlan((plan) => ({ ...plan, territories: { ...plan.territories, [territory.key]: { ...plan.territories[territory.key], keystoneHabit: event.target.value } } }))}
                  placeholder="Keystone habit"
                  className="w-full rounded-xl border border-[--border] bg-[--bg-input] px-3 py-2.5 text-sm text-[--text]"
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        prompts.map(([key, label]) => (
          <JournalField
            key={key}
            label={label}
            placeholder="Reflect from the evidence above..."
            value={review.responses[key] ?? ""}
            onChange={(value) => setReview((current) => ({
              ...current,
              responses: { ...current.responses, [key]: value },
            }))}
          />
        ))
      )}

      {saveError && <p className="text-sm text-red-400">{saveError}</p>}
      <button
        type="button"
        onClick={() => void saveReview(type === "month" && monthlyPhase === "plan")}
        disabled={saveStatus === "saving"}
        className="w-full rounded-2xl py-4 text-sm font-mono uppercase tracking-[0.12em] disabled:opacity-50"
        style={{ backgroundColor: "var(--gold)", color: "var(--bg)" }}
      >
        {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : type === "month" && monthlyPhase === "plan" ? "Save & apply monthly plan" : `Save ${type} review`}
      </button>

      {type === "month" ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void copyMonthlyReport()} className="rounded-xl border border-[--border] py-3 text-xs font-mono uppercase tracking-[0.1em] text-[--text-muted]">
            {copyStatus ? "Copied" : "Copy report"}
          </button>
          {user ? (
            <button type="button" onClick={() => { window.location.href = `/api/pdf/monthly-review?month=${safeMonth}`; }} className="rounded-xl border border-[--border] py-3 text-xs font-mono uppercase tracking-[0.1em] text-[--text-muted]">
              Monthly PDF
            </button>
          ) : (
            <button type="button" disabled className="rounded-xl border border-[--border] py-3 text-xs font-mono uppercase tracking-[0.1em] text-[--text-faint] opacity-50">PDF requires account</button>
          )}
        </div>
      ) : (
        <details className="rounded-xl border border-[--border] bg-[--bg-card] px-4 py-3">
          <summary className="cursor-pointer text-xs font-mono uppercase tracking-[0.12em] text-[--text-muted]">Share & exports</summary>
          <div className="mt-5"><ExportTab data={data} user={user} trackerSettings={trackerSettings} /></div>
        </details>
      )}

      <details className="rounded-xl border border-[--border] bg-[--bg-card] px-4 py-3">
        <summary className="cursor-pointer text-xs font-mono uppercase tracking-[0.12em] text-[--text-muted]">
          History
        </summary>
        <div className="mt-5">
          <PastWeeksTab archive={archive} />
        </div>
      </details>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "cycle", label: "Cycle" },
  { key: "review", label: "Review" },
];

export default function CoilApp() {
  // Read initial state from URL params
  const initParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const requestedTab = initParams.get("tab");
  const initTab: TabKey = requestedTab === "week" || requestedTab === "weekly"
    ? "week"
    : requestedTab === "cycle"
      ? "cycle"
      : requestedTab === "review" || requestedTab === "export" || requestedTab === "past"
        ? "review"
        : "today";
  // "week" param is an ISO date string (e.g. "2026-02-23"), not a relative offset
  const initWeekDate = initParams.get("week");
  const initOffset = (() => {
    if (!initWeekDate) return 0;
    // Convert ISO date → offset relative to current week
    const target = new Date(initWeekDate + "T12:00:00Z");
    const current = getWeekStart(new Date(), "monday"); // rough — weekStart not loaded yet
    const diffMs = target.getTime() - current.getTime();
    return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  })();

  const [activeTab, setActiveTab] = useState<TabKey>(initTab);
  const [theme, setTheme] = useState<"dark" | "light" | "system">("system");
  const [palette, setPalette] = useState<"gold" | "ocean" | "midnight" | "ember" | "iron">("gold");
  const [user, setUser] = useState<User | null>(null);
  const [weekStart, setWeekStart] = useState<"monday" | "sunday">("monday");
  const [trackerSettings, setTrackerSettings] = useState<TrackerSettings>(DEFAULT_TRACKER_SETTINGS);
  // null = loading (auth check pending); WeekData = ready
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [archive, setArchive] = useState<ArchivedWeek[]>([]);
  const [weekOffset, setWeekOffset] = useState(initOffset); // 0 = current week, -1 = last week, etc.
  const weekOffsetRef = useRef(initOffset); // mirror for use in stale closures
  const weekOffsetInitialized = useRef(initOffset !== 0); // skip initial nav effect run (auth effect handles it)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error" | "timeout">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const isDemo = user === null && weekData !== null;
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncAbort = useRef<AbortController | null>(null);
  const weekDataRef = useRef(weekData);
  weekDataRef.current = weekData;

  const applyTheme = (t: "dark" | "light" | "system") => {
    const resolved = t === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : t;
    document.documentElement.setAttribute("data-theme", resolved);
  };

  const applyPalette = (p: "gold" | "ocean" | "midnight" | "ember" | "iron") => {
    document.documentElement.setAttribute("data-palette", p);
  };

  useEffect(() => {
    const saved = (localStorage.getItem("coil_theme") as "dark" | "light" | "system") || "system";
    setTheme(saved);
    applyTheme(saved);
    const savedPalette = (localStorage.getItem("coil_palette") as "gold" | "ocean" | "midnight" | "ember" | "iron") || "gold";
    setPalette(savedPalette);
    applyPalette(savedPalette);

    // Keep system theme in sync with OS changes
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMqChange = () => {
      setTheme(prev => {
        if (prev === "system") applyTheme("system");
        return prev;
      });
    };
    mq.addEventListener("change", onMqChange);
    return () => mq.removeEventListener("change", onMqChange);
  }, []);

  const toggleTheme = () => {
    // Cycle: system → light → dark → system
    const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    applyTheme(next);
    localStorage.setItem("coil_theme", next);
  };

  // Auth check → populate state from the right source, no flicker
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        // Authenticated: Supabase is the only source. Never touch localStorage.
        setUser(user);
        demoClearAll(); // wipe any leftover demo data
        // Load settings (for weekStart) in parallel
        const supabaseClient = createClient();
        const { data: settingsData } = await supabaseClient
          .from("settings")
          .select("week_start, tracker_definitions, bagels_enabled, steps10k_enabled, cold_plunge_enabled, fasting_enabled")
          .eq("user_id", user.id)
          .maybeSingle();
        const ws: "monday" | "sunday" = (settingsData?.week_start as "monday" | "sunday") ?? "monday";
        setWeekStart(ws);
        setTrackerSettings(trackerSettingsFromRow(settingsData));
        const [remoteWeek, remoteArchive] = await Promise.all([
          fetchCurrentFromSupabase(user.id, initOffset, ws),
          fetchArchiveFromSupabase(user.id),
        ]);
        setWeekData(remoteWeek ?? emptyWeekData(getWeekStart(new Date(), ws)));
        setArchive(remoteArchive);
      } else {
        // Demo/guest: localStorage only, never touches Supabase.
        setUser(null);
        setTrackerSettings(trackerSettingsFromJson(localStorage.getItem("coil_tracker_settings")));
        setWeekData(demoLoadCurrent());
        setArchive(demoLoadArchive());
      }
    });
  }, []);

  // Sync tab + week ISO date to URL params (no page reload, preserves back/forward)
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab !== "today") params.set("tab", activeTab);
    if (weekOffset !== 0 && weekData) {
      // Use the actual weekOf date — stable across time, not relative
      params.set("week", new Date(weekData.weekOf).toISOString().slice(0, 10));
    }
    const qs = params.toString();
    const newUrl = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [activeTab, weekOffset, weekData]);

  // Reload week data when offset changes (week navigation)
  useEffect(() => {
    if (!weekOffsetInitialized.current) { weekOffsetInitialized.current = true; return; }
    if (!user) return;
    setWeekData(null);
    fetchCurrentFromSupabase(user.id, weekOffset, weekStart).then((w) => {
      setWeekData(w ?? emptyWeekData(getMondayForOffset(weekOffset, weekStart)));
    });
  }, [weekOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = async () => {
    document.cookie = "coil_demo=; path=/; max-age=0";
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // Auto-archive on week boundary (runs once data is loaded, only when viewing current week)
  useEffect(() => {
    if (!weekData) return;
    if (weekOffsetRef.current !== 0) return; // don't auto-archive when browsing past weeks
    const currentMonday = getWeekStart(new Date(), weekStart).toISOString();
    if (weekData.weekOf !== currentMonday) {
      const hasContent = calcScore(weekData) > 0 ||
        Object.values(weekData.weekly).some((value) => {
          if (typeof value === "string") return value.trim() !== "";
          if (Array.isArray(value)) return value.some((item) => typeof item === "string" && item.trim() !== "");
          return value && typeof value === "object"
            ? Object.values(value).some((item) => typeof item === "string" && item.trim() !== "")
            : false;
        }) ||
        Object.values(weekData.days).some(d =>
          d.journal.trim() !== "" || d.reflection.trim() !== "" || d.tomorrowPriority.trim() !== "" ||
          Object.values(d.commitments).some((commitment) => commitment.trim() !== "") ||
          Object.values(d.basics).some(Boolean) ||
          (d.drinks ?? 0) > 0 || (d.bagels ?? 0) > 0 || d.steps10k || d.coldPlunge || d.fasting ||
          Object.values(d.trackers ?? {}).some(Boolean) || d.gratitude.trim() !== "" || d.wins.trim() !== ""
        );
      if (hasContent) {
        const newArchive: ArchivedWeek[] = [
          ...archive,
          { weekOf: weekData.weekOf, data: weekData, archivedAt: new Date().toISOString() },
        ];
        setArchive(newArchive);
        if (isDemo) demoSaveArchive(newArchive);
        if (user) archiveInSupabase(user.id, weekData);
      }
      const fresh = emptyWeekData(getWeekStart(new Date(), weekStart));
      setWeekData(fresh);
      if (isDemo) demoSaveCurrent(fresh);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekData === null]);

  // Auto-save: demo → localStorage; auth → Supabase (1.5s debounce)
  useEffect(() => {
    if (!weekData) return;
    if (isDemo) {
      demoSaveCurrent(weekData);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1200);
      return;
    }
    if (!user) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      const latestData = weekDataRef.current;
      if (!latestData) return;
      // Abort any in-flight save before starting a new one
      if (syncAbort.current) syncAbort.current.abort();
      const controller = new AbortController();
      syncAbort.current = controller;
      setSaveStatus("saving");
      const timeoutId = setTimeout(() => {
        controller.abort();
        setSaveStatus("timeout");
        setSaveError("Timed out");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }, 10000);
      syncCurrentToSupabase(user.id, latestData, controller.signal, weekOffset !== 0).then((err) => {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) return;
        if (err) {
          setSaveError(err);
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 4000);
        } else {
          setSaveError(null);
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 1500);
          // Update in-memory archive if editing a past week
          if (weekOffset !== 0) {
            setArchive(prev => {
              const wOf = weekData.weekOf;
              const exists = prev.some(a => a.weekOf === wOf);
              if (exists) {
                return prev.map(a => a.weekOf === wOf ? { ...a, data: weekData } : a);
              }
              return [{ weekOf: wOf, data: weekData, archivedAt: new Date().toISOString() }, ...prev];
            });
          }
        }
      }).catch((e) => {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) return;
        console.error("Autosave failed:", e);
        setSaveError(String(e));
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 4000);
      });
    }, 1500);
  }, [weekData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Loading state — auth check pending
  if (!weekData) {
    return (
      <div className="min-h-screen bg-[--bg] flex items-center justify-center">
        <p className="font-mono text-xs tracking-[0.2em] text-[--text-faint] uppercase">Loading…</p>
      </div>
    );
  }

  const score = calcScore(weekData);
  const weekOf = formatWeekOf(new Date(weekData.weekOf));

  return (
    <div className="min-h-screen bg-[--bg] flex flex-col">
      <div className="max-w-md md:max-w-lg lg:max-w-xl mx-auto w-full flex flex-col min-h-screen">
        {/* Header */}
        <div className="px-5 md:px-8 pt-8 pb-4">
          {/* Row 1: Logo + action buttons */}
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-3xl font-bold tracking-tight" style={{color: "var(--gold)"}}>COIL</h1>
            <div className="flex items-center gap-2">


              <a
                href="/settings"
                title="Settings"
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                style={{backgroundColor:"var(--bg-card)", border:"1px solid var(--border)", color:"var(--text-muted)"}}
                aria-label="Settings"
              >
                <Settings size={14} />
              </a>
              <button
                onClick={handleSignOut}
                title={user ? `Signed in as ${user.email}` : "Demo mode"}
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors relative"
                style={{backgroundColor:"var(--bg-card)", border:`1px solid ${user ? "var(--self-border)" : "var(--border)"}`, color: user ? "var(--self)" : "var(--text-muted)"}}
                aria-label="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
          {(activeTab === "today" || activeTab === "week") && (
            <>
          {/* Row 2: Week nav + subtitle/email */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={() => { const n = weekOffset - 1; weekOffsetRef.current = n; setWeekOffset(n); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{backgroundColor:"var(--bg-card)", border:"1px solid var(--border)", color:"var(--text-muted)"}}
                title="Previous week"
                aria-label="Previous week"
              >
                <ChevronLeft size={13} />
              </button>
              <div className="text-center px-1">
                <p className="text-[10px] font-mono tracking-[0.15em] text-[--text-dim] uppercase">Week of</p>
                <p className="text-sm font-mono text-[--text-muted]">{weekOf}</p>
              </div>
              <button
                onClick={() => { const n = Math.min(0, weekOffset + 1); weekOffsetRef.current = n; setWeekOffset(n); }}
                disabled={weekOffset === 0}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30"
                style={{backgroundColor:"var(--bg-card)", border:"1px solid var(--border)", color:"var(--text-muted)"}}
                title="Next week"
                aria-label="Next week"
              >
                <ChevronRight size={13} />
              </button>
            </div>
            <p className="text-[10px] font-mono text-[--text-faint] truncate max-w-[140px]">
              {user ? user.email : "demo mode"}
            </p>
          </div>

          {/* Progress bar + score */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="h-1 flex-1 bg-[--bg-card] rounded-full overflow-hidden mr-4">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(score / TOTAL_POSSIBLE) * 100}%`, backgroundColor: "var(--gold)" }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xl font-medium" style={{color:"var(--gold)"}}>{score}</span>
                <span className="font-mono text-sm text-[--text-faint]">/{TOTAL_POSSIBLE}</span>
              </div>
            </div>
          </div>
            </>
          )}

        </div>

        {/* Tabs */}
        <div className="px-5 md:px-8 border-b border-[--border]">
          <div className="flex gap-0 relative">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="px-3 py-3 text-xs font-mono tracking-[0.12em] uppercase transition-colors duration-150 relative"
                style={{ color: activeTab === tab.key ? "var(--gold)" : "var(--text-dim)" }}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-px" style={{backgroundColor:"var(--gold)"}} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-5">
          {activeTab === "today" && (
            <DailyTab data={weekData} onChange={setWeekData} trackerSettings={trackerSettings} weekOffset={weekOffset} weekStart={weekStart} />
          )}
          {activeTab === "week" && (
            <WeeklyTab data={weekData} onChange={setWeekData} trackerSettings={trackerSettings} weekOffset={weekOffset} />
          )}
          {activeTab === "cycle" && (
            <CycleTab user={user} />
          )}
          {activeTab === "review" && (
            <ReviewTab user={user} data={weekData} onChange={setWeekData} archive={archive} trackerSettings={trackerSettings} />
          )}
        </div>
      </div>

      {/* Version footer */}
      <div className="text-center py-2">
        <span className="text-[9px] font-mono text-[--text-faint] opacity-40">
          {process.env.NEXT_PUBLIC_BUILD_VERSION || "dev"}
          {process.env.NEXT_PUBLIC_GIT_BRANCH ? ` · ${process.env.NEXT_PUBLIC_GIT_BRANCH}` : ""}
        </span>
      </div>

      {/* Fixed save status pill */}
      {saveStatus !== "idle" && (
        <div
          className="fixed bottom-6 left-1/2 px-3 py-1.5 rounded-full text-[11px] font-mono tracking-wider pointer-events-none transition-all duration-300"
          style={{
            backgroundColor: "var(--bg-card)",
            border: `1px solid ${
              saveStatus === "saved" ? "var(--self)" :
              saveStatus === "saving" ? "var(--border)" :
              "var(--red, #f87171)"
            }`,
            color: saveStatus === "saved" ? "var(--self)" :
                   saveStatus === "saving" ? "var(--text-muted)" :
                   "var(--red, #f87171)",
            transform: "translateX(-50%)",
          }}
        >
          {saveStatus === "saving" && "· saving…"}
          {saveStatus === "saved" && "✓ saved"}
          {saveStatus === "error" && `⚠ save failed: ${saveError}`}
          {saveStatus === "timeout" && "⚠ save timed out — check connection"}
        </div>
      )}
    </div>
  );
}
