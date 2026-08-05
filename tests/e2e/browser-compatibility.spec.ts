import path from 'node:path';
import { expect, test, type Page, type Request } from '@playwright/test';

const firstFixture = path.resolve(
  process.cwd(),
  'public/film-overlays/aperture-mask-derived.png',
);
const secondFixture = path.resolve(
  process.cwd(),
  'public/film-overlays/aperture-shadow-derived.png',
);
const firstName = path.basename(firstFixture);
const secondName = path.basename(secondFixture);

function isUnexpectedMutation(request: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return false;
  return new URL(request.url()).pathname !== '/auth/refresh';
}

async function uploadFixtures(page: Page, fixtures: string[]) {
  await page.locator('input[type="file"]').setInputFiles(fixtures);
}

test('local photo workflow remains compatible across browser engines', async ({ page }) => {
  const externalRequests: string[] = [];
  const unexpectedMutations: string[] = [];
  const applicationRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    applicationRequests.push(`${request.method()} ${url.pathname}`);
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:4174') {
      externalRequests.push(request.url());
    }
    if (isUnexpectedMutation(request)) {
      unexpectedMutations.push(`${request.method()} ${request.url()}`);
    }
  });
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

  await uploadFixtures(page, [firstFixture]);
  await expect(page.getByRole('img', { name: firstName })).toBeVisible();
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(1, {
    timeout: 30_000,
  });

  await page.getByRole('button', { name: `查看 ${firstName}` }).click();
  let preview = page.getByRole('dialog', { name: new RegExp(firstName) });
  const originalMode = preview.getByRole('button', { name: '原图' });
  const processedMode = preview.getByRole('button', { name: '成片', exact: true });
  await originalMode.click();
  await expect(originalMode).toHaveAttribute('aria-pressed', 'true');
  await processedMode.click();
  await expect(processedMode).toHaveAttribute('aria-pressed', 'true');

  const previewImage = preview.getByRole('img', { name: firstName });
  const sourceBeforeRotation = await previewImage.getAttribute('src');
  await preview.getByRole('button', { name: '顺时针旋转 90°' }).click();
  await expect.poll(() => previewImage.getAttribute('src'), { timeout: 30_000 })
    .not.toBe(sourceBeforeRotation);
  await preview.getByRole('button', { name: '应用并冲洗此张' }).click();
  const previewDownload = preview.getByRole('link', { name: '下载当前预览' });
  await expect(previewDownload).toBeVisible({ timeout: 30_000 });
  await expect(previewDownload).toHaveAttribute('href', /^blob:/);
  await expect(previewDownload).toHaveAttribute('download', /\.jpg$/);
  await preview.getByRole('button', { name: '关闭预览' }).click();

  await uploadFixtures(page, [secondFixture]);
  await expect(page.getByRole('img', { name: secondName })).toBeVisible();
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(2, {
    timeout: 30_000,
  });

  await page.getByRole('button', { name: `查看 ${firstName}` }).click();
  preview = page.getByRole('dialog', { name: new RegExp(firstName) });
  await preview.getByRole('button', { name: '下一张' }).click();
  preview = page.getByRole('dialog', { name: new RegExp(secondName) });
  await expect(preview.getByRole('button', { name: '成片', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await preview.getByRole('button', { name: '关闭预览' }).click();

  await page.getByRole('tab', { name: /连底长条 · 2 张入选/ }).click();
  const stripStage = page.getByLabel('长条审片台');
  await stripStage.getByRole('button', { name: '生成胶片长条' }).click();
  await expect(stripStage.getByRole('img', { name: '已生成的胶片长条' })).toBeVisible({
    timeout: 30_000,
  });
  const stripDownload = page.waitForEvent('download');
  await stripStage.getByRole('button', { name: '下载' }).click();
  await expect((await stripDownload).suggestedFilename()).toMatch(/^film_strip\.(jpg|png)$/);

  expect(externalRequests).toEqual([]);
  expect(unexpectedMutations).toEqual([]);
  expect(applicationRequests.indexOf('GET /api/runtime-config')).toBeGreaterThanOrEqual(0);
  expect(applicationRequests.indexOf('GET /api/runtime-config')).toBeLessThan(
    applicationRequests.indexOf('POST /auth/refresh'),
  );
});
