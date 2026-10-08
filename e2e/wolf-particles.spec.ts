import { test, expect } from '@playwright/test';

test('public wolf experience renders and controls particle states', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/lab/wolf');
  await expect(page.getByRole('heading', { name: 'Gentle. Fierce. Alive.' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Disperse', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Disperse', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await expect(page.getByRole('button', { name: 'Resume motion' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('reduced motion starts paused', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lab/wolf');
  await expect(page.getByRole('button', { name: 'Resume motion' })).toBeVisible();
});

test('original logo remains visible when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === 'webgl') return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto('/lab/wolf');
  await expect(page.getByText('Original logo · animation unavailable')).toBeVisible();
  await expect(page.getByRole('img', { name: /wolf with blue eyes/ })).toHaveCSS('opacity', '1');
});
