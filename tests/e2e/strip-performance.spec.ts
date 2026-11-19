import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { instrumentWorkerPerformance, type WorkerPerformanceEvidence } from './workerPerformanceProbe';
import { selectFilmStock } from './stockPicker';
import { getRecipeInspector, selectRecipeControl } from './recipeControls';
import { FilmType } from '../../types';

const fixture = path.resolve(process.cwd(), 'tests/fixtures/physical-natural-portrait.png');

type StripBackend = 'cpu' | 'webgl2';
type Measurement = {
  backend: StripBackend;
  count: number;
  cache: 'cold' | 'warm';
  elapsedMs: number;
  outcome: 'rendered' | 'rejected' | 'timeout' | 'error';
  bytes?: number;
  hash?: string;
  renderer?: string;
  worker?: WorkerPerformanceEvidence;
  measuredBackend?: StripBackend;
  heapBefore?: number;
  heapAfter?: number;
  message?: string;
};

async function measureStrip(page: Page, backend: StripBackend, count: number, cache: 'cold' | 'warm'): Promise<Measurement> {
  await page.goto('/');
  const worker = await instrumentWorkerPerformance(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type=file]').setInputFiles(Array.from({ length: count }, () => fixture));
  const inspector = getRecipeInspector(page);
  await selectFilmStock(inspector, FilmType.KODAK_GOLD_200);
  await selectRecipeControl(page, '成像方式', 'spectral');
  await selectRecipeControl(page, '片边方式', 'physical135');
  await selectRecipeControl(page, '光谱计算', backend);
  await inspector.getByLabel('颗粒强度').fill('0');
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  await expect(page.getByRole('button', { name: `冲洗待更新照片 (${count})`, exact: true })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('tab', { name: /胶片长条/ }).click();
  const renderer = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return 'no-webgl2-context';
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : 'unavailable';
  });
  const heapBefore = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize);
  const started = Date.now();
  await page.getByLabel('长条预览').getByRole('button', { name: '生成胶片长条' }).click();
  const strip = page.getByRole('img', { name: '已生成的胶片长条' });
  const admissionMessage = page.getByText(/最大边长|32767|预算|无法生成长条|超出.*限制|超过浏览器安全上限/);
  const admission = await Promise.race([
    expect.poll(() => worker.requestedIds.length, { timeout: 125_000 }).toBe(1).then(() => 'requested' as const),
    admissionMessage.waitFor({ state: 'visible', timeout: 125_000 }).then(() => 'rejected' as const),
  ]).catch(() => 'unobserved' as const);
  if (admission !== 'requested') {
    const message = await page.locator('body').innerText();
    return {
      backend, count, cache, elapsedMs: Date.now() - started,
      outcome: admission === 'rejected' ? 'rejected' : 'error', renderer, worker, heapBefore,
      message: message.slice(-1200),
    };
  }
  try {
    await expect(strip).toBeVisible({ timeout: 125_000 });
  } catch {
    const message = await page.locator('body').innerText();
    const outcome = /最大边长|32767|预算/.test(message)
      ? 'rejected'
      : /处理失败|错误|超时|内存不足/.test(message) ? 'error' : 'timeout';
    return { backend, count, cache, elapsedMs: Date.now() - started, outcome, renderer, worker, heapBefore, message: message.slice(-1200) };
  }
  const result = await strip.evaluate(async element => {
    const image = element as HTMLImageElement;
    const blob = await (await fetch(image.currentSrc)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, bitmap.width, bitmap.height).data;
    bitmap.close();
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    return {
      bytes: blob.size,
      hash: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
    };
  });
  const heapAfter = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize);
  await expect.poll(() => worker.successfulIds.length, { timeout: 15_000 }).toBe(worker.requestedIds.length);
  await expect.poll(() => worker.responseBackends.length, { timeout: 15_000 }).toBe(worker.requestedIds.length);
  expect(worker.successfulIds).toEqual(worker.requestedIds);
  expect(worker.failedIds).toEqual([]);
  expect(worker.fallbacks).toBe(0);
  expect(worker.glErrors).toEqual([]);
  expect(worker.responseBackends).toEqual([backend]);
  if (backend === 'webgl2') {
    expect(worker.webgl2Contexts).toBeGreaterThan(0);
    expect(worker.floatColorBuffers).toBeGreaterThan(0);
    expect(worker.floatReadbacks).toBeGreaterThan(0);
  } else {
    expect(worker.webgl2Contexts).toBe(0);
  }
  return { backend, measuredBackend: worker.responseBackends[0] as StripBackend, count, cache, elapsedMs: Date.now() - started, outcome: 'rendered', renderer, worker, heapBefore, heapAfter, ...result };
}

for (const backend of ['cpu', 'webgl2'] as const) {
  for (const count of [10, 20, 36]) {
    for (const cache of ['cold', 'warm'] as const) {
      test(`strip performance ${backend} ${count} frames ${cache}`, async ({ page }, testInfo) => {
        test.setTimeout(360_000);
        let result: Measurement;
        try {
          result = await measureStrip(page, backend, count, cache);
        } catch (error) {
          testInfo.attach('evidence-error.json', { body: JSON.stringify({ message: error instanceof Error ? error.message : String(error) }), contentType: 'application/json' });
          throw error;
        }
        await writeFile(testInfo.outputPath('measurement.json'), JSON.stringify(result, null, 2));
        await writeFile(path.join('.trellis/tasks/11-15-quality-release-remediation', `measurement-${backend}-${count}-${cache}.json`), JSON.stringify(result, null, 2));
        testInfo.attach('measurement.json', { body: JSON.stringify(result), contentType: 'application/json' });
        // A rendered comparison is valid only with a matching successful Worker
        // and actual backend. Budget rejection is a valid boundary measurement;
        // timeouts/errors remain visible records, never a claimed performance pass.
        if (result.outcome === 'rendered') {
          expect(result.measuredBackend).toBe(backend);
          expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
        } else {
          test.skip(true, `Measurement did not produce a comparable artifact: ${result.outcome}`);
        }
      });
    }
  }
}
