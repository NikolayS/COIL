"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message || "Failed to send. Try again.");
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (error) {
      setError(error.message || "Invalid code. Try again.");
      setLoading(false);
    } else {
      window.location.href = "/";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight mb-1" style={{ color: "var(--gold)" }}>COIL</h1>
        <p className="text-xs font-mono tracking-[0.12em] text-[--text-faint] uppercase mb-10">
          Daily Territory Tracker & Journal
        </p>

        {!sent ? (
          <div className="space-y-3">
            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-2">Email</p>
                <input
                  type="text"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-[--bg-input] border border-[--border] rounded-xl px-4 py-3 text-[15px] text-[--text] placeholder-[--text-faint] focus:outline-none focus:border-[--gold-border] transition-colors"
                />
              </div>
              {error && <p className="text-sm" style={{ color: "var(--health)" }}>{error}</p>}
              <button
                type="submit"
                disabled={loading || !email.includes("@")}
                className="w-full py-3.5 rounded-2xl font-mono text-sm tracking-[0.1em] uppercase font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
                style={{ backgroundColor: "var(--gold)", color: "var(--bg)" }}
              >
                {loading ? "Sending…" : "Send magic link"}
              </button>
            </form>

            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
              <span className="text-xs font-mono text-[--text-faint]">or</span>
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
            </div>

            <button
              onClick={() => {
                document.cookie = "coil_demo=1; path=/; max-age=" + 60 * 60 * 24 * 30;
                window.location.href = "/";
              }}
              className="w-full py-3 rounded-2xl font-mono text-xs tracking-[0.1em] uppercase border transition-all duration-200 active:scale-[0.98]"
              style={{ borderColor: "var(--border)", color: "var(--text-dim)", backgroundColor: "transparent" }}
            >
              Continue without account (demo)
            </button>
            <p className="text-center text-[10px] font-mono text-[--text-faint] tracking-wide">
              Data stored locally only — not synced
            </p>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-[--text] text-sm">
              Email sent to <span style={{ color: "var(--gold)" }}>{email}</span>
            </p>
            <p className="text-[--text-dim] text-xs">Click the link in the email, or enter the 6-digit code below.</p>
            <div>
              <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-2">Code</p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="481960"
                className="w-full bg-[--bg-input] border border-[--border] rounded-xl px-4 py-3 text-[24px] font-mono text-center tracking-[0.3em] text-[--text] placeholder-[--text-faint] focus:outline-none focus:border-[--gold-border] transition-colors"
              />
            </div>
            {error && <p className="text-sm" style={{ color: "var(--health)" }}>{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full py-3.5 rounded-2xl font-mono text-sm tracking-[0.1em] uppercase font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
              style={{ backgroundColor: "var(--gold)", color: "var(--bg)" }}
            >
              {loading ? "Verifying…" : "Verify code"}
            </button>
            <button
              type="button"
              onClick={() => { setSent(false); setCode(""); setError(""); }}
              className="w-full py-2 text-xs font-mono text-[--text-dim] tracking-wider"
            >
              ← Use different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
