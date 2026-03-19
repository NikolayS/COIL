"use client";

import { Suspense } from "react";
import { useState } from "react";
import { createClient } from "@/lib/supabase";

function LoginInner() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message || "Google sign-in failed.");
      setLoading(false);
    }
  };

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
        <p className="text-xs font-mono tracking-[0.12em] text-[--text-faint] uppercase mb-6">
          Daily Territory Tracker & Journal
        </p>

        {!sent ? (
          <div className="space-y-2.5">
            {/* Google OAuth */}
            <button
              onClick={handleGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-2xl font-mono text-sm tracking-[0.08em] font-medium border transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--text)", backgroundColor: "var(--bg-card)" }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3 py-0.5">
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
              <span className="text-xs font-mono text-[--text-faint]">or use email</span>
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
            </div>

            <form onSubmit={handleSend} className="space-y-3">
              <div>
                <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-1.5">Email</p>
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-[--bg-input] border border-[--border] rounded-xl px-4 py-2.5 text-[15px] text-[--text] placeholder-[--text-faint] focus:outline-none focus:border-[--gold-border] transition-colors"
                />
              </div>
              {error && <p className="text-sm" style={{ color: "var(--health)" }}>{error}</p>}
              <button
                type="submit"
                disabled={loading || !email.includes("@")}
                className="w-full py-3 rounded-2xl font-mono text-sm tracking-[0.1em] uppercase font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
                style={{ backgroundColor: "var(--gold)", color: "var(--bg)" }}
              >
                {loading ? "Sending…" : "Send magic link"}
              </button>
            </form>

            <div className="flex items-center gap-3 py-0.5">
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
              <span className="text-xs font-mono text-[--text-faint]">or just test it</span>
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
            </div>

            <button
              onClick={() => {
                document.cookie = "coil_demo=1; path=/; max-age=" + 60 * 60 * 24 * 30;
                window.location.href = "/";
              }}
              className="w-full py-2.5 rounded-2xl font-mono text-xs tracking-[0.1em] uppercase border transition-all duration-200 active:scale-[0.98]"
              style={{ borderColor: "var(--border)", color: "var(--text-dim)", backgroundColor: "transparent" }}
            >
              Continue without account (demo)
            </button>
            <p className="text-center text-[10px] font-mono text-[--text-faint] tracking-wide">
              Demo mode: data stored locally only, not synced
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
      <div className="fixed bottom-3 left-0 right-0 text-center">
        <span className="text-[9px] font-mono text-[--text-faint] opacity-40">
          {process.env.NEXT_PUBLIC_BUILD_VERSION || "dev"}
          {process.env.NEXT_PUBLIC_GIT_BRANCH ? ` · ${process.env.NEXT_PUBLIC_GIT_BRANCH}` : ""}
        </span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
