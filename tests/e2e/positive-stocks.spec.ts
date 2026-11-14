import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { selectFilmStock } from './stockPicker';
import { FilmType } from '../../types';

const fixture = path.resolve(process.cwd(), 'public/film-overlays/film-base.png');

for (const stock of [FilmType.FUJI_PROVIA_100F, FilmType.FUJI_VELVIA_100, FilmType.KODAK_EKTACHROME_E100, FilmType.KODAK_KODACHROME_64]) {
  test(`${stock} uses positive direct film scan with a compatibility edge and no external processing`, async ({ page }) => {
    const external: string[] = [];
    const resources: string[] = [];
    page.on('request', request => {
      if (!request.url().startsWith(`${test.info().project.use.baseURL}/`) && !request.url().startsWith('blob:')) external.push(request.url());
      if (request.url().includes('-setup')) resources.push(request.url());
    });
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const inspector = page.getByRole('complementary', { name: '暗房配方' });
    await selectFilmStock(inspector, stock);
    await expect(inspector.getByLabel('成像方式')).toHaveValue('spectral');
    await expect(inspector.getByLabel('底片渲染')).toHaveValue('legacy-template');
    await inspector.getByLabel('光谱计算').selectOption('cpu');
    await inspector.getByLabel('颗粒强度').fill('0');
    await inspector.getByRole('button', { name: 'PNG', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles(fixture);
    await expect(inspector.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true })).toBeEnabled();
    await inspector.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true }).click();
    await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 90_000 });
    const pixels = await page.getByRole('img', { name: path.basename(fixture) }).evaluate(element => {
      const image = element as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d')!.drawImage(image, 0, 0);
      return Array.from(canvas.getContext('2d')!.getImageData(150, 400, 100, 100).data);
    });
    expect(pixels.some(value => value !== 0)).toBe(true);
    expect(resources.some(url => url.includes(`${stock === FilmType.FUJI_PROVIA_100F ? 'fujifilm_provia_100f' : stock === FilmType.FUJI_VELVIA_100 ? 'fujifilm_velvia_100' : stock === FilmType.KODAK_EKTACHROME_E100 ? 'kodak_ektachrome_100' : 'kodak_kodachrome_64'}-setup`))).toBe(true);
    expect(external).toEqual([]);
  });
}

test('positive CPU forced-main output matches Worker output', async ({ page }) => {
  const pixels = async (target: Page) => {
    await target.goto('/');
    await target.evaluate(() => localStorage.clear());
    await target.reload();
    const inspector = target.getByRole('complementary', { name: '暗房配方' });
    await selectFilmStock(inspector, FilmType.FUJI_VELVIA_100);
    await inspector.getByLabel('光谱计算').selectOption('cpu');
    await inspector.getByLabel('颗粒强度').fill('0');
    await inspector.getByRole('button', { name: 'PNG', exact: true }).click();
    await target.locator('input[type=file]').setInputFiles(fixture);
    await expect(inspector.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true })).toBeEnabled();
    await inspector.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true }).click();
    await expect(target.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 90_000 });
    return target.getByRole('img', { name: path.basename(fixture) }).evaluate(element => {
      const image = element as HTMLImageElement;
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d')!.drawImage(image, 0, 0);
      return Array.from(canvas.getContext('2d')!.getImageData(150, 400, 100, 100).data);
    });
  };
  const worker = await pixels(page);
  const main = await page.context().newPage();
  await main.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  expect(await pixels(main)).toEqual(worker);
});
