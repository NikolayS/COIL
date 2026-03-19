"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Copy, Check, Archive, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Minus, Plus, Sun, Moon, Monitor, LogOut, Settings, Download, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { generateReport, generatePlainReport, generatePlainReportHtml } from "@/lib/report";
import type { User } from "@supabase/supabase-js";

// ── Types ──────────────────────────────────────────────────────────────────

type TerritoryKey = "self" | "health" | "relationships" | "wealth" | "business";
type WolfMode = "wise" | "open" | "loving" | "fierce";
type WolfModes = WolfMode[];
type TabKey = "daily" | "weekly" | "export" | "past";

interface DayData {
  territories: Record<TerritoryKey, boolean>;
  wolf: WolfModes;
  drinks: number;
  gratitude: string;
  wins: string;
  journal: string;
  reflection: string;
}

interface WeekData {
  weekOf: string; // ISO date string for Monday
  days: Record<string, DayData>; // key: "mon" | "tue" etc.
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

interface ArchivedWeek {
  weekOf: string;
  data: WeekData;
  archivedAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TERRITORIES: { key: TerritoryKey; label: string; color: string; textColor: string }[] = [
  { key: "self", label: "Self", color: "#4a9e6b", textColor: "text-[#4a9e6b]" },
  { key: "health", label: "Health", color: "#c85555", textColor: "text-[#c85555]" },
  { key: "relationships", label: "Relationships", color: "#c9873a", textColor: "text-[#c9873a]" },
  { key: "wealth", label: "Wealth", color: "#4a7fc1", textColor: "text-[#4a7fc1]" },
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
  return {
    territories: { self: false, health: false, relationships: false, wealth: false, business: false },
    wolf: [],
    drinks: 0,
    gratitude: "",
    wins: "",
    journal: "",
    reflection: "",
  };
}

function emptyWeekData(monday: Date): WeekData {
  return {
    weekOf: monday.toISOString(),
    days: Object.fromEntries(DAYS.map((d) => [d, emptyDayData()])),
    weekly: {
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

function calcWeekDrinks(data: WeekData): number {
  return DAYS.reduce((sum, d) => sum + (data.days[d]?.drinks ?? 0), 0);
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
        wolf: Array.isArray(d.wolf) ? d.wolf : d.wolf ? [d.wolf as unknown as WolfMode] : [],
        gratitude: d.gratitude ?? "",
        wins: d.wins ?? "",
      },
    ])
  );
  // Backfill new weekly field
  const weekly = { ...data.weekly, biggestWin: data.weekly.biggestWin ?? "" };
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

function TerritoryRow({
  territory,
  checked,
  onToggle,
}: {
  territory: typeof TERRITORIES[0];
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="territory-toggle flex items-center justify-between w-full px-4 py-3.5 rounded-xl bg-[--bg-card] border border-[--border] active:bg-[--bg-card-hover]"
      style={{ borderColor: checked ? territory.color + "60" : undefined }}
    >
      <div className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: territory.color }} />
        <span className="text-[15px] font-medium tracking-wide">{territory.label}</span>
      </div>
      <div
        className="w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200"
        style={{
          borderColor: territory.color,
          backgroundColor: checked ? territory.color : "transparent",
        }}
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

function DrinkCounter({
  value,
  weeklyTotal,
  onChange,
}: {
  value: number;
  weeklyTotal: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-3">🥃 Drinks Today</p>
      <div className="flex items-center justify-between bg-[--bg-card] rounded-xl px-4 py-3 border border-[--border]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onChange(Math.max(0, value - 1))}
            className="w-11 h-11 rounded-full bg-[--bg] border border-[--border] flex items-center justify-center active:scale-90 transition-transform"
          >
            <Minus size={14} className="text-[--text-muted]" />
          </button>
          <span className="font-mono text-2xl font-medium w-8 text-center" style={{color:"var(--gold)"}}>{value}</span>
          <button
            onClick={() => onChange(value + 1)}
            className="w-11 h-11 rounded-full bg-[--bg] border border-[--border] flex items-center justify-center active:scale-90 transition-transform"
          >
            <Plus size={14} className="text-[--text-muted]" />
          </button>
        </div>
        <span className="text-sm text-[--text-dim]">
          {weeklyTotal > 20
            ? <>Weekly: {weeklyTotal} 🤨 sure about that?</>
            : weeklyTotal > 14
            ? <>Weekly: {weeklyTotal} 🍺🍺 rough week</>
            : weeklyTotal > 7
            ? <>Weekly: {weeklyTotal} 🥴 easy tiger</>
            : <>Weekly: {weeklyTotal}</>
          }
        </span>
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
  onChangeRef.current = onChange;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

function DailyTab({ data, onChange, weekOffset = 0, weekStart = "monday" }: { data: WeekData; onChange: (d: WeekData | ((prev: WeekData | null) => WeekData | null)) => void; weekOffset?: number; weekStart?: "monday" | "sunday" }) {
  const todayKey = getTodayKey();
  // When viewing a past week, default to Sunday (last day); otherwise today
  const [activeDay, setActiveDay] = useState(weekOffset < 0 ? "sun" : todayKey);
  const [editUnlocked, setEditUnlocked] = useState<Record<string, boolean>>({});

  const dayData = data.days[activeDay] ?? emptyDayData();
  const weeklyDrinks = calcWeekDrinks(data);

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
  const isLocked = isFuture || (activeDayAgo >= 2 && !editUnlocked[`${weekOffset}:${activeDay}`]);

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

  return (
    <div className="space-y-5">
      {/* Day picker */}
      <div className="grid grid-cols-7 gap-1.5">
        {(weekStart === "sunday" ? ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const : DAYS).map((day) => {
          const score = Object.values(data.days[day]?.territories ?? {}).filter(Boolean).length;
          const isActive = activeDay === day;
          const isToday = day === todayKey;
          return (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
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
          Territories — {DAY_LABELS[activeDay]}
        </p>
        <span className="font-mono text-sm" style={{color:"var(--gold)"}}>{dayScore}/5</span>
      </div>

      {/* Lock banner for old/future days */}
      {isLocked && (
        <div className="flex items-center justify-between rounded-xl px-4 py-3 border"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
          <span className="text-xs font-mono text-[--text-muted]">
            {isFuture ? "🔒 This day hasn\u2019t happened yet" : `🔒 ${activeDayAgo} days ago \u2014 read-only`}
          </span>
          {!isFuture && (
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

      {/* Territories */}
      <div className={`space-y-2 ${isLocked ? "pointer-events-none opacity-50" : ""}`}>
        {TERRITORIES.map((t) => (
          <TerritoryRow
            key={t.key}
            territory={t}
            checked={dayData.territories[t.key]}
            onToggle={() => toggleTerritory(t.key)}
          />
        ))}
      </div>

      {/* Wolf check */}
      <div className={isLocked ? "pointer-events-none opacity-50" : ""}>
        <WolfCheck value={dayData.wolf} onChange={(wolf) => updateDay({ wolf })} />
      </div>

      {/* Drinks */}
      <div className={isLocked ? "pointer-events-none opacity-50" : ""}>
        <DrinkCounter
          value={dayData.drinks}
          weeklyTotal={weeklyDrinks}
          onChange={(drinks) => updateDay({ drinks })}
        />
      </div>

      {/* Gratitude & Wins */}
      <div className={isLocked ? "pointer-events-none opacity-50" : ""}>
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

        {/* Journal */}
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
  );
}

function WeeklyTab({ data, onChange, onArchive, onReset }: { data: WeekData; onChange: (d: WeekData) => void; onArchive: () => void; onReset: () => void }) {
  const weeklyDrinks = calcWeekDrinks(data);

  const updateWeekly = (patch: Partial<WeekData["weekly"]>) => {
    onChange({ ...data, weekly: { ...data.weekly, ...patch } });
  };

  const reflectionFields: { key: keyof WeekData["weekly"]; label: string; placeholder: string }[] = [
    { key: "biggestWin", label: "Biggest Win of the Week", placeholder: "The one win that stands above the rest..." },
    { key: "wins", label: "Other Wins", placeholder: "More wins from this week..." },
    { key: "gratitude", label: "Gratitude", placeholder: "Who or what am I grateful for?" },
    { key: "lessons", label: "Lessons / Challenges", placeholder: "What did I learn? What did I try and fail at?" },
    { key: "focusAchieved", label: "Did I achieve my focus & stretch from last week?", placeholder: "If not, why?" },
    { key: "focusNext", label: "Focus for the coming week", placeholder: "One clear focus..." },
    { key: "stretchNext", label: "Stretch for the coming week", placeholder: "Push beyond comfort..." },
    { key: "onTrack", label: "Will I reach my goal if I continue this way?", placeholder: "" },
    { key: "cupOverflowing", label: "Is my cup overflowing?", placeholder: "Am I giving from abundance or depletion?" },
    { key: "improve", label: "What areas do I need to improve?", placeholder: "" },
  ];

  return (
    <div className="space-y-6">
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
        <div className="pt-2 border-t border-[--border] flex items-center gap-2 text-sm">
          <span className="text-[--text-muted]">🥃 Drinks</span>
          <span className="font-mono text-[--text]">{weeklyDrinks} this week</span>
        </div>
      </div>

      {/* Reflection questions */}
      {reflectionFields.map(({ key, label, placeholder }) => (
        <JournalField
          key={key}
          label={label}
          placeholder={placeholder}
          value={data.weekly[key]}
          onChange={(v) => updateWeekly({ [key]: v })}
        />
      ))}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onArchive}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border text-sm font-mono tracking-wide transition-all active:scale-[0.98]"
          style={{borderColor:"var(--self-border)", color:"var(--self)", backgroundColor:"transparent"}}
          onMouseEnter={e=>(e.currentTarget.style.backgroundColor="var(--self-bg)")}
          onMouseLeave={e=>(e.currentTarget.style.backgroundColor="transparent")}
        >
          <Archive size={14} />
          Archive & New Week
        </button>
        <button
          onClick={onReset}
          className="px-5 py-3.5 rounded-2xl border text-sm font-mono tracking-wide transition-all active:scale-[0.98]"
          style={{borderColor:"var(--health-border)", color:"var(--health)", backgroundColor:"transparent"}}
          onMouseEnter={e=>(e.currentTarget.style.backgroundColor="var(--health-bg)")}
          onMouseLeave={e=>(e.currentTarget.style.backgroundColor="transparent")}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function ExportTab({
  data,
  user,
}: {
  data: WeekData;
  user: User | null;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedPlain, setCopiedPlain] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const report = generateReport(data);

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
    const { plain, html } = generatePlainReportHtml(data);
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
          When you finish a week, go to Weekly → "Archive & New Week" to save it here.
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

// ── Main App ───────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "export", label: "Export" },
  { key: "past", label: "Past Weeks" },
];

export default function CoilApp() {
  // Read initial state from URL params
  const initParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initTab = (initParams.get("tab") as TabKey) ?? "daily";
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
          .select("week_start")
          .eq("user_id", user.id)
          .maybeSingle();
        const ws: "monday" | "sunday" = (settingsData?.week_start as "monday" | "sunday") ?? "monday";
        setWeekStart(ws);
        const [remoteWeek, remoteArchive] = await Promise.all([
          fetchCurrentFromSupabase(user.id, initOffset, ws),
          fetchArchiveFromSupabase(user.id),
        ]);
        setWeekData(remoteWeek ?? emptyWeekData(getWeekStart(new Date(), ws)));
        setArchive(remoteArchive);
      } else {
        // Demo/guest: localStorage only, never touches Supabase.
        setUser(null);
        setWeekData(demoLoadCurrent());
        setArchive(demoLoadArchive());
      }
    });
  }, []);

  // Sync tab + week ISO date to URL params (no page reload, preserves back/forward)
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab !== "daily") params.set("tab", activeTab);
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
        Object.values(weekData.weekly).some(v => v.trim() !== "") ||
        Object.values(weekData.days).some(d =>
          d.journal.trim() !== "" || d.reflection.trim() !== "" || d.drinks > 0 || d.gratitude.trim() !== "" || d.wins.trim() !== ""
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

  const handleArchive = () => {
    if (!confirm("Archive this week and start fresh? You won't be able to edit it after archiving.")) return;
    const newArchive: ArchivedWeek[] = [
      ...archive,
      { weekOf: weekData.weekOf, data: weekData, archivedAt: new Date().toISOString() },
    ];
    setArchive(newArchive);
    if (isDemo) demoSaveArchive(newArchive);
    if (user) archiveInSupabase(user.id, weekData);
    const newWeek = emptyWeekData(getWeekStart(new Date(), weekStart));
    setWeekData(newWeek);
    if (isDemo) demoSaveCurrent(newWeek);
    if (user) syncCurrentToSupabase(user.id, newWeek);
    setActiveTab("daily");
  };

  const handleReset = () => {
    if (!confirm("Reset all data for this week? This cannot be undone.")) return;
    const fresh = emptyWeekData(getWeekStart(new Date(), weekStart));
    setWeekData(fresh);
    if (isDemo) demoSaveCurrent(fresh);
  };

  return (
    <div className="min-h-screen bg-[--bg] flex flex-col">
      <div className="max-w-md md:max-w-lg lg:max-w-xl mx-auto w-full flex flex-col min-h-screen">
        {/* Header */}
        <div className="px-5 md:px-8 pt-8 pb-4">
          {/* Row 1: Logo + action buttons */}
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-3xl font-bold tracking-tight" style={{color: "var(--gold)"}}>COIL</h1>
            <div className="flex items-center gap-2">


              {user ? (
                <a
                  href="/settings"
                  title="Settings"
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                  style={{backgroundColor:"var(--bg-card)", border:"1px solid var(--border)", color:"var(--text-muted)"}}
                  aria-label="Settings"
                >
                  <Settings size={14} />
                </a>
              ) : (
                <span
                  title="Sign in to access settings"
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{backgroundColor:"var(--bg-card)", border:"1px solid var(--border)", color:"var(--text-muted)", opacity:0.35, cursor:"not-allowed"}}
                  aria-label="Settings (sign in required)"
                >
                  <Settings size={14} />
                </span>
              )}
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
          {activeTab === "daily" && (
            <DailyTab data={weekData} onChange={setWeekData} weekOffset={weekOffset} weekStart={weekStart} />
          )}
          {activeTab === "weekly" && (
            <WeeklyTab data={weekData} onChange={setWeekData} onArchive={handleArchive} onReset={handleReset} />
          )}
          {activeTab === "export" && (
            <ExportTab data={weekData} user={user} />
          )}
          {activeTab === "past" && (
            <PastWeeksTab archive={archive} />
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
