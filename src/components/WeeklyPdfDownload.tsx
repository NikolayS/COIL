"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { fetchWeeklyPdf, isIosDevice, savePdf } from "@/lib/pdf-download";

export function WeeklyPdfDownload({ weekOf }: { weekOf: string }) {
  const [ios, setIos] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const onIos = isIosDevice();
    setIos(onIos);
    if (!onIos) {
      setBusy(false);
      return () => controller.abort();
    }
    setBusy(true);
    setError(null);
    setFile(null);
    fetchWeeklyPdf(weekOf, controller.signal)
      .then((pdf) => { if (!controller.signal.aborted) setFile(pdf); })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not prepare PDF.");
      })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [weekOf, attempt]);

  const handleSave = async () => {
    if (busy) return;
    if (ios && !file) {
      setAttempt((value) => value + 1);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Prepared iOS files reach navigator.share before any await.
      if (ios && file) await savePdf(file, true);
      else await savePdf(await fetchWeeklyPdf(weekOf), false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save PDF. Please retry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleSave}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2.5 py-4 mt-2 rounded-2xl font-mono text-sm tracking-[0.1em] uppercase font-medium border transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "transparent" }}
      >
        <Download size={16} />
        {busy ? "Preparing PDF…" : ios ? (file ? "Save PDF" : "Retry PDF") : "Download PDF"}
      </button>
      {ios && file && <p className="text-center text-xs text-[--text-faint] mt-1.5">Choose Save to Files in the share sheet. Cancel returns here.</p>}
      {error && <p role="alert" className="text-center text-xs mt-1.5" style={{ color: "var(--error, #e55)" }}>{error}</p>}
    </div>
  );
}
