import path from 'node:path';
import { expect, test } from '@playwright/test';
import { selectFilmStock } from './stockPicker';
import { getRecipeInspector, selectRecipeControl } from './recipeControls';
import { isDocumentedPublicGalleryRequest } from './publicRequests';

const fixture = path.resolve(
  process.cwd(),
  'public/film-overlays/aperture-mask-derived.png',
);

type WorkerFallbackProbe = {
  workerConstructions: number;
  workerRequests: number;
  forcedFailures: number;
  htmlCanvasExports: number;
};

test('a started Worker failure completes through the main-thread Canvas renderer', async ({ page }) => {
  await prepareFailingWorker(page);
  await developThroughMainThread(page);
  const probe = await readFallbackProbe(page);
  expect(probe.workerConstructions).toBe(1);
  expect(probe.workerRequests).toBeGreaterThanOrEqual(1);
  expect(probe.forcedFailures).toBe(probe.workerRequests);
  expect(probe.htmlCanvasExports).toBeGreaterThanOrEqual(1);
});

test('spectral Worker failure completes locally through the same spectral main-thread route', async ({ page }, testInfo) => {
  const applicationOrigin = new URL(testInfo.project.use.baseURL as string).origin;
  const externalRequests: string[] = [];
  page.on('request', request => {
    if (isDocumentedPublicGalleryRequest(request)) return;
    if (new URL(request.url()).origin !== applicationOrigin
      && !request.url().startsWith('blob:') && !request.url().startsWith('data:')) {
      externalRequests.push(request.url());
    }
  });
  await prepareFailingWorker(page);
  await developThroughMainThread(page);
  const legacyPixels = await readAperturePixels(page);
  const inspector = getRecipeInspector(page);
  await selectRecipeControl(page, '成像方式', 'spectral');
  await selectRecipeControl(page, '光谱计算', 'cpu');
  await inspector.getByLabel('颗粒强度').fill('0');
  await page.getByRole('button', { name: /冲洗待更新照片|重新冲洗全部/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(1, { timeout: 30_000 });
  const spectralPixels = await readAperturePixels(page);
  expect(spectralPixels).not.toEqual(legacyPixels);
  const probe = await readFallbackProbe(page);
  expect(probe.workerConstructions).toBe(1);
  expect(probe.workerRequests).toBeGreaterThanOrEqual(2);
  expect(probe.forcedFailures).toBe(probe.workerRequests);
  expect(probe.htmlCanvasExports).toBeGreaterThanOrEqual(2);
  expect(externalRequests).toEqual([]);
});

async function readAperturePixels(page: import('@playwright/test').Page) {
  return page.getByRole('img', { name: path.basename(fixture) }).evaluate(element => {
    if (!(element instanceof HTMLImageElement)) throw new Error('Expected a rendered image');
    const image = element;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing test canvas context');
    context.drawImage(image, 0, 0);
    const x = Math.round(92 * image.naturalWidth / 1307);
    const y = Math.round(211 * image.naturalHeight / 1203);
    return Array.from(context.getImageData(x + 20, y + 20, 20, 20).data);
  });
}

async function developThroughMainThread(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('input[type="file"]').setInputFiles(fixture);
  const inspector = getRecipeInspector(page);
  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await selectRecipeControl(page, '成像方式', 'legacy');
  await selectFilmStock(inspector,'KODAK PORTRA 160');
  await expect(inspector.getByRole('group', { name: '画幅样式' })).toHaveCount(0);
  await expect(inspector.getByLabel('片边方式')).toBeVisible();
  await expect(page.getByRole('img', { name: path.basename(fixture) })).toBeVisible();
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByRole('dialog', { name: '需要处理' })).toHaveCount(0);
}

async function prepareFailingWorker(page: import('@playwright/test').Page) {
  await page.route('**/api/runtime-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      maxCanvasMiB: 700,
      maxCanvasBytes: 700 * 1024 * 1024,
      updatedAt: 0,
    }),
  }));
  await page.route('**/auth/refresh', route => route.fulfill({ status: 204 }));

  await page.addInitScript(() => {
    const probe: WorkerFallbackProbe = {
      workerConstructions: 0,
      workerRequests: 0,
      forcedFailures: 0,
      htmlCanvasExports: 0,
    };
    const browserWindow = window as typeof window & {
      __filmFrameWorkerFallbackProbe?: WorkerFallbackProbe;
    };
    browserWindow.__filmFrameWorkerFallbackProbe = probe;

    const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
      probe.htmlCanvasExports += 1;
      return nativeToBlob.call(this, callback, type, quality);
    };

    class FailingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;

      constructor() {
        probe.workerConstructions += 1;
      }

      postMessage(message: { id: number }) {
        probe.workerRequests += 1;
        window.setTimeout(() => {
          probe.forcedFailures += 1;
          this.onmessage?.({
            data: {
              id: message.id,
              ok: false,
              error: 'forced worker render failure',
            },
          } as MessageEvent);
        }, 0);
      }

      terminate() {}
    }

    Object.defineProperty(window, 'Worker', {
      configurable: true,
      writable: true,
      value: FailingWorker,
    });
  });

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.locator('input[type="file"]').setInputFiles(fixture);
  const inspector = getRecipeInspector(page);
  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await selectRecipeControl(page, '成像方式', 'legacy');
  await selectFilmStock(inspector,'KODAK PORTRA 160');
  await expect(inspector.getByRole('group', { name: '画幅样式' })).toHaveCount(0);
  await expect(inspector.getByLabel('片边方式')).toBeVisible();

  await expect(page.getByRole('img', { name: path.basename(fixture) })).toBeVisible();
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.getByRole('dialog', { name: '需要处理' })).toHaveCount(0);
}

async function readFallbackProbe(page: import('@playwright/test').Page) {
  return page.evaluate(() => (
    window as typeof window & {
      __filmFrameWorkerFallbackProbe: WorkerFallbackProbe;
    }
  ).__filmFrameWorkerFallbackProbe);
}
