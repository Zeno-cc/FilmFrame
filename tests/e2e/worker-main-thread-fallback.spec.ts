import path from 'node:path';
import { expect, test } from '@playwright/test';

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

  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await inspector.getByLabel('胶片型号').selectOption('KODAK PORTRA 160');
  await expect(inspector.getByRole('button', { name: '真实 135' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.getByRole('img', { name: path.basename(fixture) })).toBeVisible();
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.getByRole('dialog', { name: '需要处理' })).toHaveCount(0);

  const probe = await page.evaluate(() => (
    window as typeof window & {
      __filmFrameWorkerFallbackProbe: WorkerFallbackProbe;
    }
  ).__filmFrameWorkerFallbackProbe);
  expect(probe.workerConstructions).toBe(1);
  expect(probe.workerRequests).toBeGreaterThanOrEqual(1);
  expect(probe.forcedFailures).toBe(probe.workerRequests);
  expect(probe.htmlCanvasExports).toBeGreaterThanOrEqual(1);
});
