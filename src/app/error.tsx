"use client";

import { useEffect } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[--bg] flex items-center justify-center px-5">
      <div className="text-center max-w-sm">
        <p className="font-mono text-xs tracking-[0.25em] text-[--text-faint] uppercase mb-4">Error</p>
        <h1 className="text-2xl font-bold tracking-tight mb-2" style={{ color: "var(--gold)" }}>
          Something went wrong
        </h1>
        <p className="text-sm text-[--text-muted] mb-8">
          An unexpected error occurred. Try refreshing or go back to the main page.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.15em] uppercase px-4 py-2 rounded-xl transition-all"
            style={{ backgroundColor: "var(--gold)", color: "var(--bg)" }}
          >
            <RefreshCw size={13} />
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.15em] uppercase transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft size={13} />
            Home
          </a>
        </div>
      </div>
    </div>
  );
}
