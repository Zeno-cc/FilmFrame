import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { selectFilmStock } from './stockPicker';
import { getRecipeInspector, openRecipeAdvancedSettings, selectRecipeControl } from './recipeControls';

const fixture = path.resolve(process.cwd(), 'public/film-overlays/film-base.png');

async function uploadAndOpen(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type=file]').setInputFiles(fixture);
  return getRecipeInspector(page);
}

test('spectral stocks expose only the edge implementation choice', async ({ page }) => {
  const inspector = await uploadAndOpen(page);
  await selectFilmStock(inspector, 'KODAK GOLD 200');

  await expect(inspector.getByRole('group', { name: '画幅样式' })).toHaveCount(0);
  const edgeMode = inspector.getByLabel('片边方式');
  await expect(edgeMode).toBeVisible();
  await expect(edgeMode.locator('option')).toHaveText(['模板片边', '物理片边']);
  await expect(inspector.getByText('模板整幅套用，物理按片门与齿孔生成', { exact: true })).toBeVisible();

  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await openRecipeAdvancedSettings(page, '高级渲染设置');
  await expect(inspector.getByLabel('齿孔背光')).toHaveCount(0);

  await selectRecipeControl(page, '片边方式', 'physical135');
  await expect(inspector.getByLabel('齿孔背光')).toBeVisible();

  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await expect(inspector.getByLabel('齿孔背光')).toHaveCount(0);
});

test('non-spectral stocks keep classic framing and hide 135 edge controls', async ({ page }) => {
  const inspector = await uploadAndOpen(page);
  await selectFilmStock(inspector, 'KODAK COLORPLUS 200');

  await expect(inspector.getByRole('group', { name: '画幅样式' })).toBeVisible();
  await expect(inspector.getByRole('button', { name: '135 画幅', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');

  await selectRecipeControl(page, '片边方式', 'physical135');
  await openRecipeAdvancedSettings(page, '高级渲染设置');
  await expect(inspector.getByLabel('齿孔背光')).toBeVisible();

  await inspector.getByRole('button', { name: '经典边框', exact: true }).click();
  await expect(inspector.getByLabel('片边方式')).toHaveCount(0);
  await expect(inspector.getByLabel('齿孔背光')).toHaveCount(0);
  await expect(inspector.getByText('片边文字', { exact: true })).toBeVisible();

  await inspector.getByRole('button', { name: '135 画幅', exact: true }).click();
  await expect(inspector.getByLabel('片边方式')).toBeVisible();
  await expect(inspector.getByLabel('齿孔背光')).toHaveCount(0);
});

test('stocks without physical edge layouts expose template edge only', async ({ page }) => {
  const inspector = await uploadAndOpen(page);
  await selectFilmStock(inspector, 'FUJI VELVIA 100');
  const edgeMode = inspector.getByLabel('片边方式');
  await expect(edgeMode).toHaveValue('legacy-template');
  expect(await edgeMode.locator('option[value="physical135"]').evaluate(option => (option as HTMLOptionElement).disabled)).toBe(true);
  await expect(inspector.getByText('此型号暂无物理片边，使用模板片边。')).toBeVisible();
});

test('legacy spectral classic preferences migrate once on load', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('filmFrame.preferences.v1', JSON.stringify({
      settings: {
        brandText: 'KODAK PORTRA 400',
        frameRenderMode: 'classic',
        edgeRenderMode: 'physical135',
        imagingMode: 'spectral',
        outputFormat: 'image/png',
      },
      outputMode: 'single',
    }));
  });
  await page.reload();

  await expect(page.getByText('经典片边已停用，已切换为模板片边。')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('filmFrame.preferences.v1') ?? '{}');
    return [
      prefs.settings?.frameRenderMode,
      prefs.settings?.edgeRenderMode,
      prefs.settings?.imagingMode,
    ];
  })).toEqual(['real135', 'legacy-template', 'legacy']);

  await page.reload();
  await expect(page.getByText('经典片边已停用，已切换为模板片边。')).toHaveCount(0);
});

test('legacy non-spectral classic preferences stay classic', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('filmFrame.preferences.v1', JSON.stringify({
      settings: {
        brandText: 'KODAK COLORPLUS 200',
        frameRenderMode: 'classic',
        edgeRenderMode: 'legacy-template',
        imagingMode: 'legacy',
        outputFormat: 'image/png',
      },
      outputMode: 'single',
    }));
  });
  await page.reload();

  await expect(page.getByText('经典片边已停用，已切换为模板片边。')).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles(fixture);
  const inspector = getRecipeInspector(page);
  await expect(inspector.getByRole('button', { name: '经典边框', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(inspector.getByLabel('片边方式')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('filmFrame.preferences.v1') ?? '{}');
    return prefs.settings?.frameRenderMode;
  })).toBe('classic');
});

test('legacy spectral classic recipes migrate only when applied', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('filmFrame.recipes.v1', JSON.stringify([{
      id: 'legacy-classic-portra',
      name: '旧经典配方',
      updatedAt: 1,
      settings: {
        brandText: 'KODAK PORTRA 400',
        frameRenderMode: 'classic',
        edgeRenderMode: 'physical135',
        imagingMode: 'spectral',
      },
    }]));
  });
  await page.reload();
  await page.locator('input[type=file]').setInputFiles(fixture);
  const inspector = getRecipeInspector(page);

  await inspector.getByLabel('选择本地配方').selectOption('legacy-classic-portra');
  await expect(page.getByText(/已应用配方“旧经典配方”。经典片边已停用，已切换为模板片边/)).toBeVisible();
  await expect(inspector.getByLabel('片边方式')).toHaveValue('legacy-template');
  await expect(inspector.getByLabel('成像方式')).toHaveValue('legacy');

  const savedRecipe = await page.evaluate(() => {
    const recipes = JSON.parse(localStorage.getItem('filmFrame.recipes.v1') ?? '[]');
    return recipes[0]?.settings?.frameRenderMode;
  });
  expect(savedRecipe).toBe('classic');
});

test('summary card and mobile settings use the new labels without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type=file]').setInputFiles(fixture);
  const inspector = getRecipeInspector(page);
  const summary = inspector.getByRole('region', { name: '当前配方' });

  await expect(summary.getByText('物理片边', { exact: true })).toBeVisible();
  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await expect(summary.getByText('模板片边', { exact: true })).toBeVisible();

  await selectFilmStock(inspector, 'KODAK COLORPLUS 200');
  await inspector.getByRole('button', { name: '经典边框', exact: true }).click();
  await expect(summary.getByText('经典边框', { exact: true })).toBeVisible();
  await expect(summary.getByText('光谱模拟', { exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('header').getByRole('button', { name: '打开调整' }).click();
  const sheet = page.getByRole('dialog', { name: '调整' });
  await sheet.getByRole('tab', { name: '片边' }).click();
  await expect(sheet.getByRole('group', { name: '画幅样式' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '经典边框', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByLabel('片边方式')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await sheet.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  await sheet.getByRole('tab', { name: '胶片' }).click();
  await selectFilmStock(sheet, 'KODAK GOLD 200');
  await sheet.getByRole('tab', { name: '片边' }).click();
  await expect(sheet.getByRole('group', { name: '画幅样式' })).toHaveCount(0);
  await expect(sheet.getByLabel('片边方式')).toHaveValue('legacy-template');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await sheet.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});
