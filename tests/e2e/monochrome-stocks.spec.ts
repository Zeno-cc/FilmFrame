import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { selectFilmStock } from './stockPicker';
import { FilmType } from '../../types';

const fixture = path.resolve(process.cwd(), 'public/film-overlays/film-base.png');

test.setTimeout(180_000);

async function develop(page: Page, stock: FilmType, forceMain = false) {
  if (forceMain) await page.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await selectFilmStock(inspector, stock);
  await inspector.getByLabel('底片渲染').selectOption('legacy-template');
  await inspector.getByLabel('光谱计算').selectOption('cpu');
  await inspector.getByLabel('颗粒强度').fill('0');
  const frameNumberColor = inspector.getByLabel('帧号颜色');
  await frameNumberColor.evaluate(input => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, '#16a34a');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(frameNumberColor).toHaveValue('#16a34a');
  await inspector.getByRole('button', { name: 'PNG', exact: true }).click();
  await expect(inspector.getByLabel('成像方式')).toHaveValue('spectral');
  await expect(inspector.getByLabel('底片渲染')).toHaveValue('legacy-template');
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(inspector.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true })).toBeEnabled();
  await inspector.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 90_000 });
  return page.getByRole('img', { name: path.basename(fixture) }).evaluate(async element => {
    const image = element as HTMLImageElement;
    const blob = await (await fetch(image.currentSrc)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return {
      width: canvas.width,
      height: canvas.height,
      dataUrl,
      hasNonzero: pixels.some(value => value !== 0),
    };
  });
}

for (const stock of [FilmType.FUJI_ACROS_II, FilmType.ILFORD_HP5, FilmType.KODAK_TRI_X_400, FilmType.KODAK_TMAX_100]) {
  test(`${stock} renders its exact silver print locally`, async ({ page }) => {
    const external: string[] = [];
    const resources: string[] = [];
    page.on('request', request => {
      if (!request.url().startsWith(`${test.info().project.use.baseURL}/`) && !request.url().startsWith('blob:')) external.push(request.url());
      if (request.url().includes('-setup')) resources.push(request.url());
    });
    const pixels = await develop(page, stock);
    expect(pixels.hasNonzero).toBe(true);
    expect(resources.some(url => url.includes(`${stock === FilmType.FUJI_ACROS_II ? 'fujifilm_neopan_acros_100_ii' : stock === FilmType.ILFORD_HP5 ? 'ilford_hp5_plus_400' : stock === FilmType.KODAK_TRI_X_400 ? 'kodak_tri_x_400' : 'kodak_tmax_100'}-setup`))).toBe(true);
    expect(external).toEqual([]);
  });
}

test('monochrome forced-main output matches Worker output', async ({ page }) => {
  const worker = await develop(page, FilmType.ILFORD_HP5);
  const main = await page.context().newPage();
  const mainArtifact = await develop(main, FilmType.ILFORD_HP5, true);
  expect([mainArtifact.width, mainArtifact.height]).toEqual([worker.width, worker.height]);
  const comparison = await main.evaluate(async ({ workerDataUrl, mainDataUrl }) => {
    const pixels = async (dataUrl: string) => {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      bitmap.close();
      return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const expected = await pixels(workerDataUrl);
    const actual = await pixels(mainDataUrl);
    let differingChannels = 0;
    let maxDelta = 0;
    for (let index = 0; index < expected.length; index += 1) {
      const delta = Math.abs(actual[index] - expected[index]);
      if (delta > 0) differingChannels += 1;
      maxDelta = Math.max(maxDelta, delta);
    }
    return { differingChannels, maxDelta };
  }, { workerDataUrl: worker.dataUrl, mainDataUrl: mainArtifact.dataUrl });
  expect(comparison).toEqual({ differingChannels: 0, maxDelta: 0 });
});
