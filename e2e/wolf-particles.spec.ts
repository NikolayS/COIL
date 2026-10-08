import { test, expect } from '@playwright/test';

for (const phone of [false, true]) {
  test(`${phone ? 'phone' : 'desktop'} starts scattered and assembles into the wolf`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 720 },
      hasTouch: phone, isMobile: phone,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/lab/wolf');
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    await expect(canvas).toHaveAttribute('data-assembled', 'false');
    await expect(page.locator('main img')).toHaveCSS('opacity', '0');
    const cloud = await canvas.screenshot({ path: testInfo.outputPath('cloud.png') });
    await page.waitForTimeout(1100);
    const gathering = await canvas.screenshot({ path: testInfo.outputPath('gathering.png') });
    expect(gathering.equals(cloud)).toBe(false);
    await expect(canvas).toHaveAttribute('data-assembled', 'true', { timeout: 10000 });
    const head = await canvas.screenshot({ path: testInfo.outputPath('head.png') });
    expect(head.equals(gathering)).toBe(false);
    await expect(canvas).toHaveAttribute('data-bursts', '0');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    await expect(canvas).toHaveAttribute('data-assembled', 'true');
    expect(errors).toEqual([]);
    await context.close();
  });
}

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

for (const touch of [false, true]) {
  test(`${touch ? 'touch' : 'mouse'} vertical drag follows the pointer without bursting`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 },
      hasTouch: touch, isMobile: touch, reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    // Observe the rotation actually submitted to WebGL, not gesture bookkeeping.
    await page.addInitScript(() => {
      const locations = new WeakMap<WebGLUniformLocation, string>();
      const getLocation = WebGLRenderingContext.prototype.getUniformLocation;
      const setRotation = WebGLRenderingContext.prototype.uniform2f;
      WebGLRenderingContext.prototype.getUniformLocation = function (program, name) {
        const location = getLocation.call(this, program, name);
        if (location) locations.set(location, name);
        return location;
      };
      WebGLRenderingContext.prototype.uniform2f = function (location, x, y) {
        if (location && locations.get(location) === 'rotation') {
          (window as unknown as { wolfRotation: number[] }).wolfRotation = [x, y];
        }
        return setRotation.call(this, location, x, y);
      };
    });
    await page.goto('/lab/wolf');
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    await page.waitForTimeout(1200);
    const before = await canvas.screenshot();
    const pitch = () => page.evaluate(() => (window as unknown as { wolfRotation: number[] }).wolfRotation[1]);
    const initial = await pitch();
    const x = touch ? 195 : 640;
    const y = touch ? 422 : 360;
    const client = touch ? await context.newCDPSession(page) : null;
    const drag = async (from: number, to: number) => {
      if (client) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] });
        for (let step = 1; step <= 8; step++) {
          await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + (to - from) * step / 8 }] });
        }
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(x, from);
        await page.mouse.down();
        await page.mouse.move(x, to, { steps: 8 });
        await page.mouse.up();
      }
      await page.waitForTimeout(1000);
    };
    await drag(y, y + 90);
    expect(await pitch()).toBeLessThan(initial - 0.2);
    expect((await canvas.screenshot()).equals(before)).toBe(false);
    await drag(y + 90, y - 90);
    expect(await pitch()).toBeGreaterThan(initial + 0.2);
    await expect(canvas).toHaveAttribute('data-bursts', '0');
    await context.close();
  });
}
