import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { selectFilmStock } from './stockPicker';
import { getRecipeInspector, selectRecipeControl } from './recipeControls';
import { blockDifference, readImageSignature } from './routeComparison';

const fixture = path.resolve(process.cwd(), 'public/film-overlays/film-base.png');
const fixtureName = path.basename(fixture);

async function selectGoldSpectral(page: Page, backend = 'cpu') {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  const inspector = getRecipeInspector(page);
  await selectFilmStock(inspector,'KODAK GOLD 200');
  await selectRecipeControl(page, '成像方式', 'spectral');
  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await selectRecipeControl(page, '光谱计算', backend);
  await inspector.getByLabel('颗粒强度').fill('0');
  await inspector.getByRole('button', { name: 'PNG', exact: true }).click();
  return inspector;
}

async function develop(page: Page) {
  await page.getByRole('button', { name: /冲洗待更新照片|重新冲洗全部/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 60_000 });
}

async function readAperturePixels(page: Page) {
  return page.getByRole('img', { name: fixtureName }).evaluate(element => {
    if (!(element instanceof HTMLImageElement)) throw new Error('Expected developed image');
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing test canvas');
    context.drawImage(element, 0, 0);
    return Array.from(context.getImageData(150, 400, 100, 100).data);
  });
}

test('Gold layered frame executes spectral resources and changes the aperture', async ({ page }) => {
  const resources: string[] = [];
  page.on('request', request => {
    if (request.url().includes('-setup')) resources.push(request.url());
  });
  const inspector = await selectGoldSpectral(page);
  await develop(page);
  const spectralPixels = await readAperturePixels(page);
  expect(resources.some(url => url.includes('kodak_gold_200-setup'))).toBe(true);
  await selectRecipeControl(page, '成像方式', 'legacy');
  await develop(page);
  expect(await readAperturePixels(page)).not.toEqual(spectralPixels);
});

test('Gold layered rendering does not require the disabled aperture shadow', async ({ page }, testInfo) => {
  await page.route('**/film-overlays/aperture-shadow-derived.png', route => route.fulfill({ status: 404 }));
  await selectGoldSpectral(page);
  await develop(page);
  const workerOutput = await readImageSignature(page, fixtureName);
  const main = await page.context().newPage();
  await main.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  await main.route('**/film-overlays/aperture-shadow-derived.png', route => route.fulfill({ status: 404 }));
  await selectGoldSpectral(main);
  await develop(main);
  const mainOutput = await readImageSignature(main, fixtureName);
  // Compare decoded pixels, not the encoded file: a Worker exports through
  // OffscreenCanvas.convertToBlob while the main thread uses canvas.toBlob, and
  // both encoders may pick different PNG filters for identical frames.
  const difference = blockDifference(workerOutput, mainOutput);
  testInfo.attach('gold-without-shadow.json', {
    body: JSON.stringify({ workerOutput, mainOutput, difference }, null, 2),
    contentType: 'application/json',
  });
  testInfo.attach('gold-worker-main-difference.txt', {
    body: `size ${workerOutput.width}x${workerOutput.height} vs ${mainOutput.width}x${mainOutput.height}; mean block delta ${difference.meanAbs.toFixed(3)}; max block delta ${difference.maxAbs}`,
    contentType: 'text/plain',
  });
  expect(mainOutput.width).toBe(workerOutput.width);
  expect(mainOutput.height).toBe(workerOutput.height);
  // The Worker resamples through OffscreenCanvas and the main thread through
  // HTMLCanvasElement; both are allowed to differ slightly instead of
  // bit-identically. Measured 2026-11-19: 1.86/255 maximum 8x8 block delta, so
  // the bound stays close enough to catch a structural regression such as a
  // shadow that only one route still draws.
  expect(difference.maxAbs).toBeLessThan(4);
});

test('Gold layered asset failure preserves spectral failure and legacy fallback semantics', async ({ page }) => {
  await page.route('**/film-overlays/film-base.png', route => route.fulfill({ status: 404 }));
  await selectGoldSpectral(page);
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('dialog', { name: '需要处理' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('处理失败，请重试').first()).toBeVisible();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(0);
  await page.getByRole('dialog', { name: '需要处理' }).getByRole('button', { name: '关闭' }).click();

  const main = await page.context().newPage();
  await main.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  await main.route('**/film-overlays/film-base.png', route => route.fulfill({ status: 404 }));
  await selectGoldSpectral(main);
  await main.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(main.getByRole('dialog', { name: '需要处理' })).toBeVisible({ timeout: 30_000 });
  await expect(main.getByRole('img', { name: '已出片' })).toHaveCount(0);

  const inspector = getRecipeInspector(page);
  await selectRecipeControl(page, '成像方式', 'legacy');
  await develop(page);
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible();
});

test('Gold forced GPU failure cannot silently produce legacy output', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type, ...args) {
      if (type === 'webgl2') return null;
      return Reflect.apply(getContext, this, [type, ...args]);
    } as typeof getContext;
    const getOffscreenContext = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function(this: OffscreenCanvas, type, ...args) {
      if (type === 'webgl2') return null;
      return Reflect.apply(getOffscreenContext, this, [type, ...args]);
    } as typeof getOffscreenContext;
  });
  await page.route(/\/(?:services\/filmWorker\.ts|assets\/filmWorker-[^/]+\.js)(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    const source = `
      const getContext = OffscreenCanvas.prototype.getContext;
      OffscreenCanvas.prototype.getContext = function(type, ...args) {
        return type === 'webgl2' ? null : getContext.call(this, type, ...args);
      };
    ` + await response.text();
    await route.fulfill({ response, body: source });
  });
  await selectGoldSpectral(page, 'webgl2');
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '需要处理' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('处理失败，请重试').first()).toBeVisible();
});

test('Gold spectral template strips render without a single-frame boundary error', async ({ page }) => {
  await selectGoldSpectral(page);
  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await page.getByRole('tab', { name: /胶片长条/ }).click();
  await page.getByLabel('长条预览').getByRole('button', { name: '生成胶片长条' }).click();
  await expect(page.getByRole('img', { name: '已生成的胶片长条' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('dialog', { name: '需要处理' })).toHaveCount(0);
});
