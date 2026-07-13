"use client";

// NOTE: Run Supabase migration:
// alter table settings add column if not exists weekly_email_day text default 'sunday';
// alter table settings add column if not exists report_email text;

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { ArrowLeft, Sun, Moon, Monitor, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { createTrackerId, DEFAULT_TRACKER_SETTINGS, trackerSettingsFromJson, trackerSettingsFromRow, trackerSettingsToRow, type TrackerDefinition, type TrackerSettings, type TrackerType } from "@/lib/tracking";
import type { User } from "@supabase/supabase-js";

// All IANA timezones supported by the browser
function getAllTimezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (key: string) => string[] })
      .supportedValuesOf("timeZone");
  } catch {
    // Fallback for browsers that don't support supportedValuesOf
    return [
      "UTC",
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "America/Anchorage", "America/Honolulu", "America/Toronto", "America/Vancouver",
      "America/Mexico_City", "America/Sao_Paulo", "America/Argentina/Buenos_Aires",
      "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome", "Europe/Madrid",
      "Europe/Amsterdam", "Europe/Stockholm", "Europe/Oslo", "Europe/Helsinki",
      "Europe/Warsaw", "Europe/Prague", "Europe/Vienna", "Europe/Zurich",
      "Europe/Moscow", "Europe/Istanbul",
      "Asia/Dubai", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok", "Asia/Singapore",
      "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul", "Asia/Hong_Kong",
      "Australia/Sydney", "Australia/Melbourne", "Australia/Perth",
      "Pacific/Auckland", "Pacific/Fiji",
      "Africa/Cairo", "Africa/Nairobi", "Africa/Johannesburg",
    ];
  }
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: formatHour(i),
}));

const TRACKER_EMOJIS = [
  "🎯", "✅", "⭐", "🔥", "💪", "🏋️", "🏃", "🚶",
  "🚴", "🧘", "👟", "❤️", "🧠", "⚡", "😊", "😴",
  "💧", "🥗", "🍎", "☕", "🥃", "🚭", "💊", "🧊",
  "📚", "✍️", "💻", "💼", "📝", "📈", "⏱️", "⏳",
  "🎨", "🎵", "🌱", "🌞", "🌙", "🏠", "🧹", "💰",
] as const;

function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  return (
    <div ref={pickerRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Choose emoji"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="w-14 h-[42px] bg-[--bg-input] border border-[--border] rounded-lg text-xl flex items-center justify-center focus:outline-none focus:border-[--gold-border]"
      >
        {value || "🎯"}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Emoji picker"
          className="absolute top-full left-0 z-30 mt-2 w-64 rounded-xl border border-[--border] bg-[--bg-card] p-3 shadow-xl"
        >
          <div className="grid grid-cols-8 gap-1">
            {TRACKER_EMOJIS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                onClick={() => {
                  onChange(emoji);
                  setOpen(false);
                }}
                aria-label={`Use ${emoji}`}
                aria-pressed={value === emoji}
                className="aspect-square rounded-lg text-xl flex items-center justify-center hover:bg-[--gold-bg]"
                style={{ outline: value === emoji ? "1px solid var(--gold)" : "none" }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label="Custom emoji"
            placeholder="Or type/paste any emoji"
            className="mt-3 w-full bg-[--bg-input] border border-[--border] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[--gold-border]"
            maxLength={8}
          />
        </div>
      )}
    </div>
  );
}

function SettingsInner() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // ── Appearance (theme + palette) — local only, not saved to Supabase ──
  const [theme, setTheme] = useState<"dark" | "light" | "system">("system");
  const [palette, setPalette] = useState<"gold" | "ocean" | "midnight" | "ember" | "iron">("gold");

  const applyTheme = (t: "dark" | "light" | "system") => {
    const resolved = t === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : t;
    document.documentElement.setAttribute("data-theme", resolved);
  };

  const applyPalette = (p: string) => {
    document.documentElement.setAttribute("data-palette", p);
  };

  useEffect(() => {
    const savedTheme = (localStorage.getItem("coil_theme") as "dark" | "light" | "system") || "system";
    setTheme(savedTheme);
    const savedPalette = (localStorage.getItem("coil_palette") as "gold" | "ocean" | "midnight" | "ember" | "iron") || "gold";
    setPalette(savedPalette);
  }, []);

  const handleTheme = (t: "dark" | "light" | "system") => {
    setTheme(t);
    applyTheme(t);
    localStorage.setItem("coil_theme", t);
  };

  const handlePalette = (p: "gold" | "ocean" | "midnight" | "ember" | "iron") => {
    setPalette(p);
    applyPalette(p);
    localStorage.setItem("coil_palette", p);
  };

  const PALETTES: { id: "gold" | "ocean" | "midnight" | "ember" | "iron"; label: string; darkBg: string; lightBg: string; darkAccent: string; lightAccent: string }[] = [
    { id: "gold",     label: "Gold",     darkBg: "#1a1a18", lightBg: "#f5f2ec", darkAccent: "#c9a84c", lightAccent: "#9a7230" },
    { id: "ocean",    label: "Ocean",    darkBg: "#0a1628", lightBg: "#d6e8f5", darkAccent: "#38b2e0", lightAccent: "#0e6fa0" },
    { id: "midnight", label: "Midnight", darkBg: "#100c1e", lightBg: "#e0d8f8", darkAccent: "#a78bfa", lightAccent: "#5b21b6" },
    { id: "ember",    label: "Ember",    darkBg: "#160a06", lightBg: "#f5ede8", darkAccent: "#c24b2a", lightAccent: "#b03a1e" },
    { id: "iron",     label: "Iron",     darkBg: "#0e1014", lightBg: "#e8ecf2", darkAccent: "#8a9bb0", lightAccent: "#4a6080" },
  ];

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailPdf, setEmailPdf] = useState(true);
  const [weekStart, setWeekStart] = useState<"monday" | "sunday">("monday");
  const [emailDay, setEmailDay] = useState<"saturday" | "sunday">("sunday");
  const [emailHour, setEmailHour] = useState(18);
  const [reminder1Enabled, setReminder1Enabled] = useState(true);
  const [reminder1Hour, setReminder1Hour] = useState(8);
  const [reminder2Enabled, setReminder2Enabled] = useState(false);
  const [reminder2Hour, setReminder2Hour] = useState(20);
  const [timezone, setTimezone] = useState("UTC");
  const [reportEmail, setReportEmail] = useState("");
  const [trackerSettings, setTrackerSettings] = useState<TrackerSettings>(DEFAULT_TRACKER_SETTINGS);
  const [addingTracker, setAddingTracker] = useState(false);
  const [trackerDraft, setTrackerDraft] = useState({ label: "", emoji: "🎯", type: "boolean" as TrackerType, unit: "" });

  const allTimezones = useMemo(() => getAllTimezones(), []);

  const [sending, setSending] = useState(false);
  const [testOverrideEmail, setTestOverrideEmail] = useState("");
  const [testWeekChoice, setTestWeekChoice] = useState<"current" | "previous">("current");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        // Demo mode: local settings only, skip Supabase-backed email/reminder fields.
        setTrackerSettings(trackerSettingsFromJson(localStorage.getItem("coil_tracker_settings")));
        setLoading(false);
        return;
      }
      setUser(user);

      const { data } = await supabase
        .from("settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      if (data) {
        // weekly_email_enabled: treat null as true (default on)
        setEmailEnabled(data.weekly_email_enabled ?? true);
        setEmailPdf(data.email_pdf ?? true);
        setWeekStart(data.week_start ?? "monday");
        setEmailHour(data.weekly_email_hour ?? 18);
        if (data.weekly_email_day) setEmailDay(data.weekly_email_day);
        setReminder1Enabled(data.reminder1_enabled ?? true);
        setReminder1Hour(data.reminder1_hour ?? 8);
        setReminder2Enabled(data.reminder2_enabled ?? false);
        setReminder2Hour(data.reminder2_hour ?? 20);
        // saved timezone wins over browser detection; fall back to browser if not saved
        setTimezone(data.timezone || browserTz);
        setReportEmail(data.report_email ?? user.email ?? "");
        setTrackerSettings(trackerSettingsFromRow(data));
      } else {
        // New user — use browser timezone and auth email as defaults
        setTimezone(browserTz);
        setReportEmail(user.email ?? "");
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    if (!user) {
      localStorage.setItem("coil_tracker_settings", JSON.stringify(trackerSettings));
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("settings").upsert(
      {
        user_id: user.id,
        weekly_email_enabled: emailEnabled,
        email_pdf: emailPdf,
        week_start: weekStart,
        weekly_email_hour: emailHour,
        weekly_email_day: emailDay,
        reminder1_enabled: reminder1Enabled,
        reminder1_hour: reminder1Hour,
        reminder2_enabled: reminder2Enabled,
        reminder2_hour: reminder2Hour,
        report_email: reportEmail || user.email,
        timezone,
        ...trackerSettingsToRow(trackerSettings),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    setSaving(false);
    if (error) {
      setSaveError(`Save failed: ${error.message}`);
      setTimeout(() => setSaveError(null), 5000);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const updateTracker = (id: string, patch: Partial<TrackerDefinition>) => {
    setTrackerSettings((prev) => ({
      trackers: prev.trackers.map((tracker) => tracker.id === id ? { ...tracker, ...patch } : tracker),
    }));
  };

  const removeTracker = (id: string) => {
    setTrackerSettings((prev) => ({ trackers: prev.trackers.filter((tracker) => tracker.id !== id) }));
  };

  const addTracker = () => {
    const label = trackerDraft.label.trim();
    if (!label) return;
    setTrackerSettings((prev) => ({
      trackers: [...prev.trackers, {
        id: createTrackerId(label),
        label,
        emoji: trackerDraft.emoji.trim() || "🎯",
        type: trackerDraft.type,
        enabled: true,
        unit: trackerDraft.type === "counter" ? trackerDraft.unit.trim() || undefined : undefined,
      }],
    }));
    setTrackerDraft({ label: "", emoji: "🎯", type: "boolean", unit: "" });
    setAddingTracker(false);
  };

  const handleTestEmail = async () => {
    if (!user) return;
    setSending(true);
    setTestResult(null);
    setTestError(null);
    const overrideEmail = testOverrideEmail.trim() || null;
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, overrideEmail, weekChoice: testWeekChoice, includePdf: emailPdf }),
      });
      const json = await res.json();
      if (res.ok) {
        setTestResult(`Test email sent to ${json.email} (week of ${json.week})`);
        setTimeout(() => setTestResult(null), 5000);
      } else {
        setTestError(`Failed: ${json.error}`);
        setTimeout(() => setTestError(null), 5000);
      }
    } catch (e) {
      setTestError(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
      setTimeout(() => setTestError(null), 5000);
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[--bg] flex items-center justify-center">
        <p className="font-mono text-xs tracking-[0.2em] text-[--text-faint] uppercase">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[--bg]">
      <div className="max-w-md md:max-w-lg lg:max-w-xl mx-auto w-full px-5 md:px-8 pt-8 pb-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <a
            href="/"
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
            style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
          >
            <ArrowLeft size={16} />
          </a>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--gold)" }}>Settings</h1>
        </div>

        <div className="space-y-6">
          {/* ── Appearance card ── */}
          <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border] space-y-5">
            <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase">Appearance</p>

            {/* Mode toggle */}
            <div>
              <p className="text-xs text-[--text-dim] mb-2">Mode</p>
              <div
                className="flex rounded-xl overflow-hidden"
                style={{ border: "1px solid var(--border)", backgroundColor: "var(--bg)" }}
              >
                {([
                  { value: "dark",   label: "Dark",   icon: <Moon size={12} /> },
                  { value: "system", label: "Auto",   icon: <Monitor size={12} /> },
                  { value: "light",  label: "Light",  icon: <Sun size={12} /> },
                ] as const).map((opt, i) => {
                  const isActive = theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleTheme(opt.value)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono transition-all duration-200"
                      style={{
                        backgroundColor: isActive ? "var(--gold-bg)" : "transparent",
                        color: isActive ? "var(--gold)" : "var(--text-muted)",
                        borderRight: i < 2 ? "1px solid var(--border)" : "none",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Theme swatches */}
            <div>
              <p className="text-xs text-[--text-dim] mb-3">Color theme</p>
              <div className="flex gap-3">
                {PALETTES.map((p) => {
                  const isActive = palette === p.id;
                  const isDark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
                  const bgColor = isDark ? p.darkBg : p.lightBg;
                  const accentColor = isDark ? p.darkAccent : p.lightAccent;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handlePalette(p.id)}
                      aria-label={p.label}
                      aria-pressed={isActive}
                      title={p.label}
                      className="flex flex-col items-center gap-1.5 flex-1 transition-all duration-200"
                    >
                      {/* Swatch */}
                      <div
                        className="w-full rounded-xl transition-all duration-200 relative overflow-hidden"
                        style={{
                          height: 44,
                          backgroundColor: bgColor,
                          border: isActive
                            ? `2px solid ${accentColor}`
                            : "2px solid transparent",
                          boxShadow: isActive ? `0 0 0 1px ${accentColor}40` : "none",
                          outline: isActive ? "none" : `1px solid var(--border)`,
                          outlineOffset: "-1px",
                        }}
                      >
                        {/* Accent stripe at bottom */}
                        <div
                          className="absolute bottom-0 left-0 right-0"
                          style={{ height: 6, backgroundColor: accentColor, opacity: 0.9 }}
                        />
                        {/* Mini dot in center */}
                        <div
                          className="absolute top-1/2 left-1/2 rounded-full"
                          style={{
                            width: 8,
                            height: 8,
                            backgroundColor: accentColor,
                            transform: "translate(-50%, -60%)",
                            opacity: 0.7,
                          }}
                        />
                      </div>
                      {/* Label */}
                      <span
                        className="text-[10px] font-mono tracking-wide"
                        style={{
                          color: isActive ? "var(--gold)" : "var(--text-faint)",
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {p.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tracking card */}
          <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border] space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase">Trackers</p>
                <p className="text-xs text-[--text-faint] mt-1">Yes/no habits, quantities, and 1–5 ratings.</p>
              </div>
              <button
                onClick={() => setAddingTracker(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono flex-shrink-0"
                style={{ color: "var(--gold)", backgroundColor: "var(--gold-bg)", border: "1px solid var(--gold-border)" }}
              >
                <Plus size={13} /> Add
              </button>
            </div>

            <div className="space-y-2">
              {trackerSettings.trackers.map((tracker) => {
                const typeLabel = tracker.type === "boolean" ? "YES / NO" : tracker.type === "counter" ? "COUNT" : "1–5";
                return (
                  <div key={tracker.id} className="rounded-xl px-3 py-3 bg-[--bg] border border-[--border] flex items-center gap-3">
                    <span className="text-xl w-7 text-center flex-shrink-0">{tracker.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[--text] truncate">{tracker.label}</p>
                      <p className="text-[10px] font-mono tracking-wider text-[--text-faint] mt-0.5">
                        {typeLabel}{tracker.unit && tracker.type === "counter" ? ` · ${tracker.unit}` : ""}
                      </p>
                    </div>
                    {!tracker.builtIn && (
                      <button
                        onClick={() => removeTracker(tracker.id)}
                        aria-label={`Delete ${tracker.label}`}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[--text-faint] hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => updateTracker(tracker.id, { enabled: !tracker.enabled })}
                      aria-label={`${tracker.enabled ? "Disable" : "Enable"} ${tracker.label}`}
                      aria-pressed={tracker.enabled}
                      className="w-12 h-7 rounded-full transition-colors duration-200 relative flex-shrink-0"
                      style={{ backgroundColor: tracker.enabled ? "var(--gold)" : "var(--bg-card)", border: "1px solid var(--border)" }}
                    >
                      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200" style={{ left: tracker.enabled ? "22px" : "2px" }} />
                    </button>
                  </div>
                );
              })}
            </div>

            {addingTracker && (
              <div className="rounded-xl p-4 border border-[--gold-border] bg-[--bg] space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[--text]">New tracker</p>
                  <button onClick={() => setAddingTracker(false)} className="text-[--text-faint]" aria-label="Close">
                    <X size={16} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <EmojiPicker
                    value={trackerDraft.emoji}
                    onChange={(emoji) => setTrackerDraft((draft) => ({ ...draft, emoji }))}
                  />
                  <input
                    value={trackerDraft.label}
                    onChange={(event) => setTrackerDraft((draft) => ({ ...draft, label: event.target.value }))}
                    placeholder="Tracker name"
                    className="flex-1 min-w-0 bg-[--bg-input] border border-[--border] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[--gold-border]"
                    maxLength={40}
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "boolean", label: "Yes / No", hint: "Habit" },
                    { value: "counter", label: "Count", hint: "Quantity" },
                    { value: "rating", label: "1–5", hint: "Quality" },
                  ] as const).map((option) => {
                    const active = trackerDraft.type === option.value;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setTrackerDraft((draft) => ({ ...draft, type: option.value }))}
                        className="rounded-lg py-2 px-1 border text-center"
                        style={{ borderColor: active ? "var(--gold)" : "var(--border)", backgroundColor: active ? "var(--gold-bg)" : "transparent" }}
                      >
                        <span className="block text-xs" style={{ color: active ? "var(--gold)" : "var(--text-muted)" }}>{option.label}</span>
                        <span className="block text-[10px] text-[--text-faint] mt-0.5">{option.hint}</span>
                      </button>
                    );
                  })}
                </div>
                {trackerDraft.type === "counter" && (
                  <input
                    value={trackerDraft.unit}
                    onChange={(event) => setTrackerDraft((draft) => ({ ...draft, unit: event.target.value }))}
                    placeholder="Unit (optional), e.g. pages, km, cups"
                    className="w-full bg-[--bg-input] border border-[--border] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[--gold-border]"
                    maxLength={20}
                  />
                )}
                <button
                  onClick={addTracker}
                  disabled={!trackerDraft.label.trim()}
                  className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                  style={{ backgroundColor: "var(--gold)", color: "white" }}
                >
                  Add tracker
                </button>
              </div>
            )}
          </div>

          {/* Auth-required sections — hidden in demo mode */}
          {!user && (
            <div
              className="rounded-2xl p-5 border text-center space-y-2"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
            >
              <p className="text-sm font-mono text-[--text-muted]">Sign in to access email reports, reminders, and sync settings.</p>
              <a
                href="/login"
                className="inline-block mt-2 px-5 py-2.5 rounded-xl text-xs font-mono tracking-[0.1em] uppercase font-medium transition-all duration-200"
                style={{ backgroundColor: "var(--gold)", color: "var(--bg)" }}
              >
                Sign in
              </a>
            </div>
          )}

          {user && (<>

          {/* Weekly email card */}
          <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border] space-y-4">
            <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase">Weekly Email Report</p>

            {/* Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-[--text]">Send weekly email</span>
              <button
                onClick={() => setEmailEnabled(!emailEnabled)}
                className="w-12 h-7 rounded-full transition-colors duration-200 relative"
                style={{ backgroundColor: emailEnabled ? "var(--gold)" : "var(--bg)", border: "1px solid var(--border)" }}
              >
                <div
                  className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200"
                  style={{ left: emailEnabled ? "22px" : "2px" }}
                />
              </button>
            </div>

            {emailEnabled && (
              <>
                {/* Day selector */}
                <div>
                  <p className="text-xs text-[--text-dim] mb-2">First day of week</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { value: "sunday", label: "Sunday", delivers: "Sun" },
                      { value: "monday", label: "Monday", delivers: "Mon" },
                    ] as const).map(({ value, label, delivers }) => (
                      <button
                        key={value}
                        onClick={() => setWeekStart(value)}
                        className="py-2.5 rounded-lg text-xs font-mono border transition-all duration-200 active:scale-95 flex flex-col items-center gap-0.5"
                        style={{
                          borderColor: weekStart === value ? "var(--gold)" : "var(--border)",
                          backgroundColor: weekStart === value ? "var(--gold-bg)" : "transparent",
                          color: weekStart === value ? "var(--gold)" : "var(--text-muted)",
                        }}
                      >
                        <span>{label}</span>
                        <span style={{ fontSize: "10px", opacity: 0.7 }}>report {delivers}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hour selector — full 24h */}
                <div>
                  <p className="text-xs text-[--text-dim] mb-2">Delivery time</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {HOUR_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setEmailHour(opt.value)}
                        className="py-2.5 rounded-lg text-xs font-mono border transition-all duration-200 active:scale-95"
                        style={{
                          borderColor: emailHour === opt.value ? "var(--gold)" : "var(--border)",
                          backgroundColor: emailHour === opt.value ? "var(--gold-bg)" : "transparent",
                          color: emailHour === opt.value ? "var(--gold)" : "var(--text-muted)",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* PDF attachment toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-[--text]">Attach PDF</span>
                    <p className="text-xs text-[--text-faint] mt-0.5">Formatted report as PDF attachment</p>
                  </div>
                  <button
                    onClick={() => setEmailPdf(!emailPdf)}
                    className="w-12 h-7 rounded-full transition-colors duration-200 relative flex-shrink-0"
                    style={{ backgroundColor: emailPdf ? "var(--gold)" : "var(--bg)", border: "1px solid var(--border)" }}
                  >
                    <div
                      className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200"
                      style={{ left: emailPdf ? "22px" : "2px" }}
                    />
                  </button>
                </div>
              </>
            )}

            {/* Report email — editable */}
            <div>
              <p className="text-xs text-[--text-dim] mb-1">Report email</p>
              <input
                type="email"
                value={reportEmail}
                onChange={(e) => setReportEmail(e.target.value)}
                placeholder={user?.email ?? ""}
                className="w-full bg-transparent text-sm font-mono rounded-lg px-3 py-2 outline-none transition-colors"
                style={{
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
              <p className="text-xs text-[--text-faint] mt-1">
                Defaults to your account email if left unchanged.
              </p>
            </div>

            {/* Timezone — native select */}
            <div>
              <p className="text-xs text-[--text-dim] mb-1">Timezone</p>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-transparent text-sm font-mono rounded-lg px-3 py-2 outline-none transition-colors appearance-none"
                style={{ color: "var(--text)", border: "1px solid var(--border)", backgroundColor: "var(--bg-card)" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              >
                {allTimezones.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Test email card */}
          <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border] space-y-3">
            <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase">Send Test Email</p>

            <div>
              <p className="text-xs text-[--text-dim] mb-1">Send to (leave blank to use report email)</p>
              <input
                type="email"
                value={testOverrideEmail}
                onChange={(e) => setTestOverrideEmail(e.target.value)}
                placeholder={reportEmail || user?.email || ""}
                className="w-full bg-transparent text-sm font-mono rounded-lg px-3 py-2 outline-none transition-colors"
                style={{
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </div>

            <div>
              <p className="text-xs text-[--text-dim] mb-2">Week</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(["previous", "current"] as const).map((choice) => (
                  <button
                    key={choice}
                    onClick={() => setTestWeekChoice(choice)}
                    className="py-2.5 rounded-lg text-xs font-mono border transition-all duration-200 active:scale-95"
                    style={{
                      borderColor: testWeekChoice === choice ? "var(--gold)" : "var(--border)",
                      backgroundColor: testWeekChoice === choice ? "var(--gold-bg)" : "transparent",
                      color: testWeekChoice === choice ? "var(--gold)" : "var(--text-muted)",
                    }}
                  >
                    {choice.charAt(0).toUpperCase() + choice.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleTestEmail}
              disabled={sending}
              className="w-full py-3 rounded-xl font-mono text-sm tracking-[0.1em] uppercase font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
              style={{ backgroundColor: "var(--bg)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              {sending ? "Sending..." : "Send Test"}
            </button>

            {testResult && (
              <p className="text-xs font-mono text-center" style={{ color: "var(--green, #4ade80)" }}>
                {testResult}
              </p>
            )}
            {testError && (
              <p className="text-xs font-mono text-center" style={{ color: "var(--red, #f87171)" }}>
                {testError}
              </p>
            )}
          </div>

          {/* Daily reminders card */}
          <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border] space-y-4">
            <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase">Daily Reminders</p>

            {/* Reminder 1 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-[--text]">Morning reminder</span>
                  <p className="text-xs text-[--text-faint] mt-0.5">Fill in yesterday's entries</p>
                </div>
                <button
                  onClick={() => setReminder1Enabled(!reminder1Enabled)}
                  className="w-12 h-7 rounded-full transition-colors duration-200 relative flex-shrink-0"
                  style={{ backgroundColor: reminder1Enabled ? "var(--gold)" : "var(--bg)", border: "1px solid var(--border)" }}
                >
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200" style={{ left: reminder1Enabled ? "22px" : "2px" }} />
                </button>
              </div>
              {reminder1Enabled && (
                <div className="grid grid-cols-4 gap-1.5">
                  {HOUR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setReminder1Hour(opt.value)}
                      className="py-2 rounded-lg text-xs font-mono border transition-all duration-200 active:scale-95"
                      style={{
                        borderColor: reminder1Hour === opt.value ? "var(--gold)" : "var(--border)",
                        backgroundColor: reminder1Hour === opt.value ? "var(--gold-bg)" : "transparent",
                        color: reminder1Hour === opt.value ? "var(--gold)" : "var(--text-muted)",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ height: "1px", backgroundColor: "var(--border)" }} />

            {/* Reminder 2 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-[--text]">Evening reminder</span>
                  <p className="text-xs text-[--text-faint] mt-0.5">End of day check-in</p>
                </div>
                <button
                  onClick={() => setReminder2Enabled(!reminder2Enabled)}
                  className="w-12 h-7 rounded-full transition-colors duration-200 relative flex-shrink-0"
                  style={{ backgroundColor: reminder2Enabled ? "var(--gold)" : "var(--bg)", border: "1px solid var(--border)" }}
                >
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200" style={{ left: reminder2Enabled ? "22px" : "2px" }} />
                </button>
              </div>
              {reminder2Enabled && (
                <div className="grid grid-cols-4 gap-1.5">
                  {HOUR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setReminder2Hour(opt.value)}
                      className="py-2 rounded-lg text-xs font-mono border transition-all duration-200 active:scale-95"
                      style={{
                        borderColor: reminder2Hour === opt.value ? "var(--gold)" : "var(--border)",
                        backgroundColor: reminder2Hour === opt.value ? "var(--gold-bg)" : "transparent",
                        color: reminder2Hour === opt.value ? "var(--gold)" : "var(--text-muted)",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          </>)} {/* end auth-required sections */}

          {saveError && (
            <p className="text-xs font-mono text-center px-2" style={{ color: "var(--red, #f87171)" }}>
              {saveError}
            </p>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl font-mono text-sm tracking-[0.1em] uppercase font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
            style={{ backgroundColor: "var(--gold)", color: "var(--bg)" }}
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </button>


        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsInner />
    </Suspense>
  );
}
