import { expect, test } from '@playwright/test';
import { selectFilmStock } from './stockPicker';

test.use({ launchOptions: { ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--enable-unsafe-swiftshader'] } });

async function prepare(page: import('@playwright/test').Page) {
  await page.route('**/api/runtime-config', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ maxCanvasMiB: 700, maxCanvasBytes: 700 * 1024 * 1024, updatedAt: 0 }) }));
  await page.route('**/auth/refresh', route => route.fulfill({ status: 204 }));
}

test('new sessions default to physical 135 with an automatic equivalent backend', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await expect(inspector.getByLabel('底片渲染')).toHaveValue('physical135');
  await expect(inspector.getByLabel('成像方式')).toHaveValue('spectral');
  await expect(inspector.getByLabel('光谱计算')).toHaveValue('auto');
  await page.locator('input[type=file]').setInputFiles('public/film-overlays/film-base.png');
  await inspector.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 90000 });
  await inspector.getByLabel('底片渲染').selectOption('legacy-template');
  await inspector.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('button', { name: '全部成片均为最新' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('filmFrame.preferences.v1') ?? '{}').settings?.edgeRenderMode)).toBe('legacy-template');
});

test('legacy preference envelopes and explicit template rollback are preserved', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('filmFrame.preferences.v1', JSON.stringify({
      settings: { brandText: 'KODAK PORTRA 400', frameRenderMode: 'real135', outputFormat: 'image/png' },
      outputMode: 'single',
    }));
  });
  await page.reload();
  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await expect(inspector.getByLabel('底片渲染')).toHaveValue('legacy-template');
  await expect(inspector.getByLabel('成像方式')).toHaveValue('legacy');
  const saved = await page.evaluate(() => localStorage.getItem('filmFrame.preferences.v1'));
  expect(saved).toContain('"renderPreferenceVersion":1');
  expect(saved).toContain('"edgeRenderMode":"legacy-template"');
  expect(saved).toContain('"imagingMode":"legacy"');
  await page.locator('input[type=file]').setInputFiles('public/film-overlays/film-base.png');
  await inspector.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 90000 });
  await page.getByRole('tab', { name: /连底长条/ }).click();
  await page.getByLabel('长条审片台').getByRole('button', { name: '生成胶片长条' }).click();
  await expect(page.getByRole('img', { name: '已生成的胶片长条' })).toBeVisible({ timeout: 90000 });
});

test('legacy recipes restore their original real-135 imaging and strip workflow', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('filmFrame.recipes.v1', JSON.stringify([{
      id: 'legacy-portra', name: 'Legacy Portra', updatedAt: 1,
      settings: { brandText: 'KODAK PORTRA 400', frameRenderMode: 'real135', outputFormat: 'image/png' },
    }]));
  });
  await page.reload();
  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await expect(inspector.getByLabel('底片渲染')).toHaveValue('physical135');
  await inspector.getByLabel('选择本地配方').selectOption('legacy-portra');
  await expect(inspector.getByLabel('底片渲染')).toHaveValue('legacy-template');
  await expect(inspector.getByLabel('成像方式')).toHaveValue('legacy');
  await page.locator('input[type=file]').setInputFiles('public/film-overlays/film-base.png');
  await inspector.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 90000 });
  await page.getByRole('tab', { name: /连底长条/ }).click();
  await page.getByLabel('长条审片台').getByRole('button', { name: '生成胶片长条' }).click();
  await expect(page.getByRole('img', { name: '已生成的胶片长条' })).toBeVisible({ timeout: 90000 });
});

test('Pro 400H supports full physical spectral rendering like upstream overscan', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await selectFilmStock(inspector, 'FUJI PRO 400H');
  await expect(inspector.getByLabel('底片渲染')).toHaveValue('physical135');
  await expect(inspector.getByLabel('成像方式')).toHaveValue('spectral');
  await inspector.getByLabel('光谱计算').selectOption('cpu');
  await page.locator('input[type=file]').setInputFiles('public/film-overlays/film-base.png');
  await inspector.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 90000 });
  const accepted = await page.evaluate(async () => {
    const { assertPhysicalCombination } = await import(/* @vite-ignore */ `${location.origin}/services/physical135/plan.ts`) as typeof import('../../services/physical135/plan');
    try {
      assertPhysicalCombination({ brandText: 'FUJI PRO 400H' as never, frameRenderMode: 'real135', edgeRenderMode: 'physical135', imagingMode: 'spectral' });
      return true;
    } catch {
      return false;
    }
  });
  expect(accepted).toBe(true);
});
