"use client";

import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[--bg] flex items-center justify-center px-5">
      <div className="text-center max-w-sm">
        <p className="font-mono text-xs tracking-[0.25em] text-[--text-faint] uppercase mb-4">404</p>
        <h1 className="text-2xl font-bold tracking-tight mb-2" style={{ color: "var(--gold)" }}>
          Page not found
        </h1>
        <p className="text-sm text-[--text-muted] mb-8">
          This page does not exist.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.15em] uppercase transition-colors"
          style={{ color: "var(--gold)" }}
        >
          <ArrowLeft size={14} />
          Back to COIL
        </a>
      </div>
    </div>
  );
}
