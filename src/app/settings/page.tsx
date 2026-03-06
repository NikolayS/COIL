"use client";

// NOTE: Run Supabase migration:
// alter table settings add column if not exists weekly_email_day text default 'sunday';
// alter table settings add column if not exists report_email text;

import { useState, useEffect, useMemo, Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase";
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

function SettingsInner() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
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
  const [notes, setNotes] = useState("");

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
        window.location.href = "/login";
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
        setNotes(data.notes ?? "");
      } else {
        // New user — use browser timezone and auth email as defaults
        setTimezone(browserTz);
        setReportEmail(user.email ?? "");
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
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
        notes,
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

          {/* Notes card */}
          <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border] space-y-3">
            <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase">Notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Personal notes, dietary preferences, reminders..."
              rows={4}
              className="w-full bg-transparent text-sm font-mono rounded-lg px-3 py-2 outline-none transition-colors resize-y"
              style={{
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
          </div>

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
