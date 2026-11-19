import { expect, test } from '@playwright/test';
import { selectRecipeControl } from './recipeControls';

test('film picker marks spectral stocks before selection without opting in', async ({ page }) => {
  await page.goto('/');
  const inspector = page.getByRole('complementary', { name: '调整' });
  await expect(inspector.getByLabel('成像方式')).toHaveCount(0);
  const trigger = inspector.getByRole('button', { name: '胶片型号', exact: true });
  await trigger.click();
  const listbox = inspector.getByRole('listbox', { name: '胶片型号' });
  await expect(listbox.getByRole('option')).toHaveCount(29);
  await expect(listbox.getByRole('option', { name: / · 光谱$/ })).toHaveCount(24);
  const options = await listbox.getByRole('option').allTextContents();
  expect(options.slice(0, 24).every(name => name.includes('光谱'))).toBe(true);
  expect(options.slice(24).every(name => !name.includes('光谱'))).toBe(true);
  await expect(listbox).toContainText('光谱支持 · 24');
  await expect(listbox).toContainText('经典色彩 · 5');
  await expect(listbox.getByRole('option', { name: 'KODAK COLORPLUS 200', exact: true })).toBeVisible();
  await expect(listbox.getByRole('option', { name: 'CINESTILL 800T · 光谱', exact: true })).toBeVisible();
  await listbox.getByRole('option', { name: 'KODAK PORTRA 160 · 光谱', exact: true }).click();
  await expect(trigger).toContainText('KODAK PORTRA 160');
  await expect(trigger).toBeFocused();
});

test('film picker supports keyboard navigation typeahead and focus restoration', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const inspector = page.getByRole('complementary', { name: '调整' });
  await expect(inspector.getByLabel('成像方式')).toHaveCount(0);
  const trigger = inspector.getByRole('button', { name: '胶片型号', exact: true });
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const listbox = inspector.getByRole('listbox', { name: '胶片型号' });
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('option', { name: 'GC 400 KODAK · 光谱', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(listbox.getByRole('option', { name: 'FUJI SUPERIA 400', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(listbox.getByRole('option', { name: 'KODAK PORTRA 160 · 光谱', exact: true })).toBeFocused();
  await page.keyboard.type('FUJI PRO');
  await expect(listbox.getByRole('option', { name: 'FUJI PRO 400H · 光谱', exact: true })).toBeFocused();
  await page.waitForTimeout(750);
  await page.keyboard.press('Space');
  await expect(listbox).toHaveCount(0);
  await expect(trigger).toContainText('FUJI PRO 400H');
  await expect(inspector.getByLabel('成像方式')).toHaveCount(0);
  await trigger.click();
  await listbox.getByRole('option', { name: 'FUJI SUPERIA 400', exact: true }).click();
  await expect(inspector.getByLabel('成像方式')).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: '了解光谱负片' })).toHaveCount(0);
  await trigger.click();
  await page.keyboard.type('FUJI PRO');
  await expect(inspector.getByRole('option', { name: 'FUJI PRO 400H · 光谱', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(trigger).toContainText('FUJI PRO 400H');
  await expect(inspector.getByLabel('成像方式')).toHaveCount(0);
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(listbox).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('Tab');
  await expect(inspector.getByRole('listbox')).toHaveCount(0);
  await trigger.click();
  await page.keyboard.press('F');
  await page.keyboard.press('Escape');
  await trigger.click();
  await page.keyboard.type('FUJI PRO');
  await expect(inspector.getByRole('option', { name: 'FUJI PRO 400H · 光谱', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
});

test('spectral info card is deliberate dismissible and does not change settings', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('public/film-overlays/film-base.png');
  const inspector = page.getByRole('complementary', { name: '调整' });
  await selectRecipeControl(page, '成像方式', 'legacy');
  await inspector.getByRole('button', { name: '了解光谱负片' }).click();
  const card = inspector.getByRole('region', { name: '光谱负片说明' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('81 个波长采样');
  await expect(card).toContainText('实验 · 本地处理');
  await expect(inspector.getByLabel('成像方式')).toHaveValue('legacy');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: '了解光谱负片' })).toBeFocused();
  await inspector.getByRole('button', { name: '了解光谱负片' }).click();
  await inspector.getByRole('button', { name: '关闭光谱说明' }).click();
  await expect(card).toHaveCount(0);
  await inspector.getByRole('button', { name: '了解光谱负片' }).click();
  await inspector.getByText('起始帧号', { exact: true }).click();
  await expect(card).toHaveCount(0);
});

test('mobile picker retains Sheet focus and avoids horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('input[type=file]').setInputFiles('public/film-overlays/film-base.png');
  await page.locator('header').getByRole('button', { name: '打开调整' }).click();
  const sheet = page.getByRole('dialog', { name: '调整' });
  const trigger = sheet.getByRole('button', { name: '胶片型号', exact: true });
  await trigger.click();
  const listbox = sheet.getByRole('listbox', { name: '胶片型号' });
  await expect(listbox).toBeVisible();
  const bounds = await listbox.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  expect(await listbox.getByRole('option').evaluateAll(options => options.every(option => option.getBoundingClientRect().height >= 44))).toBe(true);
  await expect(sheet.getByRole('button', { name: '了解光谱负片' })).toHaveJSProperty('clientHeight', 44);
  await page.keyboard.press('Escape');
  await expect(listbox).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  const pushOption = listbox.getByRole('option', { name: 'KODAK PORTRA 800 PUSH 1 · 光谱', exact: true });
  const pushLabel = pushOption.getByText('KODAK PORTRA 800 PUSH 1', { exact: true });
  await expect(pushLabel).toBeVisible();
  await expect.poll(() => pushLabel.evaluate(element => ({
    overflow: getComputedStyle(element).textOverflow,
    whiteSpace: getComputedStyle(element).whiteSpace,
    clipped: element.scrollWidth > element.clientWidth + 1,
  }))).toEqual({ overflow: 'clip', whiteSpace: 'normal', clipped: false });
  await pushOption.click();
  await expect(trigger).toContainText('KODAK PORTRA 800 PUSH 1');
  await expect.poll(() => trigger.locator('span.min-w-0').evaluate(element => ({
    clipped: element.scrollWidth > element.clientWidth + 1,
    text: element.textContent,
  }))).toEqual({ clipped: false, text: 'KODAK PORTRA 800 PUSH 1' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await sheet.getByRole('button', { name: '关闭调整' }).click();
  await expect(sheet).toHaveCount(0);
});
