import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWeeklyPdf, isIosDevice, savePdf } from "@/lib/pdf-download";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("weekly PDF saving", () => {
  const file = new File(["%PDF-1.7"], "coil-2026-09-07.pdf", { type: "application/pdf" });

  it.each([
    ["iPhone", "iPhone", 1, true],
    ["Safari", "MacIntel", 5, true],
    ["Safari", "MacIntel", 0, false],
    ["Android", "Linux", 5, false],
  ])("detects iOS including desktop-mode iPad: %s %s %s", (userAgent, platform, maxTouchPoints, expected) => {
    vi.stubGlobal("navigator", { userAgent, platform, maxTouchPoints });
    expect(isIosDevice()).toBe(expected);
  });

  it("shares the prepared PDF synchronously without navigating or fetching", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    // No document/window are installed: a navigation fallback would fail this test.
    const saving = savePdf(file, true);
    expect(share).toHaveBeenCalledWith({ files: [file] });
    expect(fetch).not.toHaveBeenCalled();
    await saving;
  });

  it("cancellation stays in the app without falling back to a file navigation", async () => {
    vi.stubGlobal("navigator", {
      canShare: () => true,
      share: vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")),
    });
    await expect(savePdf(file, true)).resolves.toBeUndefined();
  });

  it("unsupported iOS file sharing gives a safe alternative, never a download link", async () => {
    vi.stubGlobal("navigator", { canShare: () => false });
    await expect(savePdf(file, true)).rejects.toThrow("Use Send Email");
  });

  it("reports sharing failure without opening a viewer", async () => {
    vi.stubGlobal("navigator", {
      canShare: () => true,
      share: vi.fn().mockRejectedValue(new DOMException("Tap again", "NotAllowedError")),
    });
    await expect(savePdf(file, true)).rejects.toThrow("Tap again");
  });

  it("restores the PDF MIME type from the binary HTTP attachment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("%PDF-1.7", {
      headers: { "Content-Type": "application/octet-stream" },
    })));
    const result = await fetchWeeklyPdf("2026-09-07");
    expect(result.name).toBe("coil-2026-09-07.pdf");
    expect(result.type).toBe("application/pdf");
    expect(await result.text()).toBe("%PDF-1.7");
  });

  it("does not save authentication errors as PDFs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 })));
    await expect(fetchWeeklyPdf("2026-09-07")).rejects.toThrow("Unauthorized");
  });

  it("rejects a successful redirect to the login page", async () => {
    const response = new Response("<html>Login</html>");
    Object.defineProperty(response, "redirected", { value: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(fetchWeeklyPdf("2026-09-07")).rejects.toThrow("sign in again");
  });

  it("rejects a 200 HTML response even without a redirect", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Login</html>")));
    await expect(fetchWeeklyPdf("2026-09-07")).rejects.toThrow("did not return a PDF");
  });

  it("passes cancellation to the fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchWeeklyPdf("2026-09-07", controller.signal)).rejects.toThrow("Aborted");
    expect(fetch).toHaveBeenCalledWith("/api/pdf/download?weekOf=2026-09-07", { signal: controller.signal });
  });

  it("downloads on desktop and cleans up the temporary link and URL", async () => {
    const link = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal("document", { createElement: () => link, body: { appendChild } });
    const setTimeout = vi.fn();
    vi.stubGlobal("window", { setTimeout });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    await savePdf(file, false);
    expect(link.download).toBe(file.name);
    expect(link.href).toBe("blob:pdf");
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    setTimeout.mock.calls[0][0]();
    expect(revoke).toHaveBeenCalledWith("blob:pdf");
  });
});
