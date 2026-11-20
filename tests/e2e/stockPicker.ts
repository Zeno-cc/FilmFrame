import { expect, type Locator } from '@playwright/test';

/**
 * Open the stock picker and choose a stock.
 *
 * CI hit a case where the trigger click landed while the settings panel was
 * still settling, the picker never opened, and the single 10s wait failed.
 * The click is therefore retried. Clicking the option keeps the original
 * assertion strength: the option only exists once the listbox is open.
 */
export async function selectFilmStock(inspector: Locator, stock: string) {
  const trigger = inspector.getByRole('button', { name: '胶片型号', exact: true });
  const listbox = inspector.getByRole('listbox', { name: '胶片型号' });
  const option = listbox.getByRole('option', {
    name: new RegExp(`^${stock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: · 光谱)?$`),
    exact: true,
  });

  for (let attempt = 1; ; attempt += 1) {
    await expect(trigger).toBeEnabled();
    await trigger.click();
    try {
      await option.click({ timeout: 15_000 });
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }

  await expect(listbox).toHaveCount(0);
}
