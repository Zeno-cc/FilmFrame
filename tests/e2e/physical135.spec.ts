import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { selectFilmStock } from './stockPicker';
import { getRecipeInspector, openRecipeAdvancedSettings, selectRecipeControl } from './recipeControls';
import { isDocumentedPublicGalleryRequest } from './publicRequests';
import { getScannerCanvasSize } from '../../services/filmResolution';
import { FilmType, type FilmSettings } from '../../types';
import type { PhysicalFilmPlan } from '../../services/physical135/plan';
import { createPhysicalStripPlan } from '../../services/physical135/strip';
import type { PhysicalContext } from '../../services/physical135/canvas';
import { loadPreferences } from '../../services/settingsStorage';

test.use({ launchOptions: { ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--enable-unsafe-swiftshader'] } });

const fixture = path.resolve(process.cwd(), 'public/film-overlays/film-base.png');
const naturalFixture = path.resolve(process.cwd(), 'tests/fixtures/physical-portrait-gradient.png');
const portraitFixture = path.resolve(process.cwd(), 'tests/fixtures/physical-natural-portrait.png');

/**
 * An explicit WebGL2 request is rejected on a software renderer, which is what
 * headless CI and the bundled Chromium both report. These cases are about
 * physical geometry, panels and lifecycle rather than the GPU backend, so they
 * fall back to the CPU backend instead of failing for an environment reason.
 * The GPU path itself is covered by the spectral suites and the release gate.
 */
async function explicitWebgl2SpectralUsable(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
    return !/swiftshader|llvmpipe|software/i.test(renderer);
  });
}

async function resolveBackend(page: Page, backend: 'cpu' | 'webgl2'): Promise<'cpu' | 'webgl2'> {
  if (backend !== 'webgl2') return backend;
  return (await explicitWebgl2SpectralUsable(page)) ? 'webgl2' : 'cpu';
}

async function preparePhysical(page: Page, backend: 'cpu' | 'webgl2' = 'cpu', input = fixture) {
  await page.route('**/api/runtime-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ maxCanvasMiB: 700, maxCanvasBytes: 700 * 1024 * 1024, updatedAt: 0 }),
  }));
  await page.route('**/auth/refresh', route => route.fulfill({ status: 204 }));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const resolvedBackend = await resolveBackend(page, backend);
  await page.locator('input[type=file]').setInputFiles(input);
  const inspector = getRecipeInspector(page);
  await selectFilmStock(inspector, 'KODAK GOLD 200');
  await selectRecipeControl(page, '成像方式', 'spectral');
  await selectRecipeControl(page, '光谱计算', resolvedBackend);
  await selectRecipeControl(page, '片边方式', 'physical135');
  await inspector.getByLabel('颗粒强度').fill('0');
  await inspector.getByRole('button', { name: 'PNG', exact: true }).click();
  return inspector;
}

async function develop(page: Page) {
  const developed = page.getByRole('img', { name: '已出片' });
  const button = getRecipeInspector(page).getByRole('button', { name: /冲洗待更新照片|重新冲洗全部/ });
  await expect(button).toBeEnabled();
  const startedAt = Date.now();
  await button.click();
  // Physical spectral frames are slow without a hardware GL backend, and every
  // straightened frame takes the per-pixel scan transform, so the wait is
  // generous. The owning test's own timeout still caps the whole case.
  await expect(developed).toBeVisible({ timeout: 300000 });
  console.info(`[physical135] develop ${Date.now() - startedAt}ms`);
}

test('physical spectral mode renders a full 135 single frame through Worker', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const applicationOrigin = new URL(testInfo.project.use.baseURL as string).origin;
  const external: string[] = [];
  page.on('request', request => {
    if (isDocumentedPublicGalleryRequest(request)) return;
    if (new URL(request.url()).origin !== applicationOrigin && !request.url().startsWith('blob:')) external.push(request.url());
  });
  await preparePhysical(page);
  await develop(page);
  await expect(page.getByRole('img', { name: path.basename(fixture) })).toBeVisible();
  expect(external).toEqual([]);
});

test('physical panel keeps its film controls and no longer exposes seed buttons', async ({ page }) => {
  test.setTimeout(420_000);
  const inspector = await preparePhysical(page, 'webgl2');
  // The seed buttons were removed as implementation-level controls. The rest
  // of the panel must still work, and the saved preference must still carry the
  // seed values so stored recipes keep rendering identically.
  await expect(inspector.getByRole('button', { name: /换一台/ })).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: /换一格/ })).toHaveCount(0);
  // The physical edge controls live in 高级渲染设置, which starts collapsed.
  await openRecipeAdvancedSettings(page, '高级渲染设置');
  await expect(inspector.getByLabel('齿孔背光')).toBeVisible();
  await expect(inspector.getByLabel('镜头光圈')).toBeVisible();
  await expect(inspector.getByLabel('拉直')).toBeVisible();

  await inspector.getByLabel('齿孔背光').selectOption('black');
  await inspector.getByLabel('拉直').fill('1.5');
  await inspector.getByLabel('边缘灰雾').fill('0');
  await inspector.getByLabel('片轴漏光').fill('0');
  await develop(page);
  await expect(inspector).toContainText('1 张已出片');
  await expect(page.getByText('冲洗中', { exact: true })).toHaveCount(0);
  const preferences = await page.evaluate(() => localStorage.getItem('filmFrame.preferences.v1'));
  expect(preferences).toContain('physical135');
  expect(preferences).toContain('physicalStraighten');
});

test('physical frame seed stays a stored setting without a picker', async ({ page }) => {
  const inspector = await preparePhysical(page, 'webgl2', portraitFixture);
  await develop(page);
  await page.locator('input[type=file]').setInputFiles(naturalFixture);
  await expect(page.getByRole('img', { name: path.basename(naturalFixture) })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`查看 ${path.basename(naturalFixture)}`) }).click();
  await page.getByRole('button', { name: '关闭预览' }).click();
  // Switching the selected photo must not resurrect a per-photo seed control.
  await expect(inspector.getByRole('button', { name: /换一格/ })).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: /换一台/ })).toHaveCount(0);
  const preferences = await page.evaluate(() => localStorage.getItem('filmFrame.preferences.v1'));
  const saved = JSON.parse(preferences ?? '{}');
  expect(saved.settings?.physicalFrameSeed).toBe(1);
  expect(saved.settings?.physicalBodySeed).toBe(1);
});

test('physical portrait frame restores its original orientation', async ({ page }) => {
  const originalSource = `data:image/png;base64,${(await readFile(portraitFixture)).toString('base64')}`;
  await preparePhysical(page, 'webgl2', portraitFixture);
  await develop(page);
  const result = await page.getByRole('img', { name: path.basename(portraitFixture) }).evaluate(async (element, source) => {
    if (!(element instanceof HTMLImageElement)) throw new Error('Expected physical portrait image');
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing portrait inspection canvas');
    context.drawImage(element, 0, 0);
    const planModule = await import(/* @vite-ignore */ `${location.origin}/services/physical135/plan.ts`) as typeof import('../../services/physical135/plan');
    const frameModule = await import(/* @vite-ignore */ `${location.origin}/services/physical135/frame.ts`) as typeof import('../../services/physical135/frame');
    const plan = frameModule.physicalPlanForSettings({ brandText: 'KODAK GOLD 200' as FilmType, frameNumber: 1, frameRenderMode: 'real135', imagingMode: 'spectral', edgeRenderMode: 'physical135', physicalBodySeed: 1, physicalFrameSeed: 1, physicalFog: 1, physicalLeaks: 0, physicalStraighten: 0, physicalAperture: 5.6 }, 'portrait', 36, (canvas.height / 38) * 36 / 36.25);
    const topLeft = planModule.filmToCanvas(plan, plan.gate.s, plan.gate.t);
    const bottomRight = planModule.filmToCanvas(plan, plan.gate.s + plan.gate.width, plan.gate.t + plan.gate.height);
    const gateX = Math.round(Math.min(topLeft.s, bottomRight.s) * plan.pxPerMm);
    const gateY = Math.round(Math.min(topLeft.t, bottomRight.t) * plan.pxPerMm);
    const gateW = Math.round(Math.abs(bottomRight.s - topLeft.s) * plan.pxPerMm);
    const gateH = Math.round(Math.abs(bottomRight.t - topLeft.t) * plan.pxPerMm);
    const sourceImage = new Image(); sourceImage.src = source; await sourceImage.decode();
    const compare = (quarterTurns: number) => {
      const odd = quarterTurns % 2 === 1;
      const rotated = document.createElement('canvas'); rotated.width = odd ? sourceImage.height : sourceImage.width; rotated.height = odd ? sourceImage.width : sourceImage.height;
      const sourceContext = rotated.getContext('2d')!;
      sourceContext.translate(rotated.width / 2, rotated.height / 2); sourceContext.rotate(quarterTurns * Math.PI / 2); sourceContext.drawImage(sourceImage, -sourceImage.width / 2, -sourceImage.height / 2);
      const scale = Math.max(gateW / rotated.width, gateH / rotated.height);
      const sample = document.createElement('canvas'); sample.width = 120; sample.height = 180;
      const sampleContext = sample.getContext('2d')!;
      sampleContext.drawImage(canvas, gateX, gateY, gateW, gateH, 0, 0, sample.width, sample.height);
      const reference = document.createElement('canvas'); reference.width = sample.width; reference.height = sample.height;
      reference.getContext('2d')!.drawImage(rotated, (rotated.width - gateW / scale) / 2, (rotated.height - gateH / scale) / 2, gateW / scale, gateH / scale, 0, 0, sample.width, sample.height);
      const actualPixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
      const referencePixels = reference.getContext('2d')!.getImageData(0, 0, sample.width, sample.height).data;
      let difference = 0;
      for (let index = 0; index < actualPixels.length; index += 4) difference += Math.abs(actualPixels[index] - referencePixels[index]) + Math.abs(actualPixels[index + 1] - referencePixels[index + 1]) + Math.abs(actualPixels[index + 2] - referencePixels[index + 2]);
      return difference / (sample.width * sample.height * 3);
    };
    return { width: canvas.width, height: canvas.height, unrotatedDifference: compare(0), rotatedDifference: compare(1) };
  }, originalSource);
  expect(result.height).toBeGreaterThan(result.width);
  expect(result.unrotatedDifference).toBeLessThan(result.rotatedDifference * 0.5);
});

test('physical spectral strip renders through the shared frame plan', async ({ page }) => {
  test.setTimeout(420_000);
  await preparePhysical(page, 'webgl2');
  await develop(page);
  await page.getByRole('tab', { name: /胶片长条/ }).click();
  await page.getByLabel('长条预览').getByRole('button', { name: '生成胶片长条' }).click();
  await expect(page.getByRole('img', { name: '已生成的胶片长条' })).toBeVisible({ timeout: 300000 });
});

for (const straighten of [0, 1.5]) test(`physical five-frame strips preserve their aperture and perforation grid at ${straighten} degrees`, async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto('/');
  test.skip(
    !(await explicitWebgl2SpectralUsable(page)),
    '五帧物理光谱长条在 CPU 后端上会超过 Worker 的 120s 请求预算（services/filmWorkerClient.ts），需要硬件 GPU 后端；GPU 路径由真机门禁覆盖。',
  );
  await preparePhysical(page, 'webgl2', naturalFixture);
  await page.getByRole('button', { name: '删除全部照片' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除 1 张照片', exact: true }).click();
  await expect(page.getByRole('heading', { name: '让这一卷，慢慢显影' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles([
    naturalFixture, naturalFixture, naturalFixture, naturalFixture, naturalFixture,
  ]);
  await expect(page.getByRole('button', { name: '冲洗待更新照片 (5)', exact: true })).toBeEnabled();
  await develop(page);
  // develop() resolves on the first finished frame; the toolbar stays disabled
  // until the remaining four finish, so wait for the tab instead of racing it.
  const stripTab = page.getByRole('tab', { name: /胶片长条/ });
  await expect(stripTab).toBeEnabled({ timeout: 360_000 });
  await stripTab.click();
  await page.getByLabel('长条预览').getByRole('button', { name: '生成胶片长条' }).click();
  const strip = page.getByRole('img', { name: '已生成的胶片长条' });
  await expect(strip).toBeVisible({ timeout: 300000 });
  const preferences = await page.evaluate(() => {
    const value = localStorage.getItem('filmFrame.preferences.v1');
    return value ? JSON.parse(value) : {};
  });
  const settings = loadPreferences({
    brandText: FilmType.KODAK_GOLD_200, customText: '', frameNumber: 1, showDate: false, dateStr: '',
    borderColor: '#090807', holeColor: '#f2efe6', textColor: '#eab308', borderSize: 12,
    grainIntensity: 0, holeType: 'square', outputFormat: 'image/png', outputQuality: 0.95,
    processingMode: 'preview', imagingMode: 'spectral', spectralBackend: 'cpu', frameRenderMode: 'real135',
    edgeRenderMode: 'physical135', physicalBacking: 'open', physicalBodySeed: 1, physicalFrameSeed: 1,
    physicalFog: 1, physicalLeaks: 0, physicalStraighten: straighten, physicalAperture: 5.6,
  }, 'single').settings;
  const plan = createPhysicalStripPlan(settings, 5);
  const result = await strip.evaluate(async (element, { plan, settings }) => {
    if (!(element instanceof HTMLImageElement)) throw new Error('Expected generated strip image');
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing strip inspection canvas');
    context.drawImage(element, 0, 0);
    const frameWidth = canvas.width / 5;
    const x = Math.round(frameWidth * 0.52);
    const y = Math.round(canvas.height * 0.19);
    const width = Math.round(frameWidth * 0.3);
    const height = Math.round(canvas.height * 0.61);
    const pixels = context.getImageData(x, y, width, height).data;
    const imprintCanvas = document.createElement('canvas'); imprintCanvas.width = canvas.width; imprintCanvas.height = canvas.height;
    const imprintContext = imprintCanvas.getContext('2d');
    if (!imprintContext) throw new Error('Missing imprint inspection canvas');
    const modulePath = `${location.origin}/services/physical135/canvas.ts`;
    const { paintPhysicalImprints } = await import(/* @vite-ignore */ modulePath) as {
      paintPhysicalImprints(context: PhysicalContext, plan: PhysicalFilmPlan, settings: FilmSettings): void;
    };
    paintPhysicalImprints(imprintContext, plan, settings);
    const imprints = imprintContext.getImageData(0, 0, canvas.width, canvas.height).data;
    let saturatedRows = 0;
    let maxSeamStep = 0;
    let bottomRebateSamples = 0;
    const dxPixels: { left: number[]; right: number[] }[] = [];
    for (let frame = 1; frame < 5; frame += 1) {
      const seamX = Math.round(frame * frameWidth);
      const sampleRows = [0, Math.round(canvas.height * 0.1), Math.round(canvas.height * 0.5)];
      // Sample the unexposed rebate between the gate and the far perforation
      // rail. The outer DX band itself is not required to be pixel-constant.
      for (let sampleY = Math.round(canvas.height * 0.84); sampleY <= Math.round(canvas.height * 0.86); sampleY += 1) {
        const maskIndex = (sampleY * canvas.width + seamX) * 4 + 3;
        if (imprints[maskIndex] === 0 && imprints[maskIndex - 4] === 0) {
          sampleRows.push(sampleY);
          bottomRebateSamples += 1;
        }
      }
      for (const sampleY of sampleRows) {
        const left = context.getImageData(seamX - 1, sampleY, 1, 1).data;
        const right = context.getImageData(seamX, sampleY, 1, 1).data;
        const maskIndex = (sampleY * canvas.width + seamX) * 4 + 3;
        // DX marks can legitimately end at an advance boundary. Do not call
        // their developed edge a discontinuity in the physical film base.
        if (imprints[maskIndex] !== 0 || imprints[maskIndex - 4] !== 0) {
          if (sampleY === canvas.height - 1) dxPixels.push({ left: [...left], right: [...right] });
          continue;
        }
        if (sampleY === canvas.height - 1) bottomRebateSamples += 1;
        for (let channel = 0; channel < 3; channel += 1) {
          maxSeamStep = Math.max(maxSeamStep, Math.abs(left[channel] - right[channel]));
        }
      }
    }
    for (let row = 0; row < height; row += 1) {
      let bright = 0;
      for (let column = 0; column < width; column += 1) {
        const index = (row * width + column) * 4;
        if (Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) > 245) bright += 1;
      }
      if (bright / width > 0.9) saturatedRows += 1;
    }
    return { width: canvas.width, height: canvas.height, saturatedRows, maxSeamStep, bottomRebateSamples, dxPixels };
  }, { plan, settings });
  expect(result.width).toBe(4750);
  expect(result.height).toBe(875);
  expect(result.saturatedRows).toBe(0);
  expect(result.bottomRebateSamples).toBeGreaterThan(0);
  expect(result.maxSeamStep).toBeLessThanOrEqual(1);
});

test('physical single-frame budget rejects before main or Worker canvas allocation', async ({ page }) => {
  const workerAllocations: string[] = [];
  page.on('console', message => {
    if (message.text() === 'physical-canvas-allocation') workerAllocations.push(message.text());
  });
  await page.route('**/services/filmWorker.ts*', async route => {
    const response = await route.fetch();
    const body = `const OriginalPhysicalCanvas = OffscreenCanvas;\nOffscreenCanvas = class extends OriginalPhysicalCanvas { constructor(...args) { super(...args); console.log('physical-canvas-allocation'); } };\n${await response.text()}`;
    await route.fulfill({ response, body });
  });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { processImage } = await import(/* @vite-ignore */ `${location.origin}/services/filmEngine.ts`) as typeof import('../../services/filmEngine');
    const { processImage: processWorkerImage } = await import(/* @vite-ignore */ `${location.origin}/services/filmWorkerClient.ts`) as typeof import('../../services/filmWorkerClient');
    const { loadPreferences } = await import(/* @vite-ignore */ `${location.origin}/services/settingsStorage.ts`) as typeof import('../../services/settingsStorage');
    const settings = { ...loadPreferences({ brandText: 'KODAK GOLD 200' as FilmType, customText: '', frameNumber: 1, showDate: false, dateStr: '', borderColor: '#090807', holeColor: '#eeeeee', textColor: '#eab308', borderSize: 12, grainIntensity: 0, holeType: 'square', outputFormat: 'image/png', outputQuality: 0.95, processingMode: 'preview', frameRenderMode: 'real135', scanOutputAspect: 'native', maxRollFrames: 36, useFilmOverlayTemplate: true }, 'single').settings, imagingMode: 'spectral' as const, spectralBackend: 'webgl2' as const, edgeRenderMode: 'physical135' as const };
    const response = await fetch('/film-overlays/film-base.png');
    const file = new File([await response.blob()], 'budget.png', { type: 'image/png' });
    const source = URL.createObjectURL(file);
    const allocations: string[] = [];
    const originalCreate = document.createElement.bind(document);
    document.createElement = ((name: string, options?: ElementCreationOptions) => {
      if (name === 'canvas') allocations.push('main-canvas');
      return originalCreate(name, options);
    }) as typeof document.createElement;
    const OriginalWorker = window.Worker;
    let mainError = '';
    let workerError = '';
    try {
      try { await processImage(source, settings, undefined, undefined, { maxPixels: 1 }); } catch (error) { mainError = String(error); }
      try { await processWorkerImage(file, settings, undefined, source, undefined, { maxPixels: 1 }); } catch (error) { workerError = String(error); }
    } finally {
      document.createElement = originalCreate;
      Object.defineProperty(window, 'Worker', { configurable: true, value: OriginalWorker });
      URL.revokeObjectURL(source);
    }
    return { allocations, mainError, workerError };
  });
  expect(result.allocations).toEqual([]);
  expect(workerAllocations).toEqual([]);
  expect(result.mainError).toContain('max-pixels-exceeded');
  expect(result.workerError).toContain('max-pixels-exceeded');
});

test('straightened strip imprints share the local frame scan coordinates', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createPhysicalStripPlan, physicalStripFramePlan, physicalStripFrameImprints } = await import(/* @vite-ignore */ `${location.origin}/services/physical135/strip.ts`) as typeof import('../../services/physical135/strip');
    const { createPhysicalImprints, paintPhysicalImprints } = await import(/* @vite-ignore */ `${location.origin}/services/physical135/canvas.ts`) as typeof import('../../services/physical135/canvas');
    const { filmToCanvas } = await import(/* @vite-ignore */ `${location.origin}/services/physical135/plan.ts`) as typeof import('../../services/physical135/plan');
    const { loadPreferences } = await import(/* @vite-ignore */ `${location.origin}/services/settingsStorage.ts`) as typeof import('../../services/settingsStorage');
    const settings = { ...loadPreferences({ brandText: 'KODAK GOLD 200' as FilmType, customText: '', frameNumber: 1, showDate: false, dateStr: '', borderColor: '#090807', holeColor: '#eeeeee', textColor: '#eab308', borderSize: 12, grainIntensity: 0, holeType: 'square', outputFormat: 'image/png', outputQuality: 1, processingMode: 'preview', frameRenderMode: 'real135', scanOutputAspect: 'native', maxRollFrames: 36, useFilmOverlayTemplate: true }, 'single').settings, imagingMode: 'spectral' as const, spectralBackend: 'cpu' as const, edgeRenderMode: 'physical135' as const, physicalStraighten: 1.5, physicalBodySeed: 1, physicalFrameSeed: 1, physicalFog: 1, physicalLeaks: 0 };
    const strip = createPhysicalStripPlan(settings, 2);
    const frame = physicalStripFramePlan(strip, 0, { physicalFrameSeed: 1 }, settings);
    const rectangle = createPhysicalImprints(strip, settings).find(op => op.kind === 'rect' && op.s > 0 && op.s1! < 38 && op.t1! <= 35);
    if (!rectangle) throw new Error('Expected a physical DX rectangle');
    const local = physicalStripFrameImprints(frame, [rectangle])[0];
    const point = filmToCanvas(frame, (local.s + local.s1!) / 2, (local.t + local.t1!) / 2);
    const canvas = document.createElement('canvas'); canvas.width = frame.outputWidth; canvas.height = frame.outputHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing imprint canvas');
    paintPhysicalImprints(context, frame, settings, [local]);
    const mask = context.getImageData(Math.floor(point.s * frame.pxPerMm), Math.floor(point.t * frame.pxPerMm), 1, 1).data[3];
    const { generateFilmStrip, disposeFilmWorkerClient } = await import(/* @vite-ignore */ `${location.origin}/services/filmWorkerClient.ts`) as typeof import('../../services/filmWorkerClient');
    const response = await fetch('/film-overlays/film-base.png');
    const file = new File([await response.blob()], 'imprint.png', { type: 'image/png' });
    const previewUrl = URL.createObjectURL(file);
    let exported = 0;
    try {
      const result = await generateFilmStrip([
        { id: 'first', file, previewUrl, included: true, sourceWidth: 1307, sourceHeight: 1203 },
        { id: 'second', file, previewUrl, included: true, sourceWidth: 1307, sourceHeight: 1203 },
      ], { ...settings, outputFormat: 'image/png', outputQuality: 1 });
      const image = new Image(); image.src = result.url; await image.decode();
      const output = document.createElement('canvas'); output.width = image.naturalWidth; output.height = image.naturalHeight;
      const outputContext = output.getContext('2d'); outputContext!.drawImage(image, 0, 0);
      const pixel = outputContext!.getImageData(Math.floor(point.s * frame.pxPerMm), Math.floor(point.t * frame.pxPerMm), 1, 1).data;
      exported = pixel[0] + pixel[1] + pixel[2];
      URL.revokeObjectURL(result.url);
    } finally {
      disposeFilmWorkerClient();
      URL.revokeObjectURL(previewUrl);
    }
    return { mask, exported };
  });
  expect(result.mask).toBe(255);
  expect(result.exported).toBeGreaterThan(0);
});

test('manual landscape-to-portrait rotation keeps backing out of the aperture', async ({ page }) => {
  test.setTimeout(300_000);
  const name = path.basename(naturalFixture);
  const originalSource = `data:image/png;base64,${(await readFile(naturalFixture)).toString('base64')}`;
  await preparePhysical(page, 'webgl2', naturalFixture);
  await develop(page);
  await page.getByRole('button', { name: new RegExp(`查看 ${name}`) }).click();
  const dialog = page.getByRole('dialog', { name });
  await dialog.getByRole('button', { name: '顺时针旋转 90°' }).click();
  await dialog.getByRole('button', { name: '应用并冲洗此张' }).click();
  await expect(dialog.getByRole('link', { name: '下载当前预览' })).toBeVisible({ timeout: 60000 });
  const image = dialog.getByRole('img', { name });
  const result = await image.evaluate(async (element, { source, fixtureUrl }) => {
    if (!(element instanceof HTMLImageElement)) throw new Error('Expected developed frame image');
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing inspection canvas');
    context.drawImage(element, 0, 0);
    const x = Math.round(canvas.width * 0.48);
    const y = Math.round(canvas.height * 0.12);
    const width = Math.round(canvas.width * 0.04);
    const height = Math.round(canvas.height * 0.76);
    const pixels = context.getImageData(x, y, width, height).data;
    let saturatedRows = 0;
    for (let row = 0; row < height; row += 1) {
      let bright = 0;
      for (let column = 0; column < width; column += 1) {
        const index = (row * width + column) * 4;
        if (Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) > 245) bright += 1;
      }
      if (bright / width > 0.9) saturatedRows += 1;
    }
    const planModule = await import(/* @vite-ignore */ `${location.origin}/services/physical135/plan.ts`) as typeof import('../../services/physical135/plan');
    const frameModule = await import(/* @vite-ignore */ `${location.origin}/services/physical135/frame.ts`) as typeof import('../../services/physical135/frame');
    const plan = frameModule.physicalPlanForSettings({ brandText: 'KODAK GOLD 200' as FilmType, frameNumber: 1, frameRenderMode: 'real135', imagingMode: 'spectral', edgeRenderMode: 'physical135', physicalBodySeed: 1, physicalFrameSeed: 1, physicalFog: 1, physicalLeaks: 0, physicalStraighten: 0, physicalAperture: 5.6 }, 'portrait', 36, (canvas.height / 38) * 36 / 36.25);
    const topLeft = planModule.filmToCanvas(plan, plan.gate.s, plan.gate.t);
    const bottomRight = planModule.filmToCanvas(plan, plan.gate.s + plan.gate.width, plan.gate.t + plan.gate.height);
    const gateX = Math.round(Math.min(topLeft.s, bottomRight.s) * plan.pxPerMm);
    const gateY = Math.round(Math.min(topLeft.t, bottomRight.t) * plan.pxPerMm);
    const gateW = Math.round(Math.abs(bottomRight.s - topLeft.s) * plan.pxPerMm);
    const gateH = Math.round(Math.abs(bottomRight.t - topLeft.t) * plan.pxPerMm);
    const sourceImage = new Image(); sourceImage.src = source; await sourceImage.decode();
    const compare = (quarterTurns: number) => {
      const odd = quarterTurns % 2 === 1;
      const rotated = document.createElement('canvas'); rotated.width = odd ? sourceImage.height : sourceImage.width; rotated.height = odd ? sourceImage.width : sourceImage.height;
      const sourceContext = rotated.getContext('2d')!;
      sourceContext.translate(rotated.width / 2, rotated.height / 2); sourceContext.rotate(quarterTurns * Math.PI / 2); sourceContext.drawImage(sourceImage, -sourceImage.width / 2, -sourceImage.height / 2);
      const scale = Math.max(gateW / rotated.width, gateH / rotated.height);
      const sample = document.createElement('canvas'); sample.width = 120; sample.height = 180;
      const sampleContext = sample.getContext('2d')!;
      sampleContext.drawImage(canvas, gateX, gateY, gateW, gateH, 0, 0, sample.width, sample.height);
      const reference = document.createElement('canvas'); reference.width = sample.width; reference.height = sample.height;
      reference.getContext('2d')!.drawImage(rotated, (rotated.width - gateW / scale) / 2, (rotated.height - gateH / scale) / 2, gateW / scale, gateH / scale, 0, 0, sample.width, sample.height);
      const actualPixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
      const referencePixels = reference.getContext('2d')!.getImageData(0, 0, sample.width, sample.height).data;
      let difference = 0;
      for (let index = 0; index < actualPixels.length; index += 4) difference += Math.abs(actualPixels[index] - referencePixels[index]) + Math.abs(actualPixels[index + 1] - referencePixels[index + 1]) + Math.abs(actualPixels[index + 2] - referencePixels[index + 2]);
      return difference / (sample.width * sample.height * 3);
    };
    return { width: canvas.width, height: canvas.height, saturatedRows, unrotatedDifference: compare(0), rotatedDifference: compare(1), sourceUrl: fixtureUrl, output: canvas.toDataURL() };
  }, { source: originalSource, fixtureUrl: '/tests/fixtures/physical-portrait-gradient.png' });
  expect(result.height).toBeGreaterThan(result.width);
  expect(result.saturatedRows).toBe(0);
  expect(result.rotatedDifference).toBeLessThan(result.unrotatedDifference * 0.5);
});

test('physical main-thread fallback preserves JPEG and scanner background contracts', async ({ page }) => {
  await page.addInitScript(() => {
    class FailingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      postMessage(message: { id: number }) {
        this.onmessage?.({ data: { id: message.id, ok: false, error: 'forced main-thread physical fallback' } } as MessageEvent);
      }
      terminate() {}
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: FailingWorker });
  });
  const inspector = await preparePhysical(page, 'webgl2', naturalFixture);
  await openRecipeAdvancedSettings(page, '高级输出设置');
  await inspector.getByRole('button', { name: 'JPG', exact: true }).click();
  await inspector.getByRole('button', { name: '保留扫描背景', exact: true }).click();
  await develop(page);
  const result = await page.getByRole('img', { name: path.basename(naturalFixture) }).evaluate(async element => {
    if (!(element instanceof HTMLImageElement)) throw new Error('Expected main-thread physical frame');
    if (element.naturalWidth <= 0 || element.naturalHeight <= 0) throw new Error('Missing decoded physical image');
    const response = await fetch(element.src);
    return { width: element.naturalWidth, height: element.naturalHeight, mime: (await response.blob()).type };
  });
  const scanner = getScannerCanvasSize({ width: 1254, height: 1155 });
  expect(result.width).toBe(scanner.width);
  expect(result.height).toBe(scanner.height);
  expect(result.mime).toBe('image/jpeg');
});

test('legacy spectral template strips now render successfully', async ({ page }) => {
  await preparePhysical(page, 'cpu');
  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await page.getByRole('tab', { name: /胶片长条/ }).click();
  await page.getByLabel('长条预览').getByRole('button', { name: '生成胶片长条' }).click();
  await expect(page.getByRole('img', { name: '已生成的胶片长条' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('dialog', { name: '需要处理' })).toHaveCount(0);
});
