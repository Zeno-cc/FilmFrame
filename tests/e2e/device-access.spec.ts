import { expect, test, type Request } from '@playwright/test';

test('application refreshes device authorization without exposing a logout command', async ({ page }) => {
  let refreshRequest: Request | undefined;
  await page.route('**/auth/refresh', async route => {
    refreshRequest = route.request();
    await route.fulfill({ status: 204 });
  });

  await page.goto('/');
  await expect.poll(() => refreshRequest?.method()).toBe('POST');
  expect(refreshRequest).toBeDefined();
  expect(new URL(refreshRequest!.url()).pathname).toBe('/auth/refresh');
  expect(refreshRequest!.headers().origin).toBe('http://127.0.0.1:4174');
  expect(refreshRequest!.headers()['x-filmframe-csrf']).toBe('1');
  expect(refreshRequest!.postData()).toBeNull();

  const more = page.locator('header').getByRole('button', { name: '更多操作' });
  await more.click();
  await expect(page.getByRole('menuitem', { name: '退出访问' })).toHaveCount(0);
});

test('failed authorization refresh does not interrupt the local darkroom', async ({ page }) => {
  await page.route('**/auth/refresh', route => route.fulfill({ status: 503 }));
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '让这一卷，慢慢显影' })).toBeVisible();
  await expect(page.getByText('退出失败，请稍后再试。')).toHaveCount(0);
});
