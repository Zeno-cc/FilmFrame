import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { selectFilmStock } from './stockPicker';
import { FilmType } from '../../types';

const fixture = path.resolve(process.cwd(), 'public/film-overlays/film-base.png');
const fixtureName = path.basename(fixture);

test.setTimeout(180_000);

async function prepare(page: Page, stock: FilmType, forceMain: boolean) {
  if (forceMain) await page.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await selectFilmStock(inspector, stock);
  await expect(inspector.getByLabel('成像方式')).toHaveValue('spectral');
  await expect(inspector.getByLabel('底片渲染')).toHaveValue('physical135');
  await inspector.getByLabel('光谱计算').selectOption('cpu');
  await inspector.getByLabel('颗粒强度').fill('0');
  await inspector.getByRole('button', { name: 'PNG', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(inspector.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true })).toBeEnabled();
  await inspector.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 90_000 });
  return inspector;
}

async function developedPixels(page: Page) {
  return page.getByRole('img', { name: fixtureName }).evaluate(async element => {
    if (!(element instanceof HTMLImageElement)) throw new Error('Expected developed image');
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    canvas.getContext('2d')!.drawImage(element, 0, 0);
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return { width: canvas.width, height: canvas.height, hash };
  });
}

for (const stock of [FilmType.KODAK_PORTRA_800_PUSH1, FilmType.KODAK_PORTRA_800_PUSH2]) {
  test(`${stock} develops distinct exact resources through Worker and forced-main paths`, async ({ page }) => {
    const external: string[] = [];
    const resources: string[] = [];
    page.on('request', request => {
      if (!request.url().startsWith(`${test.info().project.use.baseURL}/`) && !request.url().startsWith('blob:')) external.push(request.url());
      if (request.url().includes('-setup')) resources.push(request.url());
    });
    const inspector = await prepare(page, stock, false);
    const worker = await developedPixels(page);
    expect(worker.width).toBeGreaterThan(0);
    expect(worker.height).toBeGreaterThan(0);
    expect(resources.some(url => url.includes(`${stock === FilmType.KODAK_PORTRA_800_PUSH1 ? 'kodak_portra_800_push1' : 'kodak_portra_800_push2'}-setup`))).toBe(true);
    await page.reload();
    const persisted = page.getByRole('complementary', { name: '暗房配方' });
    await expect(persisted.getByRole('button', { name: '胶片型号', exact: true })).toContainText(stock);
    await expect(persisted.getByLabel('成像方式')).toHaveValue('spectral');
    await page.locator('input[type=file]').setInputFiles(fixture);
    await expect(page.getByRole('img', { name: fixtureName })).toBeVisible();
    await expect(persisted.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true })).toBeEnabled();
    await persisted.getByLabel('光谱计算').selectOption('cpu');
    await persisted.getByLabel('颗粒强度').fill('0');
    await persisted.getByRole('button', { name: 'PNG', exact: true }).click();
    await persisted.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true }).click();
    await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 90_000 });
    expect(await developedPixels(page)).toEqual(worker);
    expect(external).toEqual([]);
    expect(inspector).toBeDefined();
  });

  test(`${stock} forced-main rendering equals Worker rendering`, async ({ page }) => {
    const worker = await prepare(page, stock, false).then(() => developedPixels(page));
    await page.close();
    const mainPage = await page.context().newPage();
    await prepare(mainPage, stock, true);
    expect(await developedPixels(mainPage)).toEqual(worker);
  });
}

test('push variants are separate stocks and do not reuse ordinary Portra 800 resources', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await selectFilmStock(inspector, FilmType.KODAK_PORTRA_800_PUSH1);
  const push1 = await page.evaluate(async stock => {
    const module = await import(/* @vite-ignore */ `${location.origin}/services/spectral/stockResourceLoader.ts`) as typeof import('../../services/spectral/stockResourceLoader');
    const resource = await module.loadSpectralStockResource(stock);
    return { film: resource.configuration.filmId, paper: resource.configuration.paperId, filter: resource.configuration.enlargerCcmY };
  }, FilmType.KODAK_PORTRA_800_PUSH1);
  expect(push1).toMatchObject({ film: 'kodak_portra_800_push1', paper: 'kodak_portra_endura' });
  await selectFilmStock(inspector, FilmType.KODAK_PORTRA_800_PUSH2);
  const push2 = await page.evaluate(async stock => {
    const module = await import(/* @vite-ignore */ `${location.origin}/services/spectral/stockResourceLoader.ts`) as typeof import('../../services/spectral/stockResourceLoader');
    const [resource, first, ordinary] = await Promise.all([
      module.loadSpectralStockResource(stock),
      module.loadSpectralStockResource('KODAK PORTRA 800 PUSH 1' as never),
      module.loadSpectralStockResource('KODAK PORTRA 800' as never),
    ]);
    return { film: resource.configuration.filmId, curves: resource.arrays.filmDirCurves.payloadSha256, firstCurves: first.arrays.filmDirCurves.payloadSha256, ordinaryCurves: ordinary.arrays.filmDirCurves.payloadSha256 };
  }, FilmType.KODAK_PORTRA_800_PUSH2);
  expect(push2.film).toBe('kodak_portra_800_push2');
  expect(push2.curves).not.toBe(push2.firstCurves);
  expect(push2.curves).not.toBe(push2.ordinaryCurves);
});
