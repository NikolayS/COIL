import { test, expect } from "@playwright/test";

test("Greyscale stays neutral in both modes and persists without changing other themes", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "coil_demo", value: "1", url: baseURL! }]);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Greyscale", exact: true }).click();
  for (const mode of ["Dark", "Light"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(page.getByRole("button", { name: "Greyscale", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/");
    const neutral = await page.evaluate(() => {
      const tokens = ["--gold", "--bg", "--bg-card", "--text", "--self", "--health", "--wealth", "--relationships", "--business", "--error"];
      return tokens.every(token => {
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        document.body.append(probe);
        const channels = getComputedStyle(probe).color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        probe.remove();
        return channels[0] === channels[1] && channels[1] === channels[2];
      });
    });
    expect(neutral).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("data-palette", "greyscale");
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode.toLowerCase());
    // Actual territory labels/markers use the palette too, not just swatches.
    const selfLabel = page.locator('span[style*="--territory-ink"]').filter({ hasText: "Self" }).first();
    await expect(selfLabel).toHaveCSS("color", mode === "Dark" ? "rgb(189, 189, 189)" : "rgb(82, 82, 82)");
    await page.goto("/settings");
    await page.reload();
    await expect(page.getByRole("button", { name: "Greyscale", exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  // Selecting an existing palette restores its original accent and territory colors.
  await page.getByRole("button", { name: "Gold", exact: true }).click();
  await page.goto("/");
  await expect(page.locator('span[style*="--territory-ink"]').filter({ hasText: "Self" }).first()).toHaveCSS("color", "rgb(74, 158, 107)");
  expect(await page.evaluate(() => localStorage.getItem("coil_palette"))).toBe("gold");
});
