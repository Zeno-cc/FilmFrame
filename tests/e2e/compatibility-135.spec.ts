import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { selectFilmStock } from './stockPicker';
import { getRecipeInspector, openRecipeAdvancedSettings, selectRecipeControl } from './recipeControls';
import { blockDifference, readImageSignature, type ImageSignature } from './routeComparison';
import { FilmType } from '../../types';

const fixture = path.resolve(process.cwd(), 'public/film-overlays/film-base.png');
const fixtureName = path.basename(fixture);

async function develop(page: Page, forceMain: boolean): Promise<ImageSignature> {
  if (forceMain) await page.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page.getByRole('img', { name: fixtureName })).toBeVisible();
  const inspector = getRecipeInspector(page);
  await selectFilmStock(inspector, FilmType.KODAK_VISION3_500T);
  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await openRecipeAdvancedSettings(page, '高级渲染设置');
  await inspector.getByLabel('齿孔颜色', { exact: true }).fill('#cc3344');
  await expect(inspector.getByLabel('齿孔颜色', { exact: true })).toHaveValue('#cc3344');
  await selectRecipeControl(page, '光谱计算', 'cpu');
  await inspector.getByLabel('颗粒强度').fill('0');
  await inspector.getByRole('button', { name: 'PNG', exact: true }).click();
  await inspector.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 90_000 });
  return readImageSignature(page, fixtureName);
}

test('Vision3 uses a generic compatibility edge without borrowing another stock scan', async ({ page }, testInfo) => {
  // Both routes render the same spectral frame on CPU, so the budget covers two
  // 90s waits instead of the previous single-route 180s.
  test.setTimeout(420_000);
  const origin = new URL(testInfo.project.use.baseURL as string).origin;
  const assetRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === origin && (/film-(?:overlays|sprocket-masks)\//.test(url.pathname) || url.pathname.includes('compatibility-135'))) assetRequests.push(url.pathname);
  });
  const worker = await develop(page, false);
  expect(assetRequests).toEqual([]);
  const main = await page.context().newPage();
  const mainOutput = await develop(main, true);
  const difference = blockDifference(worker, mainOutput);
  testInfo.attach('vision3-route-comparison.json', {
    body: JSON.stringify({
      worker: { width: worker.width, height: worker.height, pixels: worker.pixels, file: worker.file },
      main: { width: mainOutput.width, height: mainOutput.height, pixels: mainOutput.pixels, file: mainOutput.file },
      difference,
    }, null, 2),
    contentType: 'application/json',
  });
  expect(mainOutput.width).toBe(worker.width);
  expect(mainOutput.height).toBe(worker.height);
  // Same resampling tolerance as the Gold route comparison.
  expect(difference.maxAbs).toBeLessThan(4);
});
