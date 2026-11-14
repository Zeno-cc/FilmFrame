import { expect, type Locator } from '@playwright/test';

export async function selectFilmStock(inspector: Locator, stock: string) {
  await inspector.getByRole('button', { name: '胶片型号', exact: true }).click();
  const listbox = inspector.getByRole('listbox', { name: '胶片型号' });
  await expect(listbox).toBeVisible();
  await listbox.getByRole('option', { name: new RegExp(`^${stock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: · 光谱)?$`), exact: true }).click();
  await expect(listbox).toHaveCount(0);
}
