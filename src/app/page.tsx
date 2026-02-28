"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Copy, Check, Archive, ChevronDown, ChevronUp, Minus, Plus, Sun, Moon, Monitor, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase";
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
  journal: string;
  reflection: string;
}

interface WeekData {
  weekOf: string; // ISO date string for Monday
  days: Record<string, DayData>; // key: "mon" | "tue" etc.
  weekly: {
    wins: string;
    gratitude: string;
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
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
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
    journal: "",
    reflection: "",
  };
}

function emptyWeekData(monday: Date): WeekData {
  return {
    weekOf: monday.toISOString(),
    days: Object.fromEntries(DAYS.map((d) => [d, emptyDayData()])),
    weekly: {
      wins: "", gratitude: "", lessons: "", focusAchieved: "",
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
  // Migrate wolf from old single string to array
  const days = Object.fromEntries(
    Object.entries(data.days).map(([k, d]) => [
      k,
      { ...d, wolf: Array.isArray(d.wolf) ? d.wolf : d.wolf ? [d.wolf as unknown as WolfMode] : [] },
    ])
  );
  return { ...data, days };
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

async function syncCurrentToSupabase(userId: string, data: WeekData) {
  const supabase = createClient();
  const weekOf = new Date(data.weekOf).toISOString().slice(0, 10);
  await supabase.from("weeks").upsert(
    { user_id: userId, week_of: weekOf, data, archived: false, updated_at: new Date().toISOString() },
    { onConflict: "user_id,week_of" }
  );
}

async function fetchCurrentFromSupabase(userId: string): Promise<WeekData | null> {
  const supabase = createClient();
  const monday = getMondayOfWeek(new Date()).toISOString().slice(0, 10);
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
  const { data } = await supabase
    .from("weeks")
    .select("week_of, data, updated_at")
    .eq("user_id", userId)
    .eq("archived", true)
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

// ── Generate Report ────────────────────────────────────────────────────────

function generateReport(data: WeekData): string {
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
  lines.push(`| **Total** | ${totals.join(" | ")} | **${score}/${TOTAL_POSSIBLE}** |`);
  lines.push(``);
  lines.push(`## Drinks`);
  const drinkRow = DAYS.map((d) => data.days[d]?.drinks ?? 0).join(" | ");
  lines.push(`| Mon | Tue | Wed | Thu | Fri | Sat | Sun | Weekly |`);
  lines.push(`|-----|-----|-----|-----|-----|-----|-----|--------|`);
  lines.push(`| ${drinkRow} | **${calcWeekDrinks(data)}** |`);
  lines.push(``);
  lines.push(`## Daily Journal`);
  for (const day of DAYS) {
    const d = data.days[day];
    if (!d) continue;
    const wolf = d.wolf?.length ? ` · Wolf: ${d.wolf.join(", ")}` : "";
    lines.push(`### ${DAY_LABELS[day]}${wolf}`);
    if (d.journal) lines.push(d.journal);
    if (d.reflection) lines.push(`*Better: ${d.reflection}*`);
    lines.push(``);
  }
  lines.push(`## Weekly Reflection`);
  const w = data.weekly;
  if (w.wins) lines.push(`**Wins:** ${w.wins}`);
  if (w.gratitude) lines.push(`**Gratitude:** ${w.gratitude}`);
  if (w.lessons) lines.push(`**Lessons:** ${w.lessons}`);
  if (w.focusAchieved) lines.push(`**Focus achieved:** ${w.focusAchieved}`);
  if (w.focusNext) lines.push(`**Focus next week:** ${w.focusNext}`);
  if (w.stretchNext) lines.push(`**Stretch next week:** ${w.stretchNext}`);
  if (w.onTrack) lines.push(`**On track:** ${w.onTrack}`);
  if (w.cupOverflowing) lines.push(`**Cup overflowing:** ${w.cupOverflowing}`);
  if (w.improve) lines.push(`**Areas to improve:** ${w.improve}`);
  return lines.join("\n");
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
      role="checkbox"
      aria-checked={checked}
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
          <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
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
              aria-pressed={active}
              className="py-2 rounded-lg text-sm font-medium border transition-all duration-200 active:scale-95"
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
            className="w-8 h-8 rounded-full bg-[--bg] border border-[--border] flex items-center justify-center active:scale-90 transition-transform"
          >
            <Minus size={14} className="text-[--text-muted]" />
          </button>
          <span className="font-mono text-2xl font-medium w-8 text-center" style={{color:"var(--gold)"}}>{value}</span>
          <button
            onClick={() => onChange(value + 1)}
            className="w-8 h-8 rounded-full bg-[--bg] border border-[--border] flex items-center justify-center active:scale-90 transition-transform"
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
  return (
    <div>
      <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-2">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[--bg-input] border border-[--border] rounded-xl px-4 py-3 text-[15px] text-[--text] placeholder-[--text-faint] focus:outline-none focus-visible:ring-2 focus-visible:ring-[--gold] focus-visible:ring-offset-2 focus-visible:ring-offset-[--bg] transition-colors"
      />
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────

function DailyTab({ data, onChange }: { data: WeekData; onChange: (d: WeekData) => void }) {
  const todayKey = getTodayKey();
  const [activeDay, setActiveDay] = useState(todayKey);

  const dayData = data.days[activeDay] ?? emptyDayData();
  const weeklyDrinks = calcWeekDrinks(data);

  const updateDay = useCallback(
    (patch: Partial<DayData>) => {
      const updated = { ...data, days: { ...data.days, [activeDay]: { ...dayData, ...patch } } };
      onChange(updated);
    },
    [data, onChange, activeDay, dayData]
  );

  const toggleTerritory = (key: TerritoryKey) => {
    updateDay({ territories: { ...dayData.territories, [key]: !dayData.territories[key] } });
  };

  const dayScore = Object.values(dayData.territories).filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* Day picker */}
      <div className="grid grid-cols-7 gap-1.5">
        {DAYS.map((day) => {
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

      {/* Territories */}
      <div className="space-y-2">
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
      <WolfCheck value={dayData.wolf} onChange={(wolf) => updateDay({ wolf })} />

      {/* Drinks */}
      <DrinkCounter
        value={dayData.drinks}
        weeklyTotal={weeklyDrinks}
        onChange={(drinks) => updateDay({ drinks })}
      />

      {/* Journal */}
      <JournalField
        label="Journal Notes"
        placeholder="Wins, challenges, what happened today..."
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
  );
}

function WeeklyTab({ data, onChange }: { data: WeekData; onChange: (d: WeekData) => void }) {
  const weeklyDrinks = calcWeekDrinks(data);

  const updateWeekly = (patch: Partial<WeekData["weekly"]>) => {
    onChange({ ...data, weekly: { ...data.weekly, ...patch } });
  };

  const reflectionFields: { key: keyof WeekData["weekly"]; label: string; placeholder: string }[] = [
    { key: "wins", label: "Wins", placeholder: "One big win for this week..." },
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
              <div className="flex-1 h-1.5 bg-[--bg] rounded-full overflow-hidden">
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
    </div>
  );
}

function ExportTab({
  data,
  onArchive,
  onReset,
}: {
  data: WeekData;
  onArchive: () => void;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const report = generateReport(data);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-[--text-muted] leading-relaxed mb-4">
          Copy your full COIL report as formatted text. Paste it into a chat for AI-guided reflection, or save it for your records.
        </p>
        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-mono text-sm tracking-[0.1em] uppercase font-medium transition-all duration-200 active:scale-[0.98]"
          style={{ backgroundColor: "var(--gold)", color: "var(--bg)" }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Copied!" : "Copy Full COIL Report"}
        </button>
      </div>

      <div className="flex gap-2">
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

      {/* Preview */}
      <div className="bg-[--bg-input] rounded-2xl p-4 border border-[--border] overflow-auto max-h-64">
        <pre className="text-xs text-[--text-dim] font-mono whitespace-pre-wrap leading-relaxed">{report}</pre>
      </div>
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
          When you finish a week, go to Export → "Archive & New Week" to save it here.
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
                <div className="h-1 w-16 bg-[--bg] rounded-full overflow-hidden">
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
  const [activeTab, setActiveTab] = useState<TabKey>("daily");
  const [theme, setTheme] = useState<"dark" | "light" | "system">("system");
  const [user, setUser] = useState<User | null>(null);
  // null = loading (auth check pending); WeekData = ready
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [archive, setArchive] = useState<ArchivedWeek[]>([]);
  const [saved, setSaved] = useState(false);
  const isDemo = user === null && weekData !== null;
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyTheme = (t: "dark" | "light" | "system") => {
    const resolved = t === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : t;
    document.documentElement.setAttribute("data-theme", resolved);
  };

  useEffect(() => {
    const saved = (localStorage.getItem("coil_theme") as "dark" | "light" | "system") || "system";
    setTheme(saved);
    applyTheme(saved);

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
        const [remoteWeek, remoteArchive] = await Promise.all([
          fetchCurrentFromSupabase(user.id),
          fetchArchiveFromSupabase(user.id),
        ]);
        setWeekData(remoteWeek ?? emptyWeekData(getMondayOfWeek(new Date())));
        setArchive(remoteArchive);
      } else {
        // Demo/guest: localStorage only, never touches Supabase.
        setUser(null);
        setWeekData(demoLoadCurrent());
        setArchive(demoLoadArchive());
      }
    });
  }, []);

  const handleSignOut = async () => {
    document.cookie = "coil_demo=; path=/; max-age=0";
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // Auto-archive on week boundary (runs once data is loaded)
  useEffect(() => {
    if (!weekData) return;
    const currentMonday = getMondayOfWeek(new Date()).toISOString();
    if (weekData.weekOf !== currentMonday) {
      const hasContent = calcScore(weekData) > 0 ||
        Object.values(weekData.weekly).some(v => v.trim() !== "") ||
        Object.values(weekData.days).some(d =>
          d.journal.trim() !== "" || d.reflection.trim() !== "" || d.drinks > 0
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
      const fresh = emptyWeekData(getMondayOfWeek(new Date()));
      setWeekData(fresh);
      if (isDemo) demoSaveCurrent(fresh);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekData === null]);

  // Auto-save: demo → localStorage; auth → Supabase (debounced 2s)
  useEffect(() => {
    if (!weekData) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1200);
    if (isDemo) {
      demoSaveCurrent(weekData);
    } else if (user) {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => syncCurrentToSupabase(user.id, weekData), 2000);
    }
    return () => clearTimeout(t);
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
    const newArchive: ArchivedWeek[] = [
      ...archive,
      { weekOf: weekData.weekOf, data: weekData, archivedAt: new Date().toISOString() },
    ];
    setArchive(newArchive);
    if (isDemo) demoSaveArchive(newArchive);
    if (user) archiveInSupabase(user.id, weekData);
    const newWeek = emptyWeekData(getMondayOfWeek(new Date()));
    setWeekData(newWeek);
    if (isDemo) demoSaveCurrent(newWeek);
    if (user) syncCurrentToSupabase(user.id, newWeek);
    setActiveTab("daily");
  };

  const handleReset = () => {
    if (!confirm("Reset all data for this week? This cannot be undone.")) return;
    const fresh = emptyWeekData(getMondayOfWeek(new Date()));
    setWeekData(fresh);
    if (isDemo) demoSaveCurrent(fresh);
  };

  return (
    <div className="min-h-screen bg-[--bg] flex flex-col">
      <div className="max-w-md mx-auto w-full flex flex-col min-h-screen">
        {/* Header */}
        <div className="px-5 pt-8 pb-4">
          <div className="flex items-start justify-between mb-1">
            <h1 className="text-3xl font-bold tracking-tight" style={{color: "var(--gold)"}}>COIL</h1>
            <div className="flex items-start gap-3">
              <div className="text-right">
                <p className="text-[10px] font-mono tracking-[0.15em] text-[--text-dim] uppercase">Week of</p>
                <p className="text-sm font-mono text-[--text-muted]">{weekOf}</p>
              </div>
              <button
                onClick={toggleTheme}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                style={{backgroundColor:"var(--bg-card)", border:"1px solid var(--border)", color:"var(--text-muted)"}}
                aria-label={`Theme: ${theme} (click to cycle)`}
                title={`Theme: ${theme}`}
              >
                {theme === "dark" ? <Moon size={14} /> : theme === "light" ? <Sun size={14} /> : <Monitor size={14} />}
              </button>
              <button
                onClick={handleSignOut}
                title={user ? `Signed in as ${user.email}` : "Demo mode"}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors relative"
                style={{backgroundColor:"var(--bg-card)", border:`1px solid ${user ? "var(--self-border)" : "var(--border)"}`, color: user ? "var(--self)" : "var(--text-muted)"}}
                aria-label="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-mono tracking-[0.12em] text-[--text-faint] uppercase">
              Daily Territory Tracker & Journal
            </p>
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
            <p className="text-[10px] font-mono tracking-wider transition-opacity duration-300" style={{color:"var(--self)", opacity: 0, userSelect: "none"}}>✓ SAVED</p>
          </div>

        </div>

        {/* Tabs */}
        <div className="px-5 border-b border-[--border]">
          <div className="flex gap-0 relative" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                role="tab"
                aria-selected={activeTab === tab.key}
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
        <div className="flex-1 overflow-y-auto px-5 py-5" role="tabpanel">
          {activeTab === "daily" && (
            <DailyTab data={weekData} onChange={setWeekData} />
          )}
          {activeTab === "weekly" && (
            <WeeklyTab data={weekData} onChange={setWeekData} />
          )}
          {activeTab === "export" && (
            <ExportTab data={weekData} onArchive={handleArchive} onReset={handleReset} />
          )}
          {activeTab === "past" && (
            <PastWeeksTab archive={archive} />
          )}
        </div>
      </div>

      {/* Fixed SAVED pill — visible regardless of scroll */}
      <div
        className="fixed bottom-6 left-1/2 px-3 py-1.5 rounded-full text-[11px] font-mono tracking-wider pointer-events-none transition-all duration-300"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--self)",
          color: "var(--self)",
          opacity: saved ? 1 : 0,
          transform: `translateX(-50%) translateY(${saved ? "0px" : "8px"})`,
        }}
      >
        ✓ saved
      </div>
    </div>
  );
}
