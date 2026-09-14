export function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export async function fetchWeeklyPdf(weekOf: string, signal?: AbortSignal) {
  const response = await fetch(`/api/pdf/download?weekOf=${encodeURIComponent(weekOf)}`, { signal });
  if (response.redirected) throw new Error("Please sign in again before saving the PDF.");
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Could not prepare the PDF. Please retry.");
  }
  const blob = await response.blob();
  if (await blob.slice(0, 5).text() !== "%PDF-") {
    throw new Error("The server did not return a PDF. Please sign in again or retry.");
  }
  return new File([blob], `coil-${weekOf}.pdf`, { type: "application/pdf" });
}

// Call directly from a click: awaiting a fetch first can lose iOS user activation.
export async function savePdf(file: File, ios: boolean) {
  if (ios) {
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
      throw new Error("Saving files is unavailable here. Use Send Email below, or open COIL in Safari.");
    }
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      throw error;
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
