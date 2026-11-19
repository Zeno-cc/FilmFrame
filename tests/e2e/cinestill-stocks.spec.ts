import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { selectFilmStock } from './stockPicker';
import { getRecipeInspector, openRecipeAdvancedSettings, selectRecipeControl } from './recipeControls';
import { FilmType } from '../../types';

const fixture = path.resolve(process.cwd(), 'tests/fixtures/physical-natural-portrait.png');

async function develop(page: Page, forceMain = false) {
  if (forceMain) await page.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type=file]').setInputFiles(fixture);
  const inspector = getRecipeInspector(page);
  await selectFilmStock(inspector, FilmType.CINESTILL_800T);
  await openRecipeAdvancedSettings(page, '高级渲染设置');
  await expect(inspector.getByLabel('成像方式')).toHaveValue('spectral');
  await expect(inspector.getByLabel('片边方式')).toHaveValue('legacy-template');
  await selectRecipeControl(page, '光谱计算', 'cpu');
  await inspector.getByLabel('颗粒强度').fill('0');
  await inspector.getByRole('button', { name: 'PNG', exact: true }).click();
  await inspector.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true }).click();
  // The source preview has the same accessible name and a Blob URL. Wait for
  // the committed artifact before comparing Worker and main-thread pixels.
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(1, { timeout: 90_000 });
  await expect.poll(async () => page.getByRole('img', { name: path.basename(fixture) }).evaluate(async element => {
    const image = element as HTMLImageElement;
    if (!image.currentSrc.startsWith('blob:')) return 0;
    const bitmap = await createImageBitmap(await (await fetch(image.currentSrc)).blob());
    const { width, height } = bitmap;
    bitmap.close();
    return width * height;
  }), { timeout: 90_000 }).toBeGreaterThan(0);
  return page.getByRole('img', { name: path.basename(fixture) }).evaluate(async element => {
    const image = element as HTMLImageElement;
    const blob = await (await fetch(image.currentSrc)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    bitmap.close();
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return { width: canvas.width, height: canvas.height, hash };
  });
}

test('CineStill production Worker and forced-main outputs are identical', async ({ page }) => {
  test.setTimeout(180_000);
  const worker = await develop(page);
  const main = await page.context().newPage();
  expect(await develop(main, true)).toEqual(worker);
});



test('CineStill GPU allocation failures release owned textures', async ({ page }, testInfo) => {
  test.skip(testInfo.project.use.baseURL !== 'http://127.0.0.1:4174', 'Development server provides source modules for isolated GPU diagnostics.');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { WebGlSpectralRenderer } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/webgl/renderer.ts`) as typeof import('../../services/spectral/webgl/renderer');
    const { createCineStillPipeline } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/cineStill.ts`) as typeof import('../../services/spectral/cineStill');
    const vision500t = await (await fetch('/services/spectral/resources/kodak_vision3_500t-setup.json')).json();
    const pipeline = createCineStillPipeline({ ...vision500t, configuration: { ...vision500t.configuration, spatialScale: 16 } });
    const image = { width: 128, height: 128, pixels: new Float32Array(128 * 128 * 3).fill(0.184) };
    const renderer = new WebGlSpectralRenderer(document.createElement('canvas'), pipeline, { maxTextureBytes: 2_000_000 });
    const setupBytes = renderer.info.setupTextureBytes;
    let message = '';
    try { renderer.render(image); } catch (error) { message = error instanceof Error ? error.message : String(error); }
    const after = renderer.info.textureBytes;
    const active = renderer.measurements.activeFrames;
    renderer.dispose();
    return { setupBytes, message, after, active, disposed: renderer.info.textureBytes };
  });
  expect(result.message).toContain('texture exceeds the GPU texture byte budget');
  expect(result.after).toBe(result.setupBytes);
  expect(result.active).toBe(0);
  expect(result.disposed).toBe(0);
});test('CineStill WebGL2 headroom and signed halo match CPU and release all frame textures', async ({ page }, testInfo) => {
  test.skip(testInfo.project.use.baseURL !== 'http://127.0.0.1:4174', 'Development server provides source modules for isolated GPU diagnostics.');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { WebGlSpectralRenderer } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/webgl/renderer.ts`) as typeof import('../../services/spectral/webgl/renderer');
    const { createCineStillPipeline, renderCineStillStages } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/cineStill.ts`) as typeof import('../../services/spectral/cineStill');
    const { multiply3 } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/math.ts`) as typeof import('../../services/spectral/math');
    const vision500t = await (await fetch('/services/spectral/resources/kodak_vision3_500t-setup.json')).json();
    const pipeline = createCineStillPipeline({ ...vision500t, configuration: { ...vision500t.configuration, spatialScale: 16 } });
    const pixels = new Float32Array(128 * 128 * 3);
    pixels.set(multiply3(pipeline.setup.arrays.srgbToProPhoto, [1, 1, 1]), (64 * 128 + 64) * 3);
    const image = { width: 128, height: 128, pixels };
    const expected = renderCineStillStages(image, pipeline);
    const singlePixel = { width: 1, height: 1, pixels: pixels.slice(0, 3) };
    const singleExpected = renderCineStillStages(singlePixel, pipeline).printRgb;
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const renderer = new WebGlSpectralRenderer(canvas, pipeline);
    const { frame } = renderer.render(image);
    let maxFilmRaw = 0;
    let maxPrint = 0;
    let maxSinglePixel = 0;
    try {
      const actual = renderer.readStage(frame, 'filmRaw').rgb;
      const print = renderer.readStage(frame, 'printRgb').rgb;
      for (let index = 0; index < expected.filmRaw.length; index += 1) {
        maxFilmRaw = Math.max(maxFilmRaw, Math.abs(actual[index] - expected.filmRaw[index]));
        maxPrint = Math.max(maxPrint, Math.abs(print[index] - expected.printRgb[index]));
      }
      const singleFrame = renderer.render(singlePixel).frame;
      try {
        const actualSingle = renderer.readStage(singleFrame, 'printRgb').rgb;
        for (let index = 0; index < singleExpected.length; index += 1) {
          maxSinglePixel = Math.max(maxSinglePixel, Math.abs(actualSingle[index] - singleExpected[index]));
        }
      } finally {
        renderer.releaseFrame(singleFrame);
      }
    } finally {
      renderer.releaseFrame(frame);
    }
    const released = renderer.info.textureBytes;
    const active = renderer.measurements.activeFrames;
    const setupBytes = renderer.info.setupTextureBytes;
    renderer.dispose();
    return { maxFilmRaw, maxPrint, maxSinglePixel, setupBytes, released, active, disposedBytes: renderer.info.textureBytes };
  });
  expect(result.maxFilmRaw).toBeLessThan(1e-5);
  expect(result.maxPrint).toBeLessThan(1e-4);
  expect(result.maxSinglePixel).toBeLessThan(1e-4);
  expect(result.released).toBe(result.setupBytes);
  expect(result.active).toBe(0);
  expect(result.disposedBytes).toBe(0);
});
