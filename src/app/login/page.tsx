"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight mb-1" style={{ color: "var(--gold)" }}>
          COIL
        </h1>
        <p className="text-xs font-mono tracking-[0.12em] text-[--text-faint] uppercase mb-10">
          Daily Territory Tracker & Journal
        </p>

        {sent ? (
          <div className="text-center space-y-3">
            <p className="text-[--text] text-base font-medium">Check your email</p>
            <p className="text-[--text-muted] text-sm">
              Magic link sent to <span style={{ color: "var(--gold)" }}>{email}</span>
            </p>
            <p className="text-[--text-dim] text-xs mt-4">Click the link to sign in. You can close this tab.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <p className="text-xs font-mono tracking-[0.15em] text-[--text-muted] uppercase mb-2">Email</p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-[--bg-input] border border-[--border] rounded-xl px-4 py-3 text-[15px] text-[--text] placeholder-[--text-faint] focus:outline-none focus:border-[--gold-border] transition-colors"
              />
            </div>
            {error && <p className="text-sm" style={{ color: "var(--health)" }}>{error}</p>}
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-3.5 rounded-2xl font-mono text-sm tracking-[0.1em] uppercase font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
              style={{ backgroundColor: "var(--gold)", color: "var(--bg)" }}
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
