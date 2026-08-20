import { expect, test, type Request } from '@playwright/test';

// 32px static RGB fixture encoded with libheif/heif-enc for portable decoder coverage.
const STATIC_HEIC = Buffer.from(
  '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',
  'base64',
);

function isUnexpectedMutation(request: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return false;
  return new URL(request.url()).pathname !== '/auth/refresh';
}

test('a static HEIC still converts locally, previews, and develops', async ({ page }) => {
  const externalRequests: string[] = [];
  const unexpectedMutations: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
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

  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toHaveAttribute(
    'accept',
    'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif',
  );
  await fileInput.setInputFiles({
    name: 'portable-static.heic',
    mimeType: 'image/heic',
    buffer: STATIC_HEIC,
  });
  await expect(page.getByRole('img', { name: 'portable-static.heic' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.getByRole('dialog', { name: '需要处理' })).toHaveCount(0);
  expect(externalRequests).toEqual([]);
  expect(unexpectedMutations).toEqual([]);
});
