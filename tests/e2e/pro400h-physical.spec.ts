import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { FilmType } from '../../types';
import { selectFilmStock } from './stockPicker';
import { getRecipeInspector, openRecipeAdvancedSettings, selectRecipeControl } from './recipeControls';
import { explicitWebgl2SpectralUsable, NO_HARDWARE_WEBGL2_REASON } from './gpuSupport';

const fixture = path.resolve(process.cwd(), 'tests/fixtures/physical-natural-portrait.png');
const fixtureName = path.basename(fixture);

type WorkerEvidence = {
  backend: 'cpu' | 'webgl2';
  requestedIds: number[];
  requestBackends: string[];
  successfulIds: number[];
  failedIds: number[];
  fallbacks: number;
  webgl2Contexts: number;
  floatColorBuffers: number;
  floatReadbacks: number;
  glErrors: string[];
};

const workerEvidence = new Map<Page, WorkerEvidence>();
const instrumentedPages = new WeakSet<Page>();

function evidenceFor(page: Page): WorkerEvidence {
  const evidence = workerEvidence.get(page);
  if (!evidence) throw new Error('Missing Pro 400H Worker evidence');
  return evidence;
}

async function instrumentWorker(page: Page, backend: 'cpu' | 'webgl2'): Promise<void> {
  workerEvidence.set(page, {
    backend,
    requestedIds: [],
    requestBackends: [],
    successfulIds: [],
    failedIds: [],
    fallbacks: 0,
    webgl2Contexts: 0,
    floatColorBuffers: 0,
    floatReadbacks: 0,
    glErrors: [],
  });
  if (instrumentedPages.has(page)) return;
  instrumentedPages.add(page);
  page.on('console', message => {
    const evidence = evidenceFor(page);
    const text = message.text();
    if (text === '__pro400hWebgl2') evidence.webgl2Contexts += 1;
    if (text === '__pro400hFloatColorBuffer') evidence.floatColorBuffers += 1;
    if (text === '__pro400hFloatReadback') evidence.floatReadbacks += 1;
    if (text.startsWith('__pro400hFloatReadbackError:')) evidence.glErrors.push(text);
    if (text.startsWith('__pro400hWorkerRequest:')) {
      const [, id, requestBackend] = text.split(':');
      evidence.requestedIds.push(Number(id));
      evidence.requestBackends.push(requestBackend);
    }
    if (text.startsWith('__pro400hWorkerSuccess:')) evidence.successfulIds.push(Number(text.slice(23)));
    if (text.startsWith('__pro400hWorkerFailure:')) evidence.failedIds.push(Number(text.slice(23)));
    if (message.type() === 'warning' && text.includes('falling back to main thread')) evidence.fallbacks += 1;
  });
  await page.route(/\/(?:services\/filmWorker\.ts|assets\/filmWorker-[^/]+\.js)(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    const source = `const __pro400hOriginalGetContext = OffscreenCanvas.prototype.getContext;\nOffscreenCanvas.prototype.getContext = function(type, ...args) { const context = __pro400hOriginalGetContext.call(this, type, ...args); if (type === 'webgl2' && context instanceof WebGL2RenderingContext) { console.info('__pro400hWebgl2'); if (context.getExtension('EXT_color_buffer_float')) console.info('__pro400hFloatColorBuffer'); if (!context.__pro400hInstrumented) { let floatReadbackPending = false; const readPixels = context.readPixels.bind(context); context.readPixels = (...readArgs) => { readPixels(...readArgs); if (readArgs[4] === context.RGBA && readArgs[5] === context.FLOAT) floatReadbackPending = true; }; const getError = context.getError.bind(context); context.getError = () => { const error = getError(); if (floatReadbackPending) { console.info(error === context.NO_ERROR ? '__pro400hFloatReadback' : '__pro400hFloatReadbackError:' + error); floatReadbackPending = false; } return error; }; context.__pro400hInstrumented = true; } } return context; };\nconst __pro400hOriginalPostMessage = globalThis.postMessage;\nglobalThis.postMessage = function(message, ...args) { console.info((message.ok === true ? '__pro400hWorkerSuccess:' : '__pro400hWorkerFailure:') + message.id); return __pro400hOriginalPostMessage.call(this, message, ...args); };\n${await response.text()}`;
    await route.fulfill({ response, body: source });
  });
}

type PhysicalScenario = {
  stock: FilmType;
  format: 'PNG' | 'JPG';
  aspect: 'native' | '4:3';
};

async function develop(page: Page, backend: 'cpu' | 'webgl2', forceMain = false, scenario: Partial<PhysicalScenario> = {}) {
  if (forceMain) {
    await page.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  } else {
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      if (NativeWorker.name === 'Pro400hWorkerProbe') return;
      window.Worker = class Pro400hWorkerProbe extends NativeWorker {
        constructor(scriptURL: string | URL, options?: WorkerOptions) {
          super(scriptURL, options);
          console.info('__pro400hWorkerConstructed');
        }
        postMessage(message: { type?: string; id?: number; settings?: { spectralBackend?: string } }, options?: StructuredSerializeOptions | Transferable[]) {
          if (message.type === 'processImage' && typeof message.id === 'number') {
            console.info(`__pro400hWorkerRequest:${message.id}:${message.settings?.spectralBackend ?? 'auto'}`);
          }
          if (Array.isArray(options)) super.postMessage(message, options);
          else super.postMessage(message, options);
        }
      };
    });
    await instrumentWorker(page, backend);
  }
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type=file]').setInputFiles(fixture);
  const inspector = getRecipeInspector(page);
  await selectFilmStock(inspector, scenario.stock ?? FilmType.FUJI_PRO_400H);
  await openRecipeAdvancedSettings(page, '高级渲染设置');
  await expect(inspector.getByLabel('成像方式')).toHaveValue('spectral');
  await expect(inspector.getByLabel('片边方式')).toHaveValue('physical135');
  await selectRecipeControl(page, '光谱计算', backend);
  await inspector.getByLabel('颗粒强度').fill('0');
  await inspector.getByRole('button', { name: scenario.format ?? 'PNG', exact: true }).click();
  if (scenario.aspect) {
    await openRecipeAdvancedSettings(page, '高级输出设置');
    await inspector.getByRole('button', { name: scenario.aspect === '4:3' ? '保留扫描背景' : '仅保留底片', exact: true }).click();
  }
  await inspector.getByRole('button', { name: '冲洗待更新照片 (1)', exact: true }).click();
  await expect(inspector.getByRole('button', { name: '全部成片均为最新', exact: true })).toBeVisible({ timeout: 90_000 });
  if (!forceMain) {
    const evidence = evidenceFor(page);
    await expect.poll(() => evidence.successfulIds.length).toBe(1);
    expect(evidence.requestedIds).toHaveLength(1);
    expect(evidence.successfulIds[0]).toBe(evidence.requestedIds[0]);
    expect(evidence.requestBackends).toEqual([backend]);
    expect(evidence.failedIds).toEqual([]);
    expect(evidence.fallbacks).toBe(0);
    expect(evidence.glErrors).toEqual([]);
    if (backend === 'webgl2') {
      expect(evidence.webgl2Contexts).toBeGreaterThan(0);
      expect(evidence.floatColorBuffers).toBeGreaterThan(0);
      expect(evidence.floatReadbacks).toBeGreaterThan(0);
    } else {
      expect(evidence.webgl2Contexts).toBe(0);
    }
  }
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible();
  await expect.poll(() => page.getByRole('img', { name: fixtureName }).evaluate(element => (
    (element as HTMLImageElement).currentSrc.startsWith('blob:')
  ))).toBe(true);
  return page.getByRole('img', { name: fixtureName }).evaluate(async (element, route) => {
    const image = element as HTMLImageElement;
    const bitmap = await createImageBitmap(await (await fetch(image.currentSrc)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    bitmap.close();
    let minimum = 255;
    let maximum = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        minimum = Math.min(minimum, pixels[index + channel]);
        maximum = Math.max(maximum, pixels[index + channel]);
      }
    }
    const frameId = `${route}-frame`;
    const cache = await caches.open('pro400h-test-frames');
    await cache.put(`/${frameId}`, new Response(pixels, {
      headers: { 'content-type': 'application/octet-stream', 'x-width': String(canvas.width), 'x-height': String(canvas.height) },
    }));
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return { frameId, width: canvas.width, height: canvas.height, minimum, maximum, hash };
  }, `${forceMain ? 'main' : 'worker'}-${backend}`);
}

type DevelopedFrame = Awaited<ReturnType<typeof develop>>;

async function developWorkerAndMain(page: Page, backend: 'cpu' | 'webgl2', scenario: Partial<PhysicalScenario> = {}) {
  const worker = await develop(page, backend, false, scenario);
  const evidence = { ...evidenceFor(page) };
  expect(worker.maximum).toBeGreaterThan(worker.minimum);
  const main = await page.context().newPage();
  const mainFrame = await develop(main, backend, true, scenario);
  expect(mainFrame).toMatchObject({
    width: worker.width,
    height: worker.height,
    minimum: worker.minimum,
    maximum: worker.maximum,
    hash: worker.hash,
  });
  return { worker, main: mainFrame, evidence };
}

async function compareRgb(page: Page, cpuId: string, gpuId: string) {
  const comparison = await page.evaluate(async ({ cpuId, gpuId }) => {
    const cache = await caches.open('pro400h-test-frames');
    const readFrame = async (id: string) => {
      const response = await cache.match(`/${id}`);
      if (!response) throw new Error(`Missing developed frame: ${id}`);
      return {
        width: Number(response.headers.get('x-width')),
        height: Number(response.headers.get('x-height')),
        pixels: new Uint8ClampedArray(await response.arrayBuffer()),
      };
    };
    const cpu = await readFrame(cpuId);
    const gpu = await readFrame(gpuId);
    if (cpu.width !== gpu.width || cpu.height !== gpu.height) {
      throw new Error('CPU and GPU frame dimensions differ');
    }
    let maximumDifference = 0;
    let differentChannels = 0;
    for (let index = 0; index < cpu.pixels.length; index += 1) {
      const difference = Math.abs(cpu.pixels[index] - gpu.pixels[index]);
      if (index % 4 === 3) {
        if (difference !== 0) throw new Error('CPU and GPU alpha channels differ');
      } else {
        maximumDifference = Math.max(maximumDifference, difference);
        if (difference > 2) differentChannels += 1;
      }
    }
    await cache.delete(`/${cpuId}`);
    await cache.delete(`/${gpuId}`);
    await caches.delete('pro400h-test-frames');
    return { maximumDifference, differentChannels, rgbChannels: cpu.pixels.length * 3 / 4 };
  }, { cpuId, gpuId });
  expect(comparison.maximumDifference).toBeLessThanOrEqual(8);
  expect(comparison.differentChannels / comparison.rgbChannels).toBeLessThan(0.001);
  return comparison;
}

const physicalCpuScenarios: PhysicalScenario[] = [
  ...[
    FilmType.KODAK_GOLD_200, FilmType.KODAK_PORTRA_400, FilmType.KODAK_EKTAR_100,
    FilmType.FUJI_C200, FilmType.FUJI_XTRA_400, FilmType.FUJI_PRO_400H, FilmType.KODAK_VISION3_500T,
  ].map(stock => ({ stock, format: 'PNG' as const, aspect: 'native' as const })),
  { stock: FilmType.FUJI_PRO_400H, format: 'PNG', aspect: '4:3' },
  { stock: FilmType.KODAK_GOLD_200, format: 'JPG', aspect: '4:3' },
];

for (const scenario of physicalCpuScenarios) {
  test(`${scenario.stock} physical CPU output matches across real Worker and forced-main routes (${scenario.format}, ${scenario.aspect})`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await page.evaluate(() => caches.delete('pro400h-test-frames'));
    try {
      const cpu = await developWorkerAndMain(page, 'cpu', scenario);
      await testInfo.attach('pro400h-cpu-worker-main.json', {
        body: JSON.stringify(cpu, null, 2),
        contentType: 'application/json',
      });
    } finally {
      await page.evaluate(() => caches.delete('pro400h-test-frames'));
    }
  });
}

test('Pro 400H physical CPU and WebGL2 outputs match across real Worker and forced-main routes', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/');
  // This case is specifically CPU-versus-GPU, so it needs a hardware backend.
  test.skip(!(await explicitWebgl2SpectralUsable(page)), NO_HARDWARE_WEBGL2_REASON);
  await page.evaluate(() => caches.delete('pro400h-test-frames'));
  try {
    const cpu = await developWorkerAndMain(page, 'cpu');
    const gpu = await developWorkerAndMain(page, 'webgl2');
    const comparison = await compareRgb(page, cpu.worker.frameId, gpu.worker.frameId);
    expect(cpu.main.hash).toBe(cpu.worker.hash);
    expect(gpu.main.hash).toBe(gpu.worker.hash);
    testInfo.attach('pro400h-final-rgb-comparison.json', {
      body: JSON.stringify({ ...comparison, cpu, gpu }, null, 2),
      contentType: 'application/json',
    });
    await writeFile(testInfo.outputPath('pro400h-final-rgb-comparison.json'), JSON.stringify({ ...comparison, cpu, gpu }, null, 2));
  } finally {
    await page.evaluate(() => caches.delete('pro400h-test-frames'));
  }
});

test('Pro 400H hole presence matches the independent CPU reference on WebGL2', async ({ page }, testInfo) => {
  test.skip(testInfo.project.use.baseURL !== 'http://127.0.0.1:4174', 'Development server provides source modules for isolated GPU diagnostics.');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { loadSpectralStockResource } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/stockResourceLoader.ts`) as typeof import('../../services/spectral/stockResourceLoader');
    const { createPortraPipeline } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/portraPipeline.ts`) as typeof import('../../services/spectral/portraPipeline');
    const { WebGlSpectralRenderer } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/webgl/renderer.ts`) as typeof import('../../services/spectral/webgl/renderer');
    const { solveBaseCancelingHoleDensity, blendFilmPresence } = await import(/* @vite-ignore */ `${location.origin}/services/physical135/density.ts`) as typeof import('../../services/physical135/density');
    const { exposeFilm, developFilm } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/film.ts`) as typeof import('../../services/spectral/film');
    const { exposePaper, developPaper } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/print.ts`) as typeof import('../../services/spectral/print');
    const { scanPaper } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/scan.ts`) as typeof import('../../services/spectral/scan');
    const { multiply3 } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/math.ts`) as typeof import('../../services/spectral/math');
    const resource = await loadSpectralStockResource('FUJI PRO 400H' as never);
    const pipeline = createPortraPipeline(resource);
    const hole = solveBaseCancelingHoleDensity(
      resource.arrays.filmChannelDensity.values,
      resource.arrays.filmBaseDensity.values,
      resource.arrays.filmSpectralValidMask.values,
    );
    const pixels = new Float32Array(16 * 3);
    const presence = new Float32Array(16);
    for (let pixel = 0; pixel < 16; pixel += 1) {
      pixels.set(multiply3(pipeline.setup.arrays.srgbToProPhoto, [pixel % 4 / 3, Math.floor(pixel / 4) / 3, 0.4]), pixel * 3);
      presence[pixel] = pixel % 5 === 0 ? 0 : pixel % 5 === 1 ? 0.5 : 1;
    }
    const image = { width: 4, height: 4, pixels };
    const negative = developFilm(pipeline.setup, exposeFilm(pipeline.setup, image));
    const expectedFilm = blendFilmPresence(negative, presence, hole.cmy);
    const expectedPrint = scanPaper(pipeline.setup, developPaper(pipeline.setup, exposePaper(pipeline.setup, pipeline.print, expectedFilm)));
    const renderer = new WebGlSpectralRenderer(document.createElement('canvas'), pipeline);
    const { frame } = renderer.render(image, presence, hole.cmy);
    let maximumFilmDifference = 0;
    let maximumPrintDifference = 0;
    try {
      const actualFilm = renderer.readStage(frame, 'filmRaw').rgb;
      const actualPrint = renderer.readStage(frame, 'printRgb').rgb;
      for (let index = 0; index < expectedFilm.length; index += 1) {
        maximumFilmDifference = Math.max(maximumFilmDifference, Math.abs(actualFilm[index] - expectedFilm[index]));
        maximumPrintDifference = Math.max(maximumPrintDifference, Math.abs(actualPrint[index] - expectedPrint[index]));
      }
    } finally {
      renderer.releaseFrame(frame);
    }
    const activeFrames = renderer.measurements.activeFrames;
    const releasedBytes = renderer.info.textureBytes;
    const setupBytes = renderer.info.setupTextureBytes;
    renderer.dispose();
    return { cmy: hole.cmy, validWavelengths: hole.validWavelengths, maximumFilmDifference, maximumPrintDifference, activeFrames, releasedBytes, setupBytes, disposedBytes: renderer.info.textureBytes };
  });
  expect(result.validWavelengths).toBe(64);
  expect(result.cmy[0]).toBeCloseTo(-0.15987999377865675, 10);
  expect(result.cmy[1]).toBeCloseTo(-0.6212653381170062, 10);
  expect(result.cmy[2]).toBeCloseTo(-1.0281100912279255, 10);
  expect(result.maximumFilmDifference).toBeLessThan(1e-5);
  expect(result.maximumPrintDifference).toBeLessThan(1e-4);
  expect(result.activeFrames).toBe(0);
  expect(result.releasedBytes).toBe(result.setupBytes);
  expect(result.disposedBytes).toBe(0);
});
