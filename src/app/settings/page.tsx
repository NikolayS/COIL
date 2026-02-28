"use client";

import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const HOUR_OPTIONS = [
  { value: 18, label: "6:00 PM" },
  { value: 19, label: "7:00 PM" },
  { value: 20, label: "8:00 PM" },
  { value: 21, label: "9:00 PM" },
  { value: 22, label: "10:00 PM" },
];

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailHour, setEmailHour] = useState(20);
  const [timezone, setTimezone] = useState("UTC");

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
        setEmailHour(data.weekly_email_hour);
        if (data.timezone) setTimezone(data.timezone);
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
        timezone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
          {/* Weekly email toggle */}
          <div className="bg-[--bg-card] rounded-2xl p-4 border border-[--border] space-y-4">
            <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase">Weekly Email Report</p>

            <div className="flex items-center justify-between">
              <span className="text-sm text-[--text]">Send weekly email</span>
              <button
                onClick={() => setEmailEnabled(!emailEnabled)}
                className="w-12 h-7 rounded-full transition-colors duration-200 relative"
                style={{ backgroundColor: emailEnabled ? "var(--gold)" : "var(--bg)" , border: "1px solid var(--border)" }}
              >
                <div
                  className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all duration-200"
                  style={{ left: emailEnabled ? "22px" : "2px" }}
                />
              </button>
            </div>

            {/* Hour selector — only shown when toggle is on */}
            {emailEnabled && (
              <div>
                <p className="text-xs text-[--text-dim] mb-2">Delivery time (Sunday)</p>
                <div className="grid grid-cols-5 gap-1.5">
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
            )}

            {/* Timezone (read-only) */}
            <div>
              <p className="text-xs text-[--text-dim] mb-1">Timezone</p>
              <p className="text-sm font-mono text-[--text-muted]">{timezone}</p>
            </div>

            {/* Email (read-only) */}
            <div>
              <p className="text-xs text-[--text-dim] mb-1">Email address</p>
              <p className="text-sm font-mono text-[--text-muted]">{user?.email}</p>
            </div>
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
