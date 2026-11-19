import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { selectFilmStock } from './stockPicker';
import { getRecipeInspector, openRecipeAdvancedSettings, selectRecipeControl } from './recipeControls';
import { FilmType } from '../../types';

const fixture = path.resolve(process.cwd(), 'public/film-overlays/film-base.png');
const fixtureName = path.basename(fixture);

async function develop(page: Page, forceMain: boolean) {
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
  return page.getByRole('img', { name: fixtureName }).evaluate(async element => {
    const image = element as HTMLImageElement;
    const bitmap = await createImageBitmap(await (await fetch(image.currentSrc)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    bitmap.close();
    return Array.from(pixels);
  });
}

test('Vision3 uses a generic compatibility edge without borrowing another stock scan', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const origin = new URL(testInfo.project.use.baseURL as string).origin;
  const assetRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === origin && (/film-(?:overlays|sprocket-masks)\//.test(url.pathname) || url.pathname.includes('compatibility-135'))) assetRequests.push(url.pathname);
  });
  const worker = await develop(page, false);
  expect(assetRequests).toEqual([]);
  const main = await page.context().newPage();
  expect(await develop(main, true)).toEqual(worker);
});
