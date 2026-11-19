import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectFilmStock } from './stockPicker';
import { getRecipeInspector, selectRecipeControl } from './recipeControls';
import { FilmType } from '../../types';
import {
  createFilmTemplateStripLayout,
  createKodakGoldOverlayLayout,
  createKodakGoldStripLayout,
} from '../../services/filmOverlay';

const fixture = path.resolve(process.cwd(), 'public/film-overlays/film-base.png');
const fixtureName = path.basename(fixture);
// A near-black fixture cannot reveal spatial/spectral misregistration, so the
// edge-coverage case uses a real high-contrast photo from the repo.
const contrastFixture = path.resolve(process.cwd(), 'public/images/darkroom-demo-landscape.jpg');
const contrastFixtureName = path.basename(contrastFixture);

const PREVIEW_SINGLE_WIDTH = 1200;
const PREVIEW_STRIP_FRAME_WIDTH = 900;

type StripKind = 'gold' | 'template';

function apertureRect(kind: StripKind, frames: number) {
  const layout = kind === 'gold'
    ? createKodakGoldStripLayout(PREVIEW_STRIP_FRAME_WIDTH, frames, 4)
    : createFilmTemplateStripLayout(PREVIEW_STRIP_FRAME_WIDTH, frames, 4);
  return {
    x: layout.padding + layout.frame.imageX,
    y: layout.padding + layout.frame.imageY,
    w: layout.frame.imageW,
    h: layout.frame.imageH,
  };
}

const SINGLE_APERTURE = createKodakGoldOverlayLayout(PREVIEW_SINGLE_WIDTH);

function instrumentSpectralBackend(page: Page): number[] {
  const creations: number[] = [];
  page.on('console', message => {
    if (message.text() === '__ffSpectralBackendCreate') creations.push(1);
  });
  page.route('**/services/spectral/backend.ts*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = 'export function createSpectralBackend(';
    if (!source.includes(marker)) throw new Error('Spectral backend factory marker missing from the served module');
    const instrumented = source.replace(marker, 'function __ffCreateSpectralBackend(')
      + '\nexport function createSpectralBackend(options = {}) { console.info("__ffSpectralBackendCreate"); return __ffCreateSpectralBackend(options); }\n';
    await route.fulfill({ response, body: instrumented });
  });
  return creations;
}

type SetupOptions = {
  backend?: 'cpu' | 'webgl2';
  mode?: 'spectral' | 'legacy';
  forceMainThread?: boolean;
  files?: number;
  instrument?: boolean;
  fixturePath?: string;
};

async function setupStrip(page: Page, stock: FilmType, options: SetupOptions = {}) {
  const { backend = 'cpu', mode = 'spectral', forceMainThread = false, files = 1, instrument = false, fixturePath = fixture } = options;
  const creations = instrument ? instrumentSpectralBackend(page) : [];
  if (forceMainThread) {
    await page.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  }
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('input[type="file"]').setInputFiles(Array.from({ length: files }, () => fixturePath));
  const inspector = getRecipeInspector(page);
  await selectFilmStock(inspector, stock);
  await selectRecipeControl(page, '成像方式', mode);
  if (mode === 'spectral') await selectRecipeControl(page, '光谱计算', backend);
  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await inspector.getByLabel('颗粒强度').fill('0');
  await inspector.getByRole('button', { name: 'PNG', exact: true }).click();
  return { inspector, creations };
}

async function developSingle(page: Page) {
  const button = getRecipeInspector(page).getByRole('button', { name: /冲洗待更新照片|重新冲洗全部/ });
  await expect(button).toBeEnabled({ timeout: 60_000 });
  await button.click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('dialog', { name: '需要处理' })).toHaveCount(0);
}

async function generateStrip(page: Page, stripTimeout = 180_000) {
  const tab = page.getByRole('tab', { name: /胶片长条/ });
  await expect(tab).toBeEnabled({ timeout: 120_000 });
  await tab.click();
  await page.getByLabel('长条预览').getByRole('button', { name: '生成胶片长条' }).click();
  const strip = page.getByRole('img', { name: '已生成的胶片长条' });
  await expect(strip).toBeVisible({ timeout: stripTimeout });
  await expect(page.getByRole('dialog', { name: '需要处理' })).toHaveCount(0);
  return strip;
}

type ImageSize = { width: number; height: number };

async function imageSize(locator: Locator): Promise<ImageSize> {
  return locator.evaluate(element => {
    const image = element as HTMLImageElement;
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
}

const normalize = (rect: { x: number; y: number; w: number; h: number }) => ({
  x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h),
});

/** Downscale the source rect to a fixed grid so two differently-scaled layouts compare cleanly. */
async function readRect(locator: Locator, rect: { x: number; y: number; w: number; h: number }, grid = 96, outHeight?: number): Promise<number[]> {
  const r = normalize(rect);
  const outW = grid;
  const outH = outHeight ?? Math.max(1, Math.round((grid * r.h) / r.w));
  return locator.evaluate((element, args) => {
    const image = element as HTMLImageElement;
    const source = document.createElement('canvas');
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const sourceContext = source.getContext('2d');
    if (!sourceContext) throw new Error('Missing source context');
    sourceContext.drawImage(image, 0, 0);
    const out = document.createElement('canvas');
    out.width = args.outW;
    out.height = args.outH;
    const outContext = out.getContext('2d');
    if (!outContext) throw new Error('Missing output context');
    outContext.imageSmoothingEnabled = true;
    outContext.imageSmoothingQuality = 'high';
    outContext.drawImage(source, args.r.x, args.r.y, args.r.w, args.r.h, 0, 0, args.outW, args.outH);
    return Array.from(outContext.getImageData(0, 0, args.outW, args.outH).data);
  }, { r, outW, outH });
}

function meanAbsDifference(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) throw new Error(`Pixel arrays must match and be non-empty: ${a.length} vs ${b.length}`);
  let total = 0;
  let samples = 0;
  for (let index = 0; index < a.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      total += Math.abs(a[index + channel] - b[index + channel]);
      samples += 1;
    }
  }
  return total / samples;
}

test('Gold 200 spectral template strip renders through the Worker without a boundary error', async ({ page }) => {
  await setupStrip(page, FilmType.KODAK_GOLD_200);
  const strip = await generateStrip(page);
  const size = await imageSize(strip);
  const expected = createKodakGoldStripLayout(PREVIEW_STRIP_FRAME_WIDTH, 1, 4);
  expect(size).toEqual({ width: expected.totalW, height: expected.totalH });
});

test('Portra 400 spectral template strip renders without a boundary error', async ({ page }) => {
  await setupStrip(page, FilmType.KODAK_PORTRA_400);
  const strip = await generateStrip(page);
  const size = await imageSize(strip);
  const expected = createFilmTemplateStripLayout(PREVIEW_STRIP_FRAME_WIDTH, 1, 4);
  expect(size).toEqual({ width: expected.totalW, height: expected.totalH });
});

test('forced main-thread Gold spectral template strip matches Worker output dimensions with one session', async ({ page }) => {
  test.setTimeout(180_000);
  await setupStrip(page, FilmType.KODAK_GOLD_200, { files: 4 });
  const workerStrip = await generateStrip(page);
  const workerSize = await imageSize(workerStrip);

  const { creations } = await setupStrip(page, FilmType.KODAK_GOLD_200, { files: 4, forceMainThread: true, instrument: true });
  const mainStrip = await generateStrip(page);
  expect(await imageSize(mainStrip)).toEqual(workerSize);
  expect(creations.length).toBe(1);
});

test('Portra 400 template strip reuses a single spectral session across frames', async ({ page }) => {
  test.setTimeout(180_000);
  const { creations } = await setupStrip(page, FilmType.KODAK_PORTRA_400, { files: 4, forceMainThread: true, instrument: true });
  await generateStrip(page);
  expect(creations.length).toBe(1);
});

test('Gold 200 legacy template strip keeps the Gold look instead of spectral development', async ({ page }) => {
  await setupStrip(page, FilmType.KODAK_GOLD_200, { mode: 'spectral' });
  const spectralStrip = await generateStrip(page);
  const spectral = await readRect(spectralStrip, apertureRect('gold', 1));

  await setupStrip(page, FilmType.KODAK_GOLD_200, { mode: 'legacy' });
  const legacyStrip = await generateStrip(page);
  const legacy = await readRect(legacyStrip, apertureRect('gold', 1));

  expect(meanAbsDifference(spectral, legacy)).toBeGreaterThan(6);
});

/** Mirror the production software-renderer policy: an explicit WebGL2 request is rejected on SwiftShader. */
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

for (const stock of [FilmType.KODAK_GOLD_200, FilmType.KODAK_PORTRA_400] as const) {
  for (const backend of ['cpu', 'webgl2'] as const) {
    test(`${stock} strip first frame matches the single spectral aperture (${backend})`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      await setupStrip(page, stock, { backend, mode: 'spectral' });
      if (backend === 'webgl2') {
        test.skip(
          !(await explicitWebgl2SpectralUsable(page)),
          'Explicit WebGL2 spectral requires a hardware renderer; this environment rejects the software renderer, so the app-policy GPU path is unverified here.',
        );
      }
      await developSingle(page);
      const singleSpectral = await readRect(page.getByRole('img', { name: fixtureName }), {
        x: SINGLE_APERTURE.imageX, y: SINGLE_APERTURE.imageY, w: SINGLE_APERTURE.imageW, h: SINGLE_APERTURE.imageH,
      });
      const strip = await generateStrip(page);
      const rect = apertureRect(stock === FilmType.KODAK_GOLD_200 ? 'gold' : 'template', 1);
      const stripFrame = await readRect(strip, rect);

      await setupStrip(page, stock, { backend: 'cpu', mode: 'legacy' });
      const legacyStrip = await generateStrip(page);
      const legacyFrame = await readRect(legacyStrip, rect);

      const spectralDifference = meanAbsDifference(stripFrame, singleSpectral);
      const legacyDifference = meanAbsDifference(stripFrame, legacyFrame);
      const evidence = { stock, backend, spectralDifference, legacyDifference };
      await testInfo.attach('spectral-template-parity.json', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
      });
      // Kept next to the other ignored Playwright output: the task directory
      // this used to live in is archived once the task closes.
      const evidenceDir = path.resolve('output/playwright/spectral-parity');
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(
        path.join(evidenceDir, `parity-${stock.replace(/\s+/g, '-').toLowerCase()}-${backend}.json`),
        JSON.stringify(evidence, null, 2),
      );
      // The strip frame must be spectrally developed: it has to match the single
      // spectral aperture much more closely than its own legacy-look counterpart.
      expect(spectralDifference).toBeLessThan(legacyDifference);
      expect(spectralDifference).toBeLessThan(18);
    });
  }
}

test('template strip develops its aperture through the right and bottom edges', async ({ page }) => {
  test.setTimeout(240_000);
  const layout = createFilmTemplateStripLayout(PREVIEW_STRIP_FRAME_WIDTH, 1, 4);
  const scale = PREVIEW_SINGLE_WIDTH / PREVIEW_STRIP_FRAME_WIDTH;
  const band = 30;
  const stripRight = {
    x: layout.padding + layout.frame.imageX + layout.frame.imageW - band,
    y: layout.padding + layout.frame.imageY,
    w: band,
    h: layout.frame.imageH,
  };
  const singleRight = {
    x: SINGLE_APERTURE.imageX + SINGLE_APERTURE.imageW - Math.round(band * scale),
    y: SINGLE_APERTURE.imageY,
    w: Math.round(band * scale),
    h: SINGLE_APERTURE.imageH,
  };

  await setupStrip(page, FilmType.KODAK_PORTRA_400, { fixturePath: contrastFixture });
  await developSingle(page);
  const singleBand = await readRect(page.getByRole('img', { name: contrastFixtureName }), singleRight, 96, 512);
  const spectralStrip = await generateStrip(page);
  const spectralBand = await readRect(spectralStrip, stripRight, 96, 512);

  await setupStrip(page, FilmType.KODAK_PORTRA_400, { fixturePath: contrastFixture, mode: 'legacy' });
  const legacyStrip = await generateStrip(page);
  const legacyBand = await readRect(legacyStrip, stripRight, 96, 512);

  // The trailing edge of every aperture must be spectrally developed exactly like
  // the single frame. A per-frame coordinate offset (or an unprocessed margin)
  // makes this band match the raw legacy aperture instead, so this is a strictly
  // stronger check than the whole-aperture parity above.
  const developed = meanAbsDifference(spectralBand, singleBand);
  const raw = meanAbsDifference(legacyBand, singleBand);
  expect(developed).toBeLessThan(raw * 0.5);
});

test('a spectral template strip fails loudly instead of degrading to classic color', async ({ page }) => {
  // Forced main thread so the overlay request is owned by the page and can be
  // faulted here. A spectral strip must surface the failure, not silently emit a
  // classic (non-spectral) strip.
  await page.route('**/film-overlays/kodak-portra-400.png', route => route.fulfill({ status: 404 }));
  await setupStrip(page, FilmType.KODAK_PORTRA_400, { forceMainThread: true });
  await page.getByRole('tab', { name: /胶片长条/ }).click();
  await page.getByLabel('长条预览').getByRole('button', { name: '生成胶片长条' }).click();
  await expect(page.getByRole('dialog', { name: '需要处理' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('img', { name: '已生成的胶片长条' })).toHaveCount(0);
});

test('36-frame Gold spectral template strip stays within the canvas budget with one session', async ({ page }) => {
  test.setTimeout(900_000);
  // Select the stock with a single file first: the 36-thumbnail re-render churn
  // detaches the custom stock listbox options before Playwright can click them.
  const { creations } = await setupStrip(page, FilmType.KODAK_GOLD_200, { files: 1, forceMainThread: true, instrument: true });
  await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 35 }, () => fixture));
  await expect(page.getByRole('tab', { name: /胶片长条/ })).toContainText('36', { timeout: 120_000 });
  const strip = await generateStrip(page, 480_000);
  const size = await imageSize(strip);
  const expected = createKodakGoldStripLayout(PREVIEW_STRIP_FRAME_WIDTH, 36, 4);
  expect(size).toEqual({ width: expected.totalW, height: expected.totalH });
  expect(creations.length).toBe(1);
});
