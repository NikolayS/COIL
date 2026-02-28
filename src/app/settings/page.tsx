"use client";

// NOTE: Run Supabase migration:
// ALTER TABLE settings ADD COLUMN IF NOT EXISTS weekly_email_day text DEFAULT 'sunday';
// ALTER TABLE settings ADD COLUMN IF NOT EXISTS report_email text;

import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: formatHour(i),
}));

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailDay, setEmailDay] = useState<"saturday" | "sunday">("sunday");
  const [emailHour, setEmailHour] = useState(18);
  const [timezone, setTimezone] = useState("UTC");
  const [reportEmail, setReportEmail] = useState("");

  const [sending, setSending] = useState(false);
  const [testOverrideEmail, setTestOverrideEmail] = useState("");
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
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);

      const { data } = await supabase
        .from("settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setEmailEnabled(data.weekly_email_enabled);
        setEmailHour(data.weekly_email_hour ?? 18);
        if (data.weekly_email_day) setEmailDay(data.weekly_email_day);
        if (data.timezone) setTimezone(data.timezone);
        // report_email: use saved value, or fall back to auth email
        setReportEmail(data.report_email ?? user.email ?? "");
      } else {
        // New user — pre-fill with auth email
        setReportEmail(user.email ?? "");
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("settings").upsert(
      {
        user_id: user.id,
        weekly_email_enabled: emailEnabled,
        weekly_email_hour: emailHour,
        weekly_email_day: emailDay,
        report_email: reportEmail || user.email,
        timezone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
        body: JSON.stringify({ userId: user.id, overrideEmail }),
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
                  <p className="text-xs text-[--text-dim] mb-2">Delivery day</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["saturday", "sunday"] as const).map((day) => (
                      <button
                        key={day}
                        onClick={() => setEmailDay(day)}
                        className="py-2.5 rounded-lg text-xs font-mono border transition-all duration-200 active:scale-95"
                        style={{
                          borderColor: emailDay === day ? "var(--gold)" : "var(--border)",
                          backgroundColor: emailDay === day ? "var(--gold-bg)" : "transparent",
                          color: emailDay === day ? "var(--gold)" : "var(--text-muted)",
                        }}
                      >
                        {day.charAt(0).toUpperCase() + day.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hour selector — full 24h */}
                <div>
                  <p className="text-xs text-[--text-dim] mb-2">Delivery time</p>
                  <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto pr-1">
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

            {/* Timezone (read-only) */}
            <div>
              <p className="text-xs text-[--text-dim] mb-1">Timezone</p>
              <p className="text-sm font-mono text-[--text-muted]">{timezone}</p>
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
