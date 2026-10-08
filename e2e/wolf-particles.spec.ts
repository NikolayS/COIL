import { test, expect } from '@playwright/test';

test('public particle-only scene animates and reacts to mouse and click', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/lab/wolf');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  expect(await page.locator('body').innerText()).toBe('');
  await expect(page.locator('main').getByRole('button')).toHaveCount(0);
  const before = await page.screenshot();
  await page.waitForTimeout(500);
  expect((await page.screenshot()).equals(before)).toBe(false);
  await page.mouse.move(640, 350);
  const pointer = await page.screenshot();
  expect(pointer.equals(before)).toBe(false);
  await canvas.click({ position: { x: 600, y: 300 } });
  await page.waitForTimeout(350);
  expect((await page.screenshot()).equals(pointer)).toBe(false);
  expect(errors).toEqual([]);
});

test('full-screen scene fits a phone and responds to touch', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/lab/wolf');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const box = await canvas.boundingBox();
  expect(box?.width).toBe(390);
  expect(box?.height).toBe(844);
  await page.touchscreen.tap(195, 422);
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await context.close();
});

test('original logo remains visible when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2') return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto('/lab/wolf');
  expect(await page.locator('body').innerText()).toBe('');
  await expect(page.locator('main img')).toHaveCSS('opacity', '1');
});

test('mouse and click change rendered particles even with idle animation disabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lab/wolf');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(1200);
  const still = await page.screenshot();
  await page.waitForTimeout(300);
  expect((await page.screenshot()).equals(still)).toBe(true);
  await page.mouse.move(850, 360);
  await page.waitForTimeout(1000);
  const moved = await page.screenshot();
  expect(moved.equals(still)).toBe(false);
  await page.mouse.click(850, 360);
  await expect(canvas).toHaveAttribute('data-bursts', '1');
  await page.waitForTimeout(150);
  expect((await page.screenshot()).equals(moved)).toBe(false);
  await page.mouse.up();
});

test('startup does not flash the static logo while particle sampling loads', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/brand/the-powerful-man-wolf.png', async route => {
    await gate;
    await route.continue();
  });
  await page.goto('/lab/wolf', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main img')).toHaveCSS('opacity', '0');
  release();
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
});

test('drag rotates without bursting; releasing a tap triggers a small burst', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lab/wolf');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await page.mouse.move(600, 350);
  await page.waitForTimeout(1000);
  const front = await page.screenshot();
  await page.mouse.down();
  await page.mouse.move(1000, 400, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  await expect(canvas).toHaveAttribute('data-bursts', '0');
  expect((await page.screenshot()).equals(front)).toBe(false);
  await canvas.click({ position: { x: 600, y: 350 } });
  await expect(canvas).toHaveAttribute('data-bursts', '1');
});
