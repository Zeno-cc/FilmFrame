import { expect, test } from '@playwright/test';

const MAX_CANVAS_MIB = 128;
const MAX_CANVAS_BYTES = MAX_CANVAS_MIB * 1024 * 1024;
const MAX_CANVAS_PIXELS = MAX_CANVAS_BYTES / 4;
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type CanvasAllocationProbe = {
  htmlCanvasAttempts: Array<{ width: number; height: number }>;
  offscreenCanvasAttempts: Array<{ width: number; height: number }>;
  workerAttempts: number;
};

test('128 MiB budget blocks a high-quality real-135 strip before Canvas allocation', async ({ page }) => {
  await page.route('**/auth/refresh', route => route.fulfill({ status: 204 }));
  await page.route('**/api/runtime-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      maxCanvasMiB: MAX_CANVAS_MIB,
      maxCanvasBytes: MAX_CANVAS_BYTES,
      updatedAt: 1_785_859_200,
    }),
  }));

  await page.addInitScript(({ maxCanvasPixels }) => {
    const probe: CanvasAllocationProbe = {
      htmlCanvasAttempts: [],
      offscreenCanvasAttempts: [],
      workerAttempts: 0,
    };
    const browserWindow = window as typeof window & {
      __filmFrameCanvasAllocationProbe?: CanvasAllocationProbe;
    };
    browserWindow.__filmFrameCanvasAllocationProbe = probe;

    const widthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      'width',
    );
    const heightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      'height',
    );
    if (
      !widthDescriptor?.get
      || !widthDescriptor.set
      || !heightDescriptor?.get
      || !heightDescriptor.set
    ) {
      throw new Error('Canvas dimension descriptors are unavailable');
    }

    const guardHtmlCanvas = (width: number, height: number) => {
      if (width * height <= maxCanvasPixels) return;
      probe.htmlCanvasAttempts.push({ width, height });
      throw new RangeError('Test guard blocked an oversized HTMLCanvasElement allocation');
    };

    Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
      ...widthDescriptor,
      set(value: number) {
        guardHtmlCanvas(Number(value), heightDescriptor.get!.call(this));
        widthDescriptor.set!.call(this, value);
      },
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'height', {
      ...heightDescriptor,
      set(value: number) {
        guardHtmlCanvas(widthDescriptor.get!.call(this), Number(value));
        heightDescriptor.set!.call(this, value);
      },
    });

    if (typeof OffscreenCanvas !== 'undefined') {
      const NativeOffscreenCanvas = OffscreenCanvas;
      const GuardedOffscreenCanvas = new Proxy(NativeOffscreenCanvas, {
        construct(target, argumentsList, newTarget) {
          const width = Number(argumentsList[0]);
          const height = Number(argumentsList[1]);
          if (width * height > maxCanvasPixels) {
            probe.offscreenCanvasAttempts.push({ width, height });
            throw new RangeError('Test guard blocked an oversized OffscreenCanvas allocation');
          }
          return Reflect.construct(target, argumentsList, newTarget);
        },
      });
      Object.defineProperty(window, 'OffscreenCanvas', {
        configurable: true,
        writable: true,
        value: GuardedOffscreenCanvas,
      });
    }

    if (typeof Worker !== 'undefined') {
      const NativeWorker = Worker;
      const GuardedWorker = new Proxy(NativeWorker, {
        construct() {
          probe.workerAttempts += 1;
          throw new Error('Test guard blocked rendering before the Worker could start');
        },
      });
      Object.defineProperty(window, 'Worker', {
        configurable: true,
        writable: true,
        value: GuardedWorker,
      });
    }
  }, { maxCanvasPixels: MAX_CANVAS_PIXELS });

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 1000 });

  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await expect(inspector.getByRole('button', { name: '高清出片' })).toBeEnabled();
  await expect(inspector.getByRole('button', { name: '真实 135' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: 20 }, (_, index) => ({
      name: `bounded-strip-${String(index + 1).padStart(2, '0')}.png`,
      mimeType: 'image/png',
      buffer: TINY_PNG,
    })),
  );
  await expect(page.getByRole('img', { name: 'bounded-strip-20.png' })).toBeVisible();

  await inspector.getByRole('button', { name: '高清出片' }).click();
  await expect(inspector.getByRole('button', { name: '高清出片' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('tab', { name: /连底长条 · 20 张入选/ }).click();
  await page.getByLabel('长条审片台').getByRole('button', { name: '生成胶片长条' }).click();

  const errorDialog = page.getByRole('dialog', { name: '需要处理' });
  await expect(errorDialog).toContainText('长条画布约');
  await expect(errorDialog).toContainText('超过浏览器安全上限');

  const allocationProbe = await page.evaluate(() => (
    window as typeof window & {
      __filmFrameCanvasAllocationProbe: CanvasAllocationProbe;
    }
  ).__filmFrameCanvasAllocationProbe);
  expect(allocationProbe).toEqual({
    htmlCanvasAttempts: [],
    offscreenCanvasAttempts: [],
    workerAttempts: 0,
  });
  await expect(page.getByRole('img', { name: '已生成的胶片长条' })).toHaveCount(0);
});
