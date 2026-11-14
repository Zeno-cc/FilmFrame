import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { selectFilmStock } from './stockPicker';

const fixture = path.resolve(process.cwd(), 'public/film-overlays/film-base.png');
const fixtureName = path.basename(fixture);

async function selectGoldSpectral(page: Page, backend = 'cpu') {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await selectFilmStock(inspector,'KODAK GOLD 200');
  await inspector.getByLabel('成像方式').selectOption('spectral');
  await inspector.getByLabel('底片渲染').selectOption('legacy-template');
  await inspector.getByLabel('光谱计算').selectOption(backend);
  await inspector.getByLabel('颗粒强度').fill('0');
  await inspector.getByRole('button', { name: 'PNG', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(fixture);
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
  await inspector.getByLabel('成像方式').selectOption('legacy');
  await develop(page);
  expect(await readAperturePixels(page)).not.toEqual(spectralPixels);
});

test('Gold layered rendering does not require the disabled aperture shadow', async ({ page }, testInfo) => {
  await page.route('**/film-overlays/aperture-shadow-derived.png', route => route.fulfill({ status: 404 }));
  await selectGoldSpectral(page);
  await develop(page);
  const workerHash = await page.getByRole('img', { name: fixtureName }).evaluate(async element => {
    const pixels = await (await fetch((element as HTMLImageElement).currentSrc)).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  });
  const main = await page.context().newPage();
  await main.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  await main.route('**/film-overlays/aperture-shadow-derived.png', route => route.fulfill({ status: 404 }));
  await selectGoldSpectral(main);
  await develop(main);
  const mainHash = await main.getByRole('img', { name: fixtureName }).evaluate(async element => {
    const pixels = await (await fetch((element as HTMLImageElement).currentSrc)).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  });
  expect(mainHash).toBe(workerHash);
  testInfo.attach('gold-without-shadow.json', { body: JSON.stringify({ workerHash, mainHash }), contentType: 'application/json' });
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

  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await inspector.getByLabel('成像方式').selectOption('legacy');
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
  await page.route('**/assets/filmWorker-*.js', async route => {
    const response = await route.fetch();
    const source = `
      const getContext = OffscreenCanvas.prototype.getContext;
      OffscreenCanvas.prototype.getContext = function(type, ...args) {
        return type === 'webgl2' ? null : getContext.call(this, type, ...args);
      };
      ${await response.text()}
    `;
    await route.fulfill({ response, body: source });
  });
  await selectGoldSpectral(page, 'webgl2');
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '需要处理' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('处理失败，请重试').first()).toBeVisible();
});

test('spectral strips report their explicit single-frame boundary', async ({ page }) => {
  const inspector = await selectGoldSpectral(page);
  await inspector.getByLabel('底片渲染').selectOption('legacy-template');
  await develop(page);
  await page.getByRole('tab', { name: /连底长条/ }).click();
  await page.getByLabel('长条审片台').getByRole('button', { name: '生成胶片长条' }).click();
  await expect(page.getByText('光谱负片目前仅支持真实 135 单张出片；胶片长条请使用经典色彩。')).toBeVisible();
  await expect(page.getByRole('img', { name: '已生成的胶片长条' })).toHaveCount(0);
});
