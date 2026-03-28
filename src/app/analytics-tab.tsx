"use client";

import { useMemo } from "react";

type TerritoryKey = "self" | "health" | "relationships" | "wealth" | "business";
type WolfMode = "wise" | "open" | "loving" | "fierce";

interface DayData {
  territories: Record<TerritoryKey, boolean>;
  wolf: WolfMode[];
  drinks: number;
  gratitude: string;
  wins: string;
  journal: string;
  reflection: string;
}

interface WeekData {
  weekOf: string;
  days: Record<string, DayData>;
  weekly: Record<string, string>;
}

interface ArchivedWeek {
  weekOf: string;
  data: WeekData;
  archivedAt: string;
}

interface AnalyticsTabProps {
  currentWeek: WeekData;
  archive: ArchivedWeek[];
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const TERRITORIES: { key: TerritoryKey; label: string; color: string }[] = [
  { key: "self",          label: "Self",          color: "var(--self)" },
  { key: "health",        label: "Health",        color: "var(--health)" },
  { key: "relationships", label: "Relationships", color: "var(--relationships)" },
  { key: "wealth",        label: "Wealth",        color: "var(--wealth)" },
  { key: "business",      label: "Business",      color: "var(--business)" },
];

const WOLF_COLORS: Record<WolfMode, string> = {
  wise:    "var(--self)",
  open:    "var(--wealth)",
  loving:  "var(--relationships)",
  fierce:  "var(--health)",
};

function calcScore(data: WeekData): number {
  return DAYS.reduce((sum, d) => {
    const day = data.days[d];
    if (!day) return sum;
    return sum + Object.values(day.territories).filter(Boolean).length;
  }, 0);
}

function calcTerritoryDays(data: WeekData, key: TerritoryKey): number {
  return DAYS.filter(d => data.days[d]?.territories[key]).length;
}

function calcWeekDrinks(data: WeekData): number {
  return DAYS.reduce((sum, d) => sum + (data.days[d]?.drinks ?? 0), 0);
}

export default function AnalyticsTab({ currentWeek, archive }: AnalyticsTabProps) {
  // Combine all weeks: archive (oldest first) + current
  const allWeeks = useMemo(() => {
    const sorted = [...archive].sort(
      (a, b) => new Date(a.weekOf).getTime() - new Date(b.weekOf).getTime()
    );
    return [...sorted.map(w => w.data), currentWeek];
  }, [archive, currentWeek]);

  const totalWeeks = allWeeks.length;

  if (totalWeeks < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <p className="text-4xl">📊</p>
        <p className="text-sm font-mono text-[--text-muted] text-center px-8">
          Track at least 2 weeks to unlock insights.
        </p>
      </div>
    );
  }

  // ── Computed data ──────────────────────────────────────────────────────────

  const scores = allWeeks.map(calcScore);
  const recentScores = scores.slice(-12);
  const currentScore = scores[scores.length - 1];
  const prevScore = scores[scores.length - 2];
  const scoreDelta = currentScore - prevScore;

  const weekDrinks = allWeeks.map(calcWeekDrinks);
  const recentDrinks = weekDrinks.slice(-8);
  const avgDrinks = Math.round(weekDrinks.reduce((a, b) => a + b, 0) / weekDrinks.length);

  // Territory averages (avg days/week hit)
  const territoryAvgs = TERRITORIES.map(t => {
    const total = allWeeks.reduce((sum, w) => sum + calcTerritoryDays(w, t.key), 0);
    return { ...t, avg: total / totalWeeks, pct: (total / totalWeeks) / 7 };
  }).sort((a, b) => b.avg - a.avg);

  // Best streak: consecutive weeks hitting territory 4+ days
  const streaks = TERRITORIES.map(t => {
    let best = 0, current = 0;
    for (const w of allWeeks) {
      if (calcTerritoryDays(w, t.key) >= 4) { current++; best = Math.max(best, current); }
      else current = 0;
    }
    return { ...t, streak: best };
  }).sort((a, b) => b.streak - a.streak);

  // Wolf mode breakdown
  const wolfCounts: Record<WolfMode, number> = { wise: 0, open: 0, loving: 0, fierce: 0 };
  let wolfTotal = 0;
  for (const w of allWeeks) {
    for (const d of DAYS) {
      const day = w.days[d];
      if (!day) continue;
      for (const mode of day.wolf) {
        wolfCounts[mode] = (wolfCounts[mode] ?? 0) + 1;
        wolfTotal++;
      }
    }
  }
  const wolfEntries = (Object.entries(wolfCounts) as [WolfMode, number][])
    .sort((a, b) => b[1] - a[1]);

  // Auto insight
  const insight = useMemo(() => {
    const weakest = territoryAvgs[territoryAvgs.length - 1];
    const strongest = territoryAvgs[0];
    const last3 = scores.slice(-3);
    const trending = last3.length === 3 && last3[0] < last3[1] && last3[1] < last3[2];
    const trendingDown = last3.length === 3 && last3[0] > last3[1] && last3[1] > last3[2];
    const drinkSpike = recentDrinks.length >= 2 &&
      recentDrinks[recentDrinks.length - 1] > avgDrinks + 3;
    const bestStreak = streaks[0];

    if (drinkSpike) {
      const spike = recentDrinks[recentDrinks.length - 1] - avgDrinks;
      return `Drinks spiked last week — ${recentDrinks[recentDrinks.length - 1]} vs your ${avgDrinks} avg (+${spike})`;
    }
    if (trending) return `Momentum: 3 weeks trending up — keep it going`;
    if (trendingDown) return `${weakest.label} is dragging your score — it's your weakest territory at ${(weakest.avg).toFixed(1)}/7 avg`;
    if (bestStreak.streak >= 3) return `${bestStreak.label} is your fortress — ${bestStreak.streak} weeks in a row at 4+ days 🔥`;
    if (strongest.avg > 6) return `${strongest.label} is locked in at ${strongest.avg.toFixed(1)}/7 avg — now bring ${weakest.label} up`;
    return `Your weakest territory is ${weakest.label} — averaging ${weakest.avg.toFixed(1)}/7 days per week`;
  }, [territoryAvgs, scores, recentDrinks, avgDrinks, streaks]);

  // Sparkline geometry
  const sparkW = 280, sparkH = 56;
  const maxScore = Math.max(35, ...recentScores);
  const minScore = Math.min(0, ...recentScores);
  const range = maxScore - minScore || 1;
  const sparkPoints = recentScores.map((s, i) => {
    const x = (i / (recentScores.length - 1)) * sparkW;
    const y = sparkH - ((s - minScore) / range) * sparkH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  // Drink bars geometry
  const drinkMax = Math.max(...recentDrinks, 1);
  const barW = 24, barGap = 6;

  return (
    <div className="space-y-4 pb-8">

      {/* ── Insight callout ── */}
      <div
        className="rounded-2xl px-4 py-3.5 border"
        style={{ backgroundColor: "var(--gold-bg)", borderColor: "var(--gold-border)" }}
      >
        <p className="text-[10px] font-mono tracking-[0.15em] text-[--gold] uppercase mb-1">Insight</p>
        <p className="text-sm text-[--text]">{insight}</p>
      </div>

      {/* ── Score trend ── */}
      <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border]">
        <p className="text-[10px] font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-3">Score Trend</p>
        <div className="flex items-end justify-between mb-3">
          <div>
            <span className="text-3xl font-bold font-mono" style={{ color: "var(--gold)" }}>{currentScore}</span>
            <span className="text-sm font-mono text-[--text-muted]">/35</span>
          </div>
          <div className="text-right">
            <p
              className="text-sm font-mono font-semibold"
              style={{ color: scoreDelta >= 0 ? "var(--self)" : "var(--health)" }}
            >
              {scoreDelta >= 0 ? "↑" : "↓"} {Math.abs(scoreDelta)} pts
            </p>
            <p className="text-[10px] font-mono text-[--text-faint]">vs last week</p>
          </div>
        </div>
        {/* Sparkline */}
        <div className="overflow-x-auto">
          <svg width={sparkW} height={sparkH + 8} style={{ display: "block" }}>
            {/* Zero line at 20 (passing threshold) */}
            <line
              x1={0} y1={sparkH - (20 / range) * sparkH}
              x2={sparkW} y2={sparkH - (20 / range) * sparkH}
              stroke="var(--border)" strokeWidth={1} strokeDasharray="3,3"
            />
            <polyline
              points={sparkPoints}
              fill="none"
              stroke="var(--gold)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Dots */}
            {recentScores.map((s, i) => {
              const x = (i / (recentScores.length - 1)) * sparkW;
              const y = sparkH - ((s - minScore) / range) * sparkH;
              const isLast = i === recentScores.length - 1;
              return (
                <circle
                  key={i}
                  cx={x} cy={y} r={isLast ? 4 : 2.5}
                  fill={isLast ? "var(--gold)" : "var(--bg-card)"}
                  stroke="var(--gold)"
                  strokeWidth={isLast ? 0 : 1.5}
                />
              );
            })}
          </svg>
        </div>
        <div className="flex justify-between mt-1">
          <p className="text-[9px] font-mono text-[--text-faint]">{recentScores.length}w ago</p>
          <p className="text-[9px] font-mono text-[--text-faint]">this week</p>
        </div>
      </div>

      {/* ── Territory breakdown ── */}
      <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border]">
        <p className="text-[10px] font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-3">Territory Breakdown</p>
        <div className="space-y-3">
          {territoryAvgs.map((t, i) => (
            <div key={t.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="text-xs font-mono text-[--text]">{t.label}</span>
                  {i === 0 && <span className="text-[9px] font-mono text-[--text-faint]">strongest</span>}
                  {i === territoryAvgs.length - 1 && <span className="text-[9px] font-mono text-[--health]">weakest</span>}
                </div>
                <span className="text-xs font-mono text-[--text-muted]">{t.avg.toFixed(1)}/7</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${t.pct * 100}%`, backgroundColor: t.color, opacity: 0.85 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Best streaks ── */}
      <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border]">
        <p className="text-[10px] font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-3">Best Streaks (4+ days/week)</p>
        <div className="space-y-2.5">
          {streaks.map((t, i) => (
            <div key={t.key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-xs font-mono text-[--text]">{t.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {t.streak > 0 ? (
                  <>
                    <div className="flex gap-0.5">
                      {Array.from({ length: Math.min(t.streak, 8) }).map((_, j) => (
                        <div
                          key={j}
                          className="rounded-sm"
                          style={{ width: 8, height: 8, backgroundColor: t.color, opacity: 0.7 + j * 0.04 }}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-mono" style={{ color: t.color }}>
                      {t.streak}w {i === 0 && t.streak >= 3 ? "🔥" : ""}
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-mono text-[--text-faint]">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Drinks trend ── */}
      <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-mono tracking-[0.15em] text-[--text-muted] uppercase">Drinks / Week</p>
          <p className="text-xs font-mono text-[--text-muted]">avg {avgDrinks}/wk</p>
        </div>
        <svg width={(barW + barGap) * recentDrinks.length} height={64} style={{ display: "block", overflow: "visible" }}>
          {recentDrinks.map((d, i) => {
            const barH = drinkMax > 0 ? Math.max(4, (d / drinkMax) * 52) : 4;
            const isLast = i === recentDrinks.length - 1;
            const aboveAvg = d > avgDrinks;
            return (
              <g key={i} transform={`translate(${i * (barW + barGap)}, 0)`}>
                <rect
                  x={0} y={56 - barH} width={barW} height={barH}
                  rx={4}
                  fill={aboveAvg ? "var(--health)" : "var(--wealth)"}
                  opacity={isLast ? 1 : 0.6}
                />
                <text
                  x={barW / 2} y={56 + 10}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--text-faint)"
                  fontFamily="var(--font-geist-mono), monospace"
                >
                  {i === recentDrinks.length - 1 ? "now" : `w-${recentDrinks.length - 1 - i}`}
                </text>
                {d > 0 && (
                  <text
                    x={barW / 2} y={52 - barH}
                    textAnchor="middle"
                    fontSize={9}
                    fill={aboveAvg ? "var(--health)" : "var(--text-muted)"}
                    fontFamily="var(--font-geist-mono), monospace"
                  >
                    {d}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Wolf mode breakdown ── */}
      {wolfTotal > 0 && (
        <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border]">
          <p className="text-[10px] font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-3">Wolf Mode</p>
          <div className="space-y-2.5">
            {wolfEntries.map(([mode, count]) => {
              const pct = wolfTotal > 0 ? count / wolfTotal : 0;
              return (
                <div key={mode}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-[--text] capitalize">{mode}</span>
                    <span className="text-xs font-mono text-[--text-muted]">{Math.round(pct * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct * 100}%`, backgroundColor: WOLF_COLORS[mode], opacity: 0.8 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Stats footer ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Weeks tracked", value: totalWeeks },
          { label: "Best score", value: `${Math.max(...scores)}/35` },
          { label: "Avg score", value: `${(scores.reduce((a,b) => a+b,0)/scores.length).toFixed(0)}/35` },
        ].map(s => (
          <div
            key={s.label}
            className="rounded-xl p-3 text-center border border-[--border]"
            style={{ backgroundColor: "var(--bg-card)" }}
          >
            <p className="text-lg font-bold font-mono" style={{ color: "var(--gold)" }}>{s.value}</p>
            <p className="text-[9px] font-mono text-[--text-faint] mt-0.5 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
