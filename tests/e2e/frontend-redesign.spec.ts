import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const fixture = path.resolve(process.cwd(), 'public/film-overlays/aperture-mask-derived.png');
const curationFixtures = [
  fixture,
  path.resolve(process.cwd(), 'public/film-overlays/aperture-shadow-derived.png'),
  path.resolve(process.cwd(), 'public/film-overlays/film-base.png'),
];
const curationNames = curationFixtures.map(filePath => path.basename(filePath));

async function uploadCurationFixtures(page: Page, count = curationFixtures.length) {
  await page.locator('input[type="file"]').setInputFiles(curationFixtures.slice(0, count));
}

function curationCheckbox(page: Page, action: '取消入选' | '入选', fileName: string) {
  return page.getByRole('checkbox', { name: `${action} ${fileName}` });
}

function photoCard(page: Page, fileName: string) {
  return page.getByRole('img', { name: fileName }).locator('xpath=ancestor::article');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('desktop empty darkroom exposes the new shell and inspector', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await expect(page.getByRole('heading', { name: '接触印象' })).toBeVisible();
  await expect(page.getByLabel('新胶卷，本地处理')).toBeVisible();
  await expect(page.getByRole('heading', { name: '把这一卷带进暗房' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '暗房配方' })).toBeVisible();
});

test('mobile settings sheet traps the settings flow and closes with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.locator('header').getByRole('button', { name: '打开暗房配方' });

  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '暗房配方' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('tab', { name: '输出' }).click();
  await expect(sheet.getByRole('group', { name: '输出格式' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('mobile Sheet retains all secondary actions and closes after a privacy notice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.locator('header').getByRole('button', { name: '打开暗房配方' });

  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '暗房配方' });
  const more = sheet.getByRole('button', { name: '更多操作' });
  await more.click();
  await expect(sheet.getByRole('menuitem', { name: '恢复默认设置' })).toBeVisible();
  await expect(sheet.getByRole('menuitem', { name: '支持 FilmFrame' })).toBeVisible();
  await expect(sheet.getByRole('menuitem', { name: '本地处理与隐私' })).toBeVisible();

  await sheet.getByRole('menuitem', { name: '本地处理与隐私' }).click();
  await expect(page.getByText('照片只在当前设备处理，不会上传；刷新或关闭页面后不会保留。')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('mobile action-bar settings trigger restores focus after closing the Sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole('navigation', { name: '移动端主要操作' }).getByRole('button', { name: '打开暗房配方' });

  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '暗房配方' });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('tablet settings drawer restores focus to its Header trigger', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1024 });
  const trigger = page.getByRole('button', { name: '配方' });

  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '暗房配方' });
  await expect(sheet).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('upload, develop, preview and film strip remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('input[type="file"]').setInputFiles(fixture);

  await expect(page.getByRole('list', { name: /接触印象，共 1 张照片/ })).toBeVisible();
  await expect(page.getByText('待冲洗', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /查看 aperture-mask-derived\.png/ }).click();
  const preview = page.getByRole('dialog', { name: /aperture-mask-derived\.png/ });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('button', { name: '原图' })).toBeVisible();
  await expect(preview.getByRole('button', { name: '成片', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: /连底长条/ }).click();
  await expect(page.getByRole('heading', { name: '长条审片台' })).toBeVisible();
  await expect(page.getByLabel('长条审片台').getByRole('button', { name: '生成胶片长条' })).toBeVisible();
});

test('Kodak Portra 160 supports real 135 single and template strip rendering', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await inspector.getByLabel('胶片型号').selectOption('KODAK PORTRA 160');

  await expect(inspector.getByRole('button', { name: '真实 135' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('tab', { name: /连底长条/ }).click();
  const stripStage = page.getByLabel('长条审片台');
  await stripStage.getByRole('button', { name: '生成胶片长条' }).click();
  await expect(stripStage.getByRole('img', { name: '已生成的胶片长条' })).toBeVisible({ timeout: 30_000 });
});

for (const [name, stock] of [
  ['Kodak Portra 400', 'KODAK PORTRA 400'],
  ['Kodak Ektar 100', 'KODAK EKTAR 100'],
  ['Kodak Portra 800', 'KODAK PORTRA 800'],
] as const) {
  test(`${name} supports real 135 single and template strip rendering`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const inspector = page.getByRole('complementary', { name: '暗房配方' });
    await inspector.getByLabel('胶片型号').selectOption(stock);

    await expect(inspector.getByRole('button', { name: '真实 135' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('input[type="file"]').setInputFiles(fixture);
    await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
    await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('tab', { name: /连底长条/ }).click();
    const stripStage = page.getByLabel('长条审片台');
    await stripStage.getByRole('button', { name: '生成胶片长条' }).click();
    await expect(stripStage.getByRole('img', { name: '已生成的胶片长条' })).toBeVisible({ timeout: 30_000 });
  });
}

test('crop editor returns focus to its trigger after Escape and cancel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /查看 aperture-mask-derived\.png/ }).click();
  const cropTrigger = page.getByRole('button', { name: '调整构图' });
  await cropTrigger.click();
  const cropStage = page.locator('[data-crop-stage]');
  const cropViewport = page.locator('[data-crop-viewport]');
  const cropImage = cropViewport.locator('img');
  await expect(cropViewport).toBeVisible();

  await expect.poll(async () => (await cropStage.boundingBox())?.height ?? 0).toBeGreaterThan(300);
  await expect.poll(async () => (await cropViewport.boundingBox())?.height ?? 0).toBeGreaterThan(240);
  const expectSourceAspect = async () => {
    const ratio = await cropImage.evaluate(node => {
      const image = node as HTMLImageElement;
      const box = image.getBoundingClientRect();
      return {
        natural: image.naturalWidth / image.naturalHeight,
        rendered: box.width / box.height,
        maxWidth: getComputedStyle(image).maxWidth,
      };
    });
    expect(ratio.maxWidth).toBe('none');
    expect(ratio.rendered).toBeCloseTo(ratio.natural, 4);
  };
  await expectSourceAspect();

  const zoom = page.getByRole('slider', { name: '等比放大' });
  await zoom.press('End');
  await expect(page.getByText('300%', { exact: true })).toBeVisible();
  await expectSourceAspect();
  const styleBeforeDrag = await cropImage.getAttribute('style');
  const viewportBox = await cropViewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  await page.mouse.move(viewportBox!.x + viewportBox!.width / 2, viewportBox!.y + viewportBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewportBox!.x + viewportBox!.width / 2 + 48, viewportBox!.y + viewportBox!.height / 2 + 48, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => cropImage.getAttribute('style')).not.toBe(styleBeforeDrag);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await cropStage.boundingBox())?.height ?? 0).toBeGreaterThan(180);
  await expect.poll(async () => (await cropViewport.boundingBox())?.width ?? 0).toBeGreaterThan(200);
  await expect.poll(async () => (await cropViewport.boundingBox())?.width ?? Infinity).toBeLessThanOrEqual(366);
  await expect.poll(async () => {
    const [viewport, controls] = await Promise.all([
      cropViewport.boundingBox(),
      page.locator('[data-crop-controls]').boundingBox(),
    ]);
    return viewport && controls ? controls.y - (viewport.y + viewport.height) : -Infinity;
  }).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => window.innerWidth));
  await expect(page.getByRole('button', { name: '取消' })).toHaveCSS('min-height', '44px');
  await expect(page.getByRole('button', { name: '完成' })).toHaveCSS('min-height', '44px');
  await page.keyboard.press('Escape');
  await expect(cropTrigger).toBeFocused();

  await cropTrigger.click();
  await expect(cropViewport).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(cropTrigger).toBeFocused();

  await cropTrigger.click();
  await expect(cropViewport).toBeVisible();
  const styleBeforeKeyboardMove = await cropImage.getAttribute('style');
  await cropViewport.press('ArrowDown');
  await expect.poll(() => cropImage.getAttribute('style')).not.toBe(styleBeforeKeyboardMove);
  await page.getByRole('button', { name: '完成' }).click();
  await expect(cropViewport).toBeHidden();
  await expect(cropTrigger).toBeFocused();
});

test('support dialog replaces a broken QR image with a fallback', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '支持 FilmFrame' }).click();

  const dialog = page.getByRole('dialog', { name: '支持 FilmFrame' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('二维码暂不可用，请在资源替换后重试。')).toBeVisible();
  await expect(dialog.locator('img')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭支持窗口' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '关闭支持窗口' })).toBeFocused();
});

test('support opened from mobile settings replaces the Sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('header').getByRole('button', { name: '打开暗房配方' }).click();
  const sheet = page.getByRole('dialog', { name: '暗房配方' });

  await sheet.getByRole('button', { name: '更多操作' }).click();
  await sheet.getByRole('menuitem', { name: '支持 FilmFrame' }).click();
  const support = page.getByRole('dialog', { name: '支持 FilmFrame' });
  await expect(support).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
});

test('desktop More menu supports arrow navigation and notices stay below the Header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const more = page.locator('header').getByRole('button', { name: '更多操作' });

  await more.click();
  await expect(page.getByRole('menuitem', { name: '恢复默认设置' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'GitHub' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: '本地处理与隐私' })).toBeFocused();
  await page.keyboard.press('Enter');

  const notice = page.getByText('照片只在当前设备处理，不会上传；刷新或关闭页面后不会保留。');
  await expect(notice).toBeVisible();
  const [noticeBox, addBox] = await Promise.all([
    notice.boundingBox(),
    page.getByRole('banner').getByRole('button', { name: '添加照片' }).boundingBox(),
  ]);
  expect(noticeBox).not.toBeNull();
  expect(addBox).not.toBeNull();
  expect(noticeBox!.y).toBeGreaterThanOrEqual(addBox!.y + addBox!.height);
});

test('batch curation keeps card, strip, summary, and zero-selection recovery in sync', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await uploadCurationFixtures(page);

  const [firstName, secondName, thirdName] = curationNames;
  const selectionScope = page.getByRole('group', { name: '选片范围' });
  const summary = page.getByText('入选 3 / 3', { exact: true });

  await expect(summary).toBeVisible();
  await expect(curationCheckbox(page, '取消入选', secondName)).toBeChecked();

  await curationCheckbox(page, '取消入选', secondName).uncheck();
  await expect(page.getByText('入选 2 / 3', { exact: true })).toBeVisible();
  await expect(curationCheckbox(page, '入选', secondName)).not.toBeChecked();

  await page.getByRole('tab', { name: /连底长条 · 2 张入选/ }).click();
  const sequence = page.getByLabel('胶片长条照片顺序');
  await expect(sequence.getByRole('checkbox', { name: `入选 ${secondName}` })).not.toBeChecked();

  await sequence.getByRole('checkbox', { name: `入选 ${secondName}` }).check();
  await expect(page.getByText('入选 3 / 3', { exact: true })).toBeVisible();
  await expect(sequence.getByRole('checkbox', { name: `取消入选 ${secondName}` })).toBeChecked();

  await selectionScope.getByRole('button', { name: '清空入选' }).click();
  await expect(page.getByText('入选 0 / 3', { exact: true })).toBeVisible();
  const zeroSelectionMessage = page.getByRole('status').filter({ hasText: '请先选择至少一张照片' });
  await expect(zeroSelectionMessage).toHaveAttribute('role', 'status');
  await expect(page.getByLabel('长条审片台').getByRole('button', { name: '请先选择至少一张照片' })).toBeDisabled();

  await selectionScope.getByRole('button', { name: '全部入选' }).click();
  await expect(page.getByText('入选 3 / 3', { exact: true })).toBeVisible();
  await expect(sequence.getByRole('checkbox', { name: `取消入选 ${firstName}` })).toBeChecked();
  await expect(sequence.getByRole('checkbox', { name: `取消入选 ${thirdName}` })).toBeChecked();
});

test('batch processing skips excluded cards without renumbering or discarding current artifacts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await uploadCurationFixtures(page);

  const [firstName, secondName, thirdName] = curationNames;
  const firstCard = photoCard(page, firstName);
  const excludedCard = photoCard(page, secondName);
  const thirdCard = photoCard(page, thirdName);

  await curationCheckbox(page, '取消入选', secondName).uncheck();
  await expect(thirdCard.getByText('FRAME 03 / 03', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '冲洗待更新照片 (2)' }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(2, { timeout: 30_000 });
  await expect(excludedCard.getByText('待冲洗', { exact: true })).toBeVisible();
  await expect(thirdCard.getByText('FRAME 03 / 03', { exact: true })).toBeVisible();
  await expect(curationCheckbox(page, '入选', secondName)).not.toBeChecked();

  await curationCheckbox(page, '取消入选', firstName).uncheck();
  await expect(firstCard.getByRole('img', { name: '已出片' })).toBeVisible();
});

test('processing locks batch order and rejects dropped files until the snapshot completes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/film-overlays/film-base.png', async route => {
    await new Promise(resolve => setTimeout(resolve, 1_000));
    await route.continue();
  });
  await uploadCurationFixtures(page);

  const [firstName] = curationNames;
  await page.getByRole('button', { name: '冲洗待更新照片 (3)' }).click();
  await expect(page.getByRole('button', { name: `下移 ${firstName}` })).toBeDisabled();

  const dataTransfer = await page.evaluateHandle(async () => {
    const blob = await fetch('/film-overlays/aperture-mask-derived.png').then(response => response.blob());
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'busy-add.png', { type: 'image/png' }));
    return transfer;
  });
  await page.locator('#workspace').dispatchEvent('drop', { dataTransfer });
  await page.waitForTimeout(250);

  await expect(page.getByText('入选 3 / 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  await page.getByRole('button', { name: '停止后续' }).click();
});

test('changing the included subset marks a generated film strip stale', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await uploadCurationFixtures(page, 2);

  const [, secondName] = curationNames;
  await page.getByRole('tab', { name: /连底长条 · 2 张入选/ }).click();
  const stripStage = page.getByLabel('长条审片台');

  await stripStage.getByRole('button', { name: '生成胶片长条' }).click();
  await expect(stripStage.getByRole('img', { name: '已生成的胶片长条' })).toBeVisible({ timeout: 30_000 });

  await page.getByLabel('胶片长条照片顺序')
    .getByRole('checkbox', { name: `取消入选 ${secondName}` })
    .uncheck();
  await expect(page.getByText('需重新生成', { exact: true })).toBeVisible();
  await expect(stripStage.getByRole('img', { name: '需要重新生成的胶片长条' })).toBeVisible();
});

test('mobile batch curation remains operable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await uploadCurationFixtures(page);

  const [firstName] = curationNames;
  const firstCheckbox = curationCheckbox(page, '取消入选', firstName);
  await expect(page.getByText('入选 3 / 3', { exact: true })).toBeVisible();
  await expect(firstCheckbox.locator('xpath=..')).toHaveCSS('min-height', '44px');

  await firstCheckbox.uncheck();
  await expect(page.getByText('入选 2 / 3', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => window.innerWidth),
  );
});
