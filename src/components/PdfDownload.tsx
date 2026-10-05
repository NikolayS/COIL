"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { fetchPdf, isIosDevice, savePdf } from "@/lib/pdf-download";

// Saving/preparing requires an async round trip. iOS sharing then gets its own
// fresh tap, preserving user activation without ever navigating to a file.
export function PdfDownload({ url, filename, ready, revision = "", beforePrepare, label }: {
  url: string;
  filename: string;
  ready: boolean;
  revision?: string;
  beforePrepare?: () => Promise<void>;
  label: string;
}) {
  const [prepared, setPrepared] = useState<{ key: string; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const key = JSON.stringify([url, filename, revision, ready]);
  const file = prepared?.key === key ? prepared.file : null;

  useEffect(() => {
    setPrepared(null);
    setError(null);
    setBusy(false);
    return () => { controller.current?.abort(); };
  }, [key]);

  const handleSave = async () => {
    if (busy || !ready) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError(null);
    try {
      const ios = isIosDevice();
      if (ios && file) {
        await savePdf(file, true);
      } else {
        await beforePrepare?.();
        if (request.signal.aborted) return;
        const pdf = await fetchPdf(url, filename, request.signal);
        if (request.signal.aborted) return;
        if (ios) setPrepared({ key, file: pdf });
        else await savePdf(pdf, false);
      }
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : "Could not save PDF. Please retry.");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  };

  return <div>
    <button type="button" onClick={handleSave} disabled={busy || !ready}
      className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-[--border] font-mono text-xs tracking-[0.1em] uppercase text-[--text-muted] disabled:opacity-50">
      <Download size={15} />
      {busy ? "Saving & preparing…" : file ? "Save PDF" : label}
    </button>
    {file && <p className="text-center text-xs text-[--text-faint] mt-1.5">PDF ready. Tap Save PDF, then choose Save to Files. Cancel returns here.</p>}
    {error && <p role="alert" className="text-center text-xs mt-1.5 text-red-400">{error}</p>}
  </div>;
}
