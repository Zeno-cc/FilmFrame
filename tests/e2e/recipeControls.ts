import { expect, type Page } from '@playwright/test';

export function getRecipeInspector(page: Page) {
  return page.getByRole('complementary', { name: '调整', exact: true });
}

export async function openRecipeAdvancedSettings(page: Page, title: '高级色彩设置' | '高级渲染设置' | '高级输出设置') {
  const inspector = getRecipeInspector(page);
  const trigger = inspector.getByRole('button', { name: title, exact: true });
  await expect(trigger).toBeVisible();
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
}

export async function selectRecipeControl(page: Page, label: '成像方式' | '光谱计算' | '片边方式', value: string) {
  if (label === '光谱计算') await openRecipeAdvancedSettings(page, '高级色彩设置');
  await getRecipeInspector(page).getByLabel(label, { exact: true }).selectOption(value);
}
