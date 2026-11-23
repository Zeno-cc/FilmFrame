import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { selectFilmStock } from './stockPicker';
import { getRecipeInspector, openRecipeAdvancedSettings, selectRecipeControl } from './recipeControls';

const fixture = path.resolve(process.cwd(), 'public/film-overlays/aperture-mask-derived.png');
const curationFixtures = [
  fixture,
  path.resolve(process.cwd(), 'public/film-overlays/aperture-shadow-derived.png'),
  path.resolve(process.cwd(), 'public/film-overlays/film-base.png'),
];
const curationNames = curationFixtures.map(filePath => path.basename(filePath));

type UploadLifecycleWindow = Window & {
  __createdUploadUrls?: string[];
  __revokedUploadUrls?: string[];
  __delayedImageDecodes?: Array<{ url: string; release: () => void }>;
  __delayNextImageDecode?: boolean;
};

async function uploadCurationFixtures(page: Page, count = curationFixtures.length) {
  await page.locator('input[type="file"]').setInputFiles(curationFixtures.slice(0, count));
}

function curationCheckbox(page: Page, action: '取消入选' | '入选', fileName: string) {
  return page.getByRole('checkbox', { name: `${action} ${fileName}` });
}

function photoCard(page: Page, fileName: string) {
  return page.getByRole('img', { name: fileName }).locator('xpath=ancestor::article');
}

async function countZipEntries(download: Download): Promise<number> {
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('Downloaded ZIP path is unavailable');
  const bytes = await readFile(downloadPath);
  let count = 0;
  for (let offset = 0; offset <= bytes.length - 4; offset++) {
    if (bytes.readUInt32LE(offset) === 0x02014b50) count += 1;
  }
  return count;
}

const desktopEmptyDarkroomTest = 'desktop empty darkroom exposes one clear import action and a complete film frame';

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title === desktopEmptyDarkroomTest) {
    await page.route('https://commons.wikimedia.org/w/api.php?**', route => route.abort('failed'));
  }
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await uploadCurationFixtures(page, 1);
  await selectRecipeControl(page, '成像方式', 'legacy');
  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await page.getByRole('button', { name: '删除全部照片' }).click();
  await page.getByRole('dialog', { name: '删除全部照片？' })
    .getByRole('button', { name: '删除 1 张照片' }).click();
  await page.getByRole('heading', { name: '让这一卷，慢慢显影' }).waitFor();
});

test(desktopEmptyDarkroomTest, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await expect(page.getByRole('heading', { name: '让这一卷，慢慢显影' })).toBeVisible();
  await expect(page.getByLabel('新胶卷，本地处理')).toBeVisible();
  await expect(getRecipeInspector(page)).toBeVisible();
  await expect(page.locator('.ff-empty-darkroom').getByRole('button', { name: '选择照片', exact: true })).toHaveCount(1);
  await expect(page.locator('header').getByRole('button', { name: '添加照片' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '移动端主要操作' })).toHaveCount(0);
  await expect(page.getByText('照片示意 · 非胶片渲染结果', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '高级渲染设置' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '先添加图片' })).toHaveCount(0);

  const quote = page.getByTestId('photography-quote');
  await expect(quote.locator('blockquote')).not.toBeEmpty();
  await expect(quote.locator('cite')).not.toBeEmpty();
  await expect(quote).toHaveAttribute('aria-live', 'off');
  await expect(page.getByRole('button', { name: '换一句摄影名言' })).toHaveCount(0);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name))).not.toContainEqual(
    expect.stringContaining('wikiquote.org'),
  );

  const track = page.getByTestId('empty-darkroom-film-track');
  await expect(track).toBeVisible();
  // The strip scrolls through the Web Animations API, so there is no CSS
  // transition or keyframe animation carrying the motion.
  expect(await track.evaluate(element => element.getAnimations().length)).toBeGreaterThan(0);
  await expect(track).toHaveCSS('animation-name', 'none');
  // Twelve reviewed photographs plus the duplicated set that makes the loop seamless.
  await expect(page.getByTestId('empty-darkroom-exposure-frame')).toHaveCount(24);
  await expect(page.getByRole('group', { name: '经典纪实摄影示意' })).toBeVisible();
  expect(new Set(await page.locator('.ff-empty-darkroom__photo').evaluateAll(images => images.map(image => image.getAttribute('src')))).size).toBeGreaterThan(1);

  const frameGeometry = await page.getByTestId('empty-darkroom-exposure-frame').first().evaluate(element => {
    const frame = element.getBoundingClientRect();
    const trackElement = element.parentElement?.parentElement;
    if (!trackElement) throw new Error('Decorative 135 film track is missing');
    const track = trackElement.getBoundingClientRect();
    return {
      ratio: frame.width / frame.height,
      topClearance: frame.top - track.top,
      bottomClearance: track.bottom - frame.bottom,
    };
  });
  expect(frameGeometry.ratio).toBeCloseTo(1.5, 3);
  expect(frameGeometry.topClearance).toBe(frameGeometry.bottomClearance);
  const rails = await page.getByTestId('empty-darkroom-film-rail').evaluateAll(elements => elements.map(element => ({
    height: element.getBoundingClientRect().height,
    holeBackground: getComputedStyle(element, '::before').backgroundImage,
  })));
  expect(rails).toHaveLength(2);
  expect(rails[0].height).toBe(rails[1].height);
  expect(rails[0].holeBackground).toContain('repeating-linear-gradient');
  const exposureReveal = page.locator('.ff-empty-darkroom__exposure-content').first();
  await expect(exposureReveal).toHaveCSS('animation-name', 'none');
  const demo = await page.locator('.ff-empty-darkroom__photo').first().evaluate((image: HTMLImageElement) => ({
    loaded: image.complete && image.naturalWidth > 0,
    ratio: image.parentElement!.getBoundingClientRect().width / image.parentElement!.getBoundingClientRect().height,
  }));
  expect(demo.loaded).toBe(true);
  expect(demo.ratio).toBeCloseTo(1.5, 3);
  const separatedRegions = await page.evaluate(() => {
    const intro = document.querySelector('.ff-empty-darkroom__intro')!.getBoundingClientRect();
    const film = document.querySelector('.ff-empty-darkroom__film')!.getBoundingClientRect();
    return intro.right <= film.left || film.right <= intro.left || intro.bottom <= film.top || film.bottom <= intro.top;
  });
  expect(separatedRegions).toBe(true);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('header').click({ position: { x: 4, y: 4 } });
  await page.mouse.move(0, 0);
  const emptyDarkroom = page.locator('.ff-empty-darkroom');
  const initialX = await track.evaluate(element => element.getBoundingClientRect().x);
  await page.waitForTimeout(13_000);
  const advancedX = await track.evaluate(element => element.getBoundingClientRect().x);
  expect(advancedX).toBeLessThan(initialX);
  await emptyDarkroom.hover();
  // Pausing is a Web Animation pause, not a CSS transition running back.
  await expect(emptyDarkroom).toHaveAttribute('data-gallery-paused', 'true');
  await expect(track).toHaveCSS('transition-duration', '0s');
  await page.mouse.move(0, 0);
  await emptyDarkroom.getByRole('button', { name: '选择照片' }).filter({ visible: true }).focus();
  await expect(emptyDarkroom).toHaveAttribute('data-gallery-paused', 'true');
  await expect(track).toHaveCSS('transition-duration', '0s');

  await page.setViewportSize({ width: 1180, height: 900 });
  await expect(page.locator('.ff-empty-darkroom__demo-frame').first()).toBeVisible();
  await expect(emptyDarkroom.getByRole('button', { name: '选择照片', exact: true })).toHaveCount(1);
  await expect(page.locator('.ff-empty-darkroom__privacy')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1180);
});

test('empty darkroom film respects reduced motion, drag state, and mobile bounds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.reload();

  const workspace = page.locator('.ff-workspace');
  const track = page.getByTestId('empty-darkroom-film-track');
  const film = page.locator('.ff-empty-darkroom__film');
  await expect(track).toHaveCSS('animation-name', 'none');
  await expect(track).toHaveCSS('will-change', 'auto');
  await expect(page.locator('.ff-empty-darkroom__exposure-content').first()).toHaveCSS('animation-name', 'none');
  const importButton = page.locator('.ff-empty-darkroom').getByRole('button', { name: '选择照片' }).filter({ visible: true });
  await expect(importButton).toHaveCount(1);
  const buttonBounds = await importButton.boundingBox();
  const frameBounds = await page.locator('.ff-empty-darkroom__demo-frame').first().boundingBox();
  const privacyBounds = await page.locator('.ff-empty-darkroom__privacy').filter({ visible: true }).boundingBox();
  if (!buttonBounds || !frameBounds || !privacyBounds) throw new Error('Mobile empty darkroom composition is missing');
  expect(frameBounds.width / frameBounds.height).toBeCloseTo(1.5, 3);
  expect(buttonBounds.y).toBeGreaterThan(frameBounds.y + frameBounds.height);
  expect(privacyBounds.y + privacyBounds.height).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => window.innerWidth),
  );
  await expect(page.getByRole('navigation', { name: '移动端主要操作' })).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['film'], 'film.png', { type: 'image/png' }));
    return transfer;
  });
  await workspace.dispatchEvent('dragenter', { dataTransfer });
  await expect(workspace).toHaveAttribute('data-drag-active', 'true');
  await expect(page.getByText('松开以加入这一卷', { exact: true })).toBeVisible();
  await expect(track).toHaveCSS('animation-play-state', 'paused');
  await expect(film).toHaveCSS('opacity', '0.18');

  await workspace.dispatchEvent('dragleave', { dataTransfer });
  await expect(workspace).toHaveAttribute('data-drag-active', 'false');
  await expect(page.getByText('松开以加入这一卷', { exact: true })).toBeHidden();
  await expect(track).toHaveCSS('animation-play-state', 'running');
});

test('photography quote updates locally at the next 24-hour boundary', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-21T12:00:00Z') });
  await page.reload();

  const quote = page.getByTestId('photography-quote');
  const initialQuoteId = await quote.getAttribute('data-quote-id');
  await page.clock.fastForward(11 * 60 * 60 * 1_000 + 59 * 60 * 1_000);
  await expect(quote).toHaveAttribute('data-quote-id', initialQuoteId ?? '');

  await page.clock.fastForward(60 * 1_000);
  await expect(quote).not.toHaveAttribute('data-quote-id', initialQuoteId ?? '');
  await expect(page.getByRole('button', { name: '换一句摄影名言' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /暂停名言轮播|继续名言轮播/ })).toHaveCount(0);
});

test('settings keep the starting frame visible and named recipes retain their stock', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await uploadCurationFixtures(page, 1);
  const inspector = getRecipeInspector(page);
  const startingFrame = inspector.getByRole('spinbutton', { name: '起始帧号' });
  await expect(startingFrame).toBeVisible();
  await expect(inspector.getByLabel('帧号颜色')).toHaveCount(0);

  const advancedTrigger = inspector.getByRole('button', { name: '高级渲染设置' });
  await advancedTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(advancedTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(inspector.getByLabel('帧号颜色')).toBeVisible();
  const contentId = await advancedTrigger.getAttribute('aria-controls');
  await expect(inspector.locator(`#${contentId}`)).toBeVisible();

  await inspector.getByRole('textbox', { name: '配方名称' }).fill('我的测试配方');
  await inspector.getByRole('button', { name: '保存', exact: true }).click();
  await inspector.getByRole('combobox', { name: '选择本地配方' }).selectOption({ label: '我的测试配方' });
  const summary = inspector.getByRole('region', { name: '当前配方' });
  await expect(summary).toContainText('我的测试配方');
  await expect(summary).toContainText('KODAK GOLD 200');
});

test('mobile settings sheet traps the settings flow and closes with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await uploadCurationFixtures(page, 1);
  const trigger = page.locator('header').getByRole('button', { name: '打开调整' });

  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '调整' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('tab', { name: '输出' }).click();
  await expect(sheet.getByRole('group', { name: '输出格式' })).toBeVisible();
  await sheet.getByRole('tab', { name: '片边' }).click();
  await sheet.getByRole('button', { name: '高级渲染设置' }).click();
  await expect(sheet.getByLabel('帧号颜色')).toBeVisible();
  await expect(sheet.getByLabel('齿孔颜色')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('mobile Sheet retains all secondary actions and closes after a privacy notice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await uploadCurationFixtures(page, 1);
  const trigger = page.locator('header').getByRole('button', { name: '打开调整' });

  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '调整' });
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
  await uploadCurationFixtures(page, 1);
  const trigger = page.getByRole('navigation', { name: '移动端主要操作' }).getByRole('button', { name: '打开调整' });

  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '调整' });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('tablet settings drawer traps Tab around visible controls and restores Header focus', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1024 });
  await uploadCurationFixtures(page, 1);
  const trigger = page.getByRole('button', { name: '调整' });

  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '调整' });
  await expect(sheet).toBeVisible();
  const close = sheet.getByRole('button', { name: '关闭调整' });
  const primaryAction = sheet.getByRole('button', { name: /冲洗待更新照片/ });
  await expect(close).toBeFocused();
  await expect(sheet.getByRole('button', { name: '更多操作' })).toBeHidden();

  await page.keyboard.press('Shift+Tab');
  await expect(primaryAction).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('upload, develop, preview and film strip remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const inspector = getRecipeInspector(page);
  await uploadCurationFixtures(page, 1);
  await selectRecipeControl(page, '成像方式', 'legacy');
  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await openRecipeAdvancedSettings(page, '高级渲染设置');
  const sprocketColor = inspector.getByRole('textbox', { name: '齿孔颜色', exact: true });
  await sprocketColor.evaluate((input, value) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, '#3366cc');

  await expect(page.getByTestId('empty-darkroom-film-track')).toHaveCount(0);
  await expect(page.getByRole('list', { name: /照片列表，共 1 张照片/ })).toBeVisible();
  await expect(page.getByTestId('workspace-summary')).toBeVisible();
  await expect(page.locator('.ff-contact-sheet')).toHaveAttribute('data-layout', 'focus');
  const focusGeometry = await page.locator('.ff-photo-card__mat').evaluate(element => {
    const mat = element.getBoundingClientRect();
    const workspace = document.querySelector('#workspace-panel-single')?.getBoundingClientRect();
    return { ratio: mat.width / mat.height, widthShare: workspace ? mat.width / workspace.width : 0 };
  });
  expect(focusGeometry.ratio).toBeCloseTo(1.5, 3);
  expect(focusGeometry.widthShare).toBeGreaterThan(0.8);
  await expect(page.locator('.ff-app-header').getByRole('button', { name: '检查出片进度 (0/1)' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '检查出片进度 (0/1)', exact: true })).toHaveCount(1);
  await expect(page.getByText('待冲洗', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  const developMat = page.locator('.ff-photo-card__mat').first();
  await expect(developMat).toHaveAttribute('data-develop', 'reveal', { timeout: 30_000 });
  const revealLayers = await developMat.evaluate(element => {
    const surface = element.querySelector<HTMLElement>('.ff-photo-card__reveal-surface');
    const print = element.querySelector<HTMLElement>('.ff-photo-card__print');
    const animation = print?.getAnimations()[0];
    if (animation) {
      animation.pause();
      animation.currentTime = 250;
    }
    const bed = element.querySelector<HTMLElement>('.ff-photo-card__print-bed');
    if (!surface || !bed) throw new Error('Develop reveal layers are missing');
    const matBounds = element.getBoundingClientRect();
    const surfaceBounds = surface.getBoundingClientRect();
    return {
      bedBackground: getComputedStyle(bed).backgroundColor,
      heightDelta: Math.abs(matBounds.height - surfaceBounds.height),
      surfaceAnimationDuration: getComputedStyle(surface).animationDuration,
      surfaceAnimation: getComputedStyle(surface).animationName,
      surfaceAnimationTiming: getComputedStyle(surface).animationTimingFunction,
      surfaceMask: getComputedStyle(surface).maskImage
        || getComputedStyle(surface).webkitMaskImage,
      widthDelta: Math.abs(matBounds.width - surfaceBounds.width),
    };
  });
  expect(revealLayers.surfaceAnimation).toBe('ff-contact-reveal');
  expect(revealLayers.surfaceAnimationDuration).toBe('2.1s');
  expect(revealLayers.surfaceAnimationTiming).toBe('cubic-bezier(0.22, 0.61, 0.36, 1)');
  expect(revealLayers.surfaceMask).not.toBe('none');
  expect(revealLayers.bedBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(revealLayers.widthDelta).toBeLessThan(0.5);
  expect(revealLayers.heightDelta).toBeLessThan(0.5);
  await developMat.locator('.ff-photo-card__print').evaluate(element => {
    element.getAnimations().forEach(animation => animation.play());
  });
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 30_000 });
  const processedImage = page.getByRole('img', { name: path.basename(fixture) });
  const sprocketPixel = await processedImage.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(
      Math.round(image.naturalWidth * 99 / 1307),
      Math.round(image.naturalHeight * 130 / 1203),
      1,
      1,
    ).data);
  });
  expect(Math.abs(sprocketPixel[0] - 51)).toBeLessThan(18);
  expect(Math.abs(sprocketPixel[1] - 102)).toBeLessThan(18);
  expect(Math.abs(sprocketPixel[2] - 204)).toBeLessThan(18);

  await page.getByRole('button', { name: /查看 aperture-mask-derived\.png/ }).click();
  const preview = page.getByRole('dialog', { name: /aperture-mask-derived\.png/ });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('button', { name: '原图' })).toBeVisible();
  await expect(preview.getByRole('button', { name: '成片', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: /胶片长条/ }).click();
  await expect(page.getByRole('heading', { name: '长条预览' })).toBeVisible();
  const stripStage = page.getByLabel('长条预览');
  await stripStage.getByRole('button', { name: '生成胶片长条' }).click();
  const stripImage = stripStage.getByRole('img', { name: '已生成的胶片长条' });
  await expect(stripImage).toBeVisible({ timeout: 30_000 });
  const stripSprocketPixel = await stripImage.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(
      Math.round(image.naturalWidth * 0.0824),
      Math.round(image.naturalHeight * 0.138),
      1,
      1,
    ).data);
  });
  expect(Math.abs(stripSprocketPixel[0] - 51)).toBeLessThan(18);
  expect(Math.abs(stripSprocketPixel[1] - 102)).toBeLessThan(18);
  expect(Math.abs(stripSprocketPixel[2] - 204)).toBeLessThan(18);
});

test('single preview keeps the selected source mode across navigation and reopen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await uploadCurationFixtures(page, 2);

  const firstName = curationNames[0];
  const secondName = curationNames[1];
  await page.getByRole('button', { name: `查看 ${firstName}` }).click();

  let preview = page.getByRole('dialog', { name: new RegExp(firstName) });
  const originalMode = preview.getByRole('button', { name: '原图' });
  const processedMode = preview.getByRole('button', { name: '成片', exact: true });
  await expect(processedMode).toHaveAttribute('aria-pressed', 'true');

  await originalMode.click();
  await expect(originalMode).toHaveAttribute('aria-pressed', 'true');
  await preview.getByRole('button', { name: '下一张' }).click();

  preview = page.getByRole('dialog', { name: new RegExp(secondName) });
  await expect(preview.getByRole('button', { name: '原图' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowLeft');

  preview = page.getByRole('dialog', { name: new RegExp(firstName) });
  await expect(preview.getByRole('button', { name: '原图' })).toHaveAttribute('aria-pressed', 'true');
  await preview.getByRole('button', { name: '关闭预览' }).click();
  await page.getByRole('button', { name: `查看 ${secondName}` }).click();

  preview = page.getByRole('dialog', { name: new RegExp(secondName) });
  await expect(preview.getByRole('button', { name: '原图' })).toHaveAttribute('aria-pressed', 'true');
  await preview.getByRole('button', { name: '成片', exact: true }).click();
  await expect(preview.getByRole('button', { name: '成片', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowRight');

  preview = page.getByRole('dialog', { name: new RegExp(firstName) });
  await expect(preview.getByRole('button', { name: '成片', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('single preview supports an explicit rotate button and guarded R shortcut', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const inspector = getRecipeInspector(page);
  await uploadCurationFixtures(page, 1);

  const fileName = curationNames[0];
  await page.getByRole('button', { name: `查看 ${fileName}` }).click();

  const preview = page.getByRole('dialog', { name: new RegExp(fileName) });
  const previewImage = preview.getByRole('img', { name: fileName });
  const waitForPreview = async () => {
    await expect(preview.getByText('正在生成预览', { exact: false })).toHaveCount(0, { timeout: 60_000 });
  };
  const rotateButton = preview.getByRole('button', { name: '顺时针旋转 90°' });
  await expect(rotateButton).toContainText('旋转 90°');
  await expect(rotateButton).toHaveAttribute('aria-keyshortcuts', 'R');
  await expect(rotateButton).toHaveCSS('min-height', '44px');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rotateButton).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => window.innerWidth),
  );

  const initialSource = await previewImage.getAttribute('src');
  await rotateButton.click();
  await expect.poll(() => previewImage.getAttribute('src'), { timeout: 30_000 }).not.toBe(initialSource);
  await waitForPreview();

  const buttonSource = await previewImage.getAttribute('src');
  await page.keyboard.press('r');
  await expect.poll(() => previewImage.getAttribute('src'), { timeout: 30_000 }).not.toBe(buttonSource);
  await waitForPreview();

  const lowercaseSource = await previewImage.getAttribute('src');
  await page.keyboard.press('Shift+R');
  await expect.poll(() => previewImage.getAttribute('src'), { timeout: 30_000 }).not.toBe(lowercaseSource);
  await waitForPreview();

  const uppercaseSource = await previewImage.getAttribute('src');
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', repeat: true, bubbles: true }));
  });
  await page.waitForTimeout(500);
  await expect(previewImage).toHaveAttribute('src', uppercaseSource ?? '');

  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', metaKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', altKey: true, bubbles: true }));
  });
  await page.waitForTimeout(500);
  await expect(previewImage).toHaveAttribute('src', uppercaseSource ?? '');

  const editable = preview.locator('input[data-shortcut-guard]');
  await preview.evaluate(dialog => {
    const input = document.createElement('input');
    input.dataset.shortcutGuard = 'true';
    dialog.append(input);
    input.focus();
  });
  await editable.press('r');
  await editable.evaluate(input => input.remove());
  await page.waitForTimeout(500);
  await expect(previewImage).toHaveAttribute('src', uppercaseSource ?? '');

  await preview.getByRole('button', { name: '调整构图' }).click();
  const zoom = preview.getByRole('slider', { name: '等比放大' });
  await zoom.focus();
  await zoom.press('r');
  await preview.getByRole('button', { name: '取消' }).click();
  await page.waitForTimeout(500);
  await expect(previewImage).toHaveAttribute('src', uppercaseSource ?? '');

  await preview.getByRole('button', { name: '关闭预览' }).click();
  await page.getByRole('tab', { name: /胶片长条/ }).click();
  const stripStage = page.getByLabel('长条预览');
  await stripStage.getByRole('button', { name: '生成胶片长条' }).click();
  await expect(stripStage.getByRole('img', { name: '已生成的胶片长条' })).toBeVisible({ timeout: 30_000 });
  await stripStage.getByRole('button', { name: '预览' }).click();

  const stripPreview = page.getByRole('dialog', { name: 'Film Strip' });
  const stripImage = stripPreview.getByRole('img', { name: 'Film Strip' });
  const stripSource = await stripImage.getAttribute('src');
  await expect(stripPreview.getByRole('button', { name: '顺时针旋转 90°' })).toHaveCount(0);
  await page.keyboard.press('r');
  await page.waitForTimeout(500);
  await expect(stripImage).toHaveAttribute('src', stripSource ?? '');
});

test('Kodak Portra 160 supports real 135 single and template strip rendering', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const inspector = getRecipeInspector(page);
  await uploadCurationFixtures(page, 1);
  await selectRecipeControl(page, '成像方式', 'legacy');
  await selectRecipeControl(page, '片边方式', 'legacy-template');
  await selectFilmStock(inspector,'KODAK PORTRA 160');

  await openRecipeAdvancedSettings(page, '高级渲染设置');
  const frameNumberColor = inspector.getByLabel('帧号颜色');
  await frameNumberColor.evaluate((input, value) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, '#44cc88');
  await expect(frameNumberColor).toHaveValue('#44cc88');

  await openRecipeAdvancedSettings(page, '高级渲染设置');
  const sprocketColor = inspector.getByRole('textbox', { name: '齿孔颜色', exact: true });
  await expect(inspector.getByText('跟随原片', { exact: true })).toBeVisible();
  await sprocketColor.evaluate((input, value) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, '#cc3344');
  await expect(sprocketColor).toHaveValue('#cc3344');
  await expect(inspector.getByText('#cc3344', { exact: true })).toBeVisible();
  await selectFilmStock(inspector,'KODAK PORTRA 400');
  await expect(frameNumberColor).toHaveValue('#44cc88');
  await expect(sprocketColor).toHaveValue('#cc3344');
  await selectFilmStock(inspector,'KODAK PORTRA 160');
  await expect(frameNumberColor).toHaveValue('#44cc88');
  await inspector.getByRole('button', { name: '恢复原片齿孔颜色' }).click();
  await expect(inspector.getByText('跟随原片', { exact: true })).toBeVisible();
  await sprocketColor.evaluate((input, value) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, '#cc3344');

  await expect(inspector.getByRole('group', { name: '画幅样式' })).toHaveCount(0);
  await expect(inspector.getByLabel('片边方式')).toBeVisible();
  await openRecipeAdvancedSettings(page, '高级输出设置');
  await inspector.getByRole('button', { name: '仅保留底片' }).click();
  await expect(inspector.getByRole('button', { name: '仅保留底片' })).toHaveAttribute('aria-pressed', 'true');
  await inspector.getByRole('button', { name: '保留扫描背景' }).click();
  const scanBackgroundColor = inspector.getByLabel('扫描背景色');
  await expect(scanBackgroundColor).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(window, 'EyeDropper', {
      configurable: true,
      value: class {
        open() {
          return Promise.resolve({ sRGBHex: '#9fc5d5' });
        }
      },
    });
  });
  await inspector.getByRole('button', { name: '从屏幕取色' }).click();
  await expect(scanBackgroundColor).toHaveValue('#9fc5d5');
  await scanBackgroundColor.evaluate((input, value) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, '#9fc5d5');
  await expect(scanBackgroundColor).toHaveValue('#9fc5d5');
  await openRecipeAdvancedSettings(page, '高级输出设置');
  await inspector.getByRole('button', { name: '仅保留底片' }).click();
  const frameImage = page.getByRole('img', { name: path.basename(fixture) });
  const originalFrameSource = await frameImage.getAttribute('src');
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => frameImage.getAttribute('src')).not.toBe(originalFrameSource);
  const frameSprocketPixel = await frameImage.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');
    context.drawImage(image, 0, 0);
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image.currentSrc.slice(0, 64),
      pixel: Array.from(context.getImageData(
        Math.round(image.naturalWidth * 121 / 1307),
        Math.round(image.naturalHeight * 136 / 1203),
        1,
        1,
      ).data),
    };
  });
  // Sampling ratios assume the 1307x1203 template layout; keep the size in the
  // failure output so a geometry regression is not reported as a colour miss.
  testInfo.attach('portra-160-sprocket-sample.json', {
    body: JSON.stringify({
      ...frameSprocketPixel,
      settings: await page.evaluate(() => localStorage.getItem('filmFrame.preferences.v1')),
    }, null, 2),
    contentType: 'application/json',
  });
  const frameSprocketRgb = frameSprocketPixel.pixel;
  expect(Math.abs(frameSprocketRgb[0] - 204)).toBeLessThan(18);
  expect(Math.abs(frameSprocketRgb[1] - 51)).toBeLessThan(18);
  expect(Math.abs(frameSprocketRgb[2] - 68)).toBeLessThan(18);

  await page.getByRole('tab', { name: /胶片长条/ }).click();
  const stripStage = page.getByLabel('长条预览');
  await stripStage.getByRole('button', { name: '生成胶片长条' }).click();
  const stripImage = stripStage.getByRole('img', { name: '已生成的胶片长条' });
  await expect(stripImage).toBeVisible({ timeout: 30_000 });
  const stripSprocketPixel = await stripImage.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');
    context.drawImage(image, 0, 0);
    const xRatio = (0.035 + 121 / 1307) / 1.07;
    const yRatio = (0.035 + 136 / 1307) / (1203 / 1307 + 0.07);
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      pixel: Array.from(context.getImageData(
        Math.round(image.naturalWidth * xRatio),
        Math.round(image.naturalHeight * yRatio),
        1,
        1,
      ).data),
    };
  });
  testInfo.attach('portra-160-strip-sprocket-sample.json', {
    body: JSON.stringify(stripSprocketPixel, null, 2),
    contentType: 'application/json',
  });
  const stripSprocketRgb = stripSprocketPixel.pixel;
  expect(Math.abs(stripSprocketRgb[0] - 204)).toBeLessThan(18);
  expect(Math.abs(stripSprocketRgb[1] - 51)).toBeLessThan(18);
  expect(Math.abs(stripSprocketRgb[2] - 68)).toBeLessThan(18);
});

const nonSpectralStocks = new Set([
  'KODAK COLORPLUS 200',
  'KODAK PRO IMAGE 100',
  'KODAK T-MAX 400',
  'KODAK T-MAX P3200',
  'FUJI SUPERIA 400',
]);

for (const [name, stock] of [
  ['Kodak Portra 400', 'KODAK PORTRA 400'],
  ['Kodak Ektar 100', 'KODAK EKTAR 100'],
  ['Kodak Portra 800', 'KODAK PORTRA 800'],
  ['Kodak Ultramax 400', 'GC 400 KODAK'],
  ['Kodak ColorPlus 200', 'KODAK COLORPLUS 200'],
  ['Kodak Pro Image 100', 'KODAK PRO IMAGE 100'],
  ['Kodak Ektachrome E100', 'KODAK EKTACHROME E100'],
  ['Kodak Tri-X 400', 'KODAK TRI-X 400'],
  ['Kodak T-Max 100', 'KODAK T-MAX 100'],
  ['Kodak T-Max 400', 'KODAK T-MAX 400'],
  ['Kodak T-Max P3200', 'KODAK T-MAX P3200'],
  ['Fuji Superia 400', 'FUJI SUPERIA 400'],
  ['CineStill 800T', 'CINESTILL 800T'],
  ['Ilford HP5 Plus', 'ILFORD HP5 PLUS'],
] as const) {
  test(`${name} supports real 135 single and template strip rendering`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const inspector = getRecipeInspector(page);
    await uploadCurationFixtures(page, 1);
    await selectRecipeControl(page, '成像方式', 'legacy');
    await selectRecipeControl(page, '片边方式', 'legacy-template');
    await selectFilmStock(inspector,stock);

    if (nonSpectralStocks.has(stock)) {
      await expect(inspector.getByRole('button', { name: '135 画幅', exact: true }))
        .toHaveAttribute('aria-pressed', 'true');
    } else {
      await expect(inspector.getByRole('group', { name: '画幅样式' })).toHaveCount(0);
      await expect(inspector.getByLabel('片边方式')).toBeVisible();
    }
    const frameImage = page.getByRole('img', { name: path.basename(fixture) });
    const originalFrameSource = await frameImage.getAttribute('src');
    await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
    await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => frameImage.getAttribute('src')).not.toBe(originalFrameSource);

    await page.getByRole('tab', { name: /胶片长条/ }).click();
    const stripStage = page.getByLabel('长条预览');
    await stripStage.getByRole('button', { name: '生成胶片长条' }).click();
    await expect(stripStage.getByRole('img', { name: '已生成的胶片长条' })).toBeVisible({ timeout: 30_000 });
  });
}

test('crop editor returns focus to its trigger after Escape and cancel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await uploadCurationFixtures(page, 1);
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /查看 aperture-mask-derived\.png/ }).click();
  const originalMode = page.getByRole('button', { name: '原图' });
  const processedMode = page.getByRole('button', { name: '成片', exact: true });
  await originalMode.click();
  await expect(originalMode).toHaveAttribute('aria-pressed', 'true');
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
  await expect(originalMode).toHaveAttribute('aria-pressed', 'true');

  await cropTrigger.click();
  await expect(cropViewport).toBeVisible();
  const styleBeforeKeyboardMove = await cropImage.getAttribute('style');
  await cropViewport.press('ArrowDown');
  await expect.poll(() => cropImage.getAttribute('style')).not.toBe(styleBeforeKeyboardMove);
  await page.getByRole('button', { name: '完成' }).click();
  await expect(cropViewport).toBeHidden();
  await expect(cropTrigger).toBeFocused();
  await expect(processedMode).toHaveAttribute('aria-pressed', 'true');
});

test('support dialog loads the payment QR image and retains focus trapping', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '支持 FilmFrame' }).click();

  const dialog = page.getByRole('dialog', { name: '支持 FilmFrame' });
  await expect(dialog).toBeVisible();
  const qrImage = dialog.getByRole('img', { name: '支持 FilmFrame 的二维码' });
  await expect(qrImage).toBeVisible();
  await expect.poll(() => qrImage.evaluate(image => ({
    width: (image as HTMLImageElement).naturalWidth,
    height: (image as HTMLImageElement).naturalHeight,
  }))).toEqual({ width: 1260, height: 1890 });
  await expect(dialog.getByText('二维码暂不可用，请在资源替换后重试。')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭支持窗口' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '关闭支持窗口' })).toBeFocused();
});

test('support opened from mobile settings replaces the Sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await uploadCurationFixtures(page, 1);
  await page.locator('header').getByRole('button', { name: '打开调整' }).click();
  const sheet = page.getByRole('dialog', { name: '调整' });

  await sheet.getByRole('button', { name: '更多操作' }).click();
  await sheet.getByRole('menuitem', { name: '支持 FilmFrame' }).click();
  const support = page.getByRole('dialog', { name: '支持 FilmFrame' });
  await expect(support).toBeVisible();
  await expect(support.getByRole('img', { name: '支持 FilmFrame 的二维码' })).toBeVisible();
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
  await expect(page.getByRole('menuitem', { name: '来源与许可' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: '本地处理与隐私' })).toBeFocused();
  await page.keyboard.press('Enter');

  const notice = page.getByRole('status').filter({
    hasText: '照片只在当前设备处理，不会上传；刷新或关闭页面后不会保留。',
  });
  const moreMenuElement = await more.elementHandle();
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('aria-live', 'polite');
  await expect.poll(() => notice.evaluateAll((elements, workspace) => {
    if (elements.length !== 1 || !workspace) return -1;
    const [toast] = elements;
    const animations = toast.getAnimations({ subtree: true });
    const isStable = getComputedStyle(toast).opacity === '1'
      && animations.every(animation => animation.playState === 'finished');
    if (!isStable) return -1;
    const noticeBox = toast.getBoundingClientRect();
    const moreBox = workspace.getBoundingClientRect();
    return noticeBox.y - moreBox.bottom;
  }, moreMenuElement)).toBeGreaterThanOrEqual(0);
});

test('credits dialog exposes source licenses and unresolved rights accessibly', async ({ page }) => {
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '来源与许可' }).click();
  const dialog = page.getByRole('dialog', { name: '来源与许可' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'SpektraLab · GPL-3.0-or-later' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'spektrafilm · CC BY-SA 4.0' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '仍需权利审核' })).toBeVisible();
  const licenseHref = await dialog.getByRole('link', { name: '许可文本' }).first().getAttribute('href');
  expect(licenseHref).toBeTruthy();
  const licenseResponse = await page.request.get(licenseHref!);
  expect(licenseResponse.ok()).toBe(true);
  expect(await licenseResponse.text()).toContain('GNU GENERAL PUBLIC LICENSE');
  const noticeHref = await dialog.getByRole('link', { name: '下载 NOTICE' }).getAttribute('href');
  expect(noticeHref).toBeTruthy();
  const noticeResponse = await page.request.get(noticeHref!);
  expect(noticeResponse.ok()).toBe(true);
  expect(await noticeResponse.body()).toEqual(await readFile(path.resolve(process.cwd(), 'NOTICE')));
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '更多操作' })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await uploadCurationFixtures(page, 1);
  await page.locator('header').getByRole('button', { name: '打开调整' }).click();
  const sheet = page.getByRole('dialog', { name: '调整' });
  await sheet.getByRole('button', { name: '更多操作' }).click();
  await sheet.getByRole('menuitem', { name: '来源与许可' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '来源与许可' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('batch curation keeps card, strip, summary, and zero-selection recovery in sync', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await uploadCurationFixtures(page);

  const [firstName, secondName, thirdName] = curationNames;
  const selectionScope = page.getByRole('group', { name: '选片范围' });
  const summary = page.getByTestId('workspace-summary').filter({ hasText: /^3\/3 张入选/ });

  await expect(summary).toBeVisible();
  await expect(curationCheckbox(page, '取消入选', secondName)).toBeChecked();

  await curationCheckbox(page, '取消入选', secondName).uncheck();
  await expect(page.getByTestId('workspace-summary').filter({ hasText: /^2\/3 张入选/ })).toBeVisible();
  await expect(curationCheckbox(page, '入选', secondName)).not.toBeChecked();

  await page.getByRole('tab', { name: /胶片长条 2 张入选/ }).click();
  const sequence = page.getByLabel('胶片长条照片顺序');
  await expect(sequence.getByRole('checkbox', { name: `入选 ${secondName}` })).not.toBeChecked();

  await sequence.getByRole('checkbox', { name: `入选 ${secondName}` }).check();
  await expect(page.getByTestId('workspace-summary').filter({ hasText: /^3\/3 张入选/ })).toBeVisible();
  await expect(sequence.getByRole('checkbox', { name: `取消入选 ${secondName}` })).toBeChecked();

  await selectionScope.getByRole('button', { name: '清空入选' }).click();
  await expect(page.getByTestId('workspace-summary').filter({ hasText: /^0\/3 张入选/ })).toBeVisible();
  const zeroSelectionMessage = page.getByRole('status').filter({ hasText: '请先选择至少一张照片' });
  await expect(zeroSelectionMessage).toHaveAttribute('role', 'status');
  await expect(page.getByLabel('长条预览').getByRole('button', { name: '请先选择至少一张照片' })).toBeDisabled();

  await selectionScope.getByRole('button', { name: '全部入选' }).click();
  await expect(page.getByTestId('workspace-summary').filter({ hasText: /^3\/3 张入选/ })).toBeVisible();
  await expect(sequence.getByRole('checkbox', { name: `取消入选 ${firstName}` })).toBeChecked();
  await expect(sequence.getByRole('checkbox', { name: `取消入选 ${thirdName}` })).toBeChecked();
});

test('incomplete ZIP export requires an explicit partial export or finishes the roll first', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await uploadCurationFixtures(page);

  const thirdName = curationNames[2];
  await curationCheckbox(page, '取消入选', thirdName).uncheck();
  const emptyExportButton = page.getByRole('button', { name: '检查出片进度 (0/2)' });
  await emptyExportButton.click();
  const dialog = page.getByRole('dialog', { name: '这一卷还没有全部冲洗完成' });
  await expect(dialog).toContainText('当前 0/2 张已有成片，另有 2 张待冲洗。');
  await expect(dialog.getByRole('button', { name: /仅导出当前/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(emptyExportButton).toBeFocused();

  await page.getByRole('button', { name: /冲洗待更新照片 \(2\)/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(2, { timeout: 30_000 });

  await curationCheckbox(page, '入选', thirdName).check();
  const exportButton = page.getByRole('button', { name: '检查出片进度 (2/3)' });
  await exportButton.click();

  await expect(dialog).toContainText('当前 2/3 张已有成片，另有 1 张待冲洗。');
  await expect(dialog.getByRole('button', { name: '仅导出当前 2/3 张' })).toBeVisible();

  const partialDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '仅导出当前 2/3 张' }).click();
  const partialZip = await partialDownload;
  await expect(partialZip.suggestedFilename()).toMatch(/^filmframe_.*\.zip$/);
  expect(await countZipEntries(partialZip)).toBe(2);
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(2);

  await exportButton.click();
  await expect(dialog).toBeVisible();
  const completeDownload = page.waitForEvent('download', { timeout: 30_000 });
  await dialog.getByRole('button', { name: '冲洗剩余 1 张并导出' }).click();
  const completeZip = await completeDownload;
  await expect(completeZip.suggestedFilename()).toMatch(/^filmframe_.*\.zip$/);
  expect(await countZipEntries(completeZip)).toBe(3);
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(3);
  await expect(page.getByRole('button', { name: '打包下载 ZIP (3)' })).toBeVisible();
});

test('delete all photos requires confirmation and resets only the current roll', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    (window as Window & { __revokedObjectUrls?: string[] }).__revokedObjectUrls = [];
    URL.revokeObjectURL = url => {
      (window as Window & { __revokedObjectUrls?: string[] }).__revokedObjectUrls?.push(String(url));
      originalRevoke(url);
    };
  });

  const inspector = getRecipeInspector(page);
  await selectFilmStock(inspector,'KODAK PORTRA 160');
  await uploadCurationFixtures(page, 2);
  await page.getByRole('tab', { name: /胶片长条 2 张入选/ }).click();

  const trigger = page.getByRole('button', { name: '删除全部照片' });
  await expect(page.getByRole('tab', { name: /胶片长条/ })).toHaveAttribute('aria-selected', 'true');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '删除全部照片？' });
  await expect(dialog).toContainText('将从当前工作区移除 2 张照片及其生成结果。');
  await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByTestId('workspace-summary').filter({ hasText: /^2\/2 张入选/ })).toBeVisible();

  await trigger.click();
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole('button', { name: '删除 2 张照片' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: '让这一卷，慢慢显影' })).toBeVisible();
  await expect(trigger).toBeHidden();
  await expect(page.locator('#workspace-add-photos')).toBeFocused();
  await expect(inspector.getByRole('button', { name: '胶片型号', exact: true })).toContainText('KODAK PORTRA 160');
  await expect(page.getByRole('tab', { name: /胶片长条/ })).toHaveCount(0);
  expect(await page.evaluate(() => (
    (window as Window & { __revokedObjectUrls?: string[] }).__revokedObjectUrls ?? []
  ))).toHaveLength(2);

  await uploadCurationFixtures(page, 2);
  await expect(page.getByTestId('workspace-summary').filter({ hasText: /^2\/2 张入选/ })).toBeVisible();
});

test('delete all rejects a pre-reset upload after delayed decoding and revokes its late URL', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    const trackedWindow = window as UploadLifecycleWindow;
    trackedWindow.__createdUploadUrls = [];
    trackedWindow.__revokedUploadUrls = [];
    trackedWindow.__delayedImageDecodes = [];

    const createObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = object => {
      const url = createObjectUrl(object);
      trackedWindow.__createdUploadUrls?.push(url);
      return url;
    };
    const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = url => {
      trackedWindow.__revokedUploadUrls?.push(String(url));
      revokeObjectUrl(url);
    };

    const nativeSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (!nativeSrc?.get || !nativeSrc.set) throw new Error('Native image source accessors are unavailable');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      get(this: HTMLImageElement) {
        return nativeSrc.get!.call(this);
      },
      set(this: HTMLImageElement, value: string) {
        if (value.startsWith('blob:') && trackedWindow.__delayNextImageDecode) {
          trackedWindow.__delayNextImageDecode = false;
          trackedWindow.__delayedImageDecodes?.push({
            url: value,
            release: () => nativeSrc.set!.call(this, value),
          });
          return;
        }
        nativeSrc.set!.call(this, value);
      },
    });
  });
  await page.reload();

  const firstName = curationNames[0];
  const lateName = curationNames[1];
  await uploadCurationFixtures(page, 1);
  await expect(page.getByRole('img', { name: firstName })).toBeVisible();
  await page.evaluate(() => {
    (window as UploadLifecycleWindow).__delayNextImageDecode = true;
  });
  await page.locator('input[type="file"]').setInputFiles(curationFixtures[1]);
  await expect.poll(() => page.evaluate(() => (
    window as UploadLifecycleWindow
  ).__delayedImageDecodes?.length)).toBe(1);
  await expect(page.getByRole('img', { name: lateName })).toHaveCount(0);

  await page.getByRole('button', { name: '删除全部照片' }).click();
  await page.getByRole('dialog', { name: '删除全部照片？' })
    .getByRole('button', { name: '删除 1 张照片' }).click();
  await expect(page.getByRole('heading', { name: '让这一卷，慢慢显影' })).toBeVisible();

  await page.evaluate(() => {
    const releaseDecode = (window as UploadLifecycleWindow).__delayedImageDecodes?.[0]?.release;
    if (!releaseDecode) throw new Error('Delayed image decode was not captured');
    releaseDecode();
  });
  const lateUrl = await page.evaluate(() => (
    window as UploadLifecycleWindow
  ).__createdUploadUrls?.[1]);
  if (!lateUrl) throw new Error('Late upload Object URL was not captured');
  await expect.poll(() => page.evaluate(() => (
    window as UploadLifecycleWindow
  ).__revokedUploadUrls ?? [])).toContain(lateUrl);
  await expect(page.getByRole('img', { name: lateName })).toHaveCount(0);
  await expect(page.getByRole('list', { name: /照片列表/ })).toHaveCount(0);
  await expect(page.locator('.ff-notice-toast')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await page.evaluate(() => (
    window as UploadLifecycleWindow
  ).__revokedUploadUrls ?? [])).toHaveLength(2);

  await uploadCurationFixtures(page, 1);
  await expect(page.getByRole('img', { name: firstName })).toBeVisible();
  await expect(page.getByText('已添加 1 张照片，照片仅在本机处理。', { exact: true })).toBeVisible();
});

test('batch processing skips excluded cards without renumbering or discarding current artifacts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await uploadCurationFixtures(page);

  const [firstName, secondName, thirdName] = curationNames;
  const firstCard = photoCard(page, firstName);
  const excludedCard = photoCard(page, secondName);
  const thirdCard = photoCard(page, thirdName);

  await curationCheckbox(page, '取消入选', secondName).uncheck();
  await expect(thirdCard.getByText('第 03 张', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '冲洗待更新照片 (2)' }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(2, { timeout: 30_000 });
  await expect(excludedCard.getByText('待冲洗', { exact: true })).toBeVisible();
  await expect(thirdCard.getByText('第 03 张', { exact: true })).toBeVisible();
  await expect(curationCheckbox(page, '入选', secondName)).not.toBeChecked();

  await curationCheckbox(page, '取消入选', firstName).uncheck();
  await expect(firstCard.getByRole('img', { name: '已出片' })).toBeVisible();
});

test('processing locks batch order and rejects dropped files until the snapshot completes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    class TrackingWorker extends NativeWorker {
      terminate() {
        const trackedWindow = window as Window & { __filmWorkerTerminations?: number };
        trackedWindow.__filmWorkerTerminations = (trackedWindow.__filmWorkerTerminations ?? 0) + 1;
        super.terminate();
      }
    }
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: TrackingWorker,
    });
  });
  await page.reload();
  await page.route('**/film-overlays/film-base.png', async route => {
    await new Promise(resolve => setTimeout(resolve, 1_000));
    try {
      await route.continue();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Route is already handled')) throw error;
    }
  });
  await uploadCurationFixtures(page);

  const [firstName] = curationNames;
  await page.getByRole('button', { name: '冲洗待更新照片 (3)' }).click();
  await expect(page.getByRole('button', { name: `下移 ${firstName}` })).toBeDisabled();
  await expect(page.getByRole('button', { name: '删除全部照片' })).toBeDisabled();

  const dataTransfer = await page.evaluateHandle(async () => {
    const blob = await fetch('/film-overlays/aperture-mask-derived.png').then(response => response.blob());
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'busy-add.png', { type: 'image/png' }));
    return transfer;
  });
  await page.locator('#workspace').dispatchEvent('drop', { dataTransfer });
  await page.waitForTimeout(250);

  await expect(page.getByTestId('workspace-summary').filter({ hasText: /^3\/3 张入选/ })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  await page.getByRole('button', { name: '停止后续' }).click();
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __filmWorkerTerminations?: number }
  ).__filmWorkerTerminations ?? 0)).toBe(1);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  await page.waitForTimeout(1_100);
  await page.unroute('**/film-overlays/film-base.png');
  await page.getByRole('button', { name: /冲洗待更新照片 \(3\)/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(3, { timeout: 30_000 });
});

test('changing the included subset marks a generated film strip stale', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await uploadCurationFixtures(page, 2);

  const [, secondName] = curationNames;
  await page.getByRole('tab', { name: /胶片长条 2 张入选/ }).click();
  const stripStage = page.getByLabel('长条预览');

  await stripStage.getByRole('button', { name: '生成胶片长条' }).click();
  await expect(stripStage.getByRole('img', { name: '已生成的胶片长条' })).toBeVisible({ timeout: 30_000 });

  await page.getByLabel('胶片长条照片顺序')
    .getByRole('checkbox', { name: `取消入选 ${secondName}` })
    .uncheck();
  await expect(page.getByText('需重新生成', { exact: true })).toBeVisible();
  await expect(stripStage.getByRole('img', { name: '需要重新生成的胶片长条' })).toBeVisible();
});

test('a timed-out regeneration preserves the previous downloadable film strip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const nativeSetTimeout = window.setTimeout.bind(window);
    let stripRequests = 0;

    window.Worker = class extends NativeWorker {
      postMessage(message: { type?: string }, options?: Transferable[] | StructuredSerializeOptions) {
        if (message.type === 'generateFilmStrip' && ++stripRequests === 2) return;
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
    Object.defineProperty(window, 'setTimeout', {
      value: (handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
        nativeSetTimeout(handler, timeout === 120_000 && stripRequests === 1 ? 50 : timeout, ...args),
    });
  });
  await page.reload();
  await uploadCurationFixtures(page, 2);
  await page.getByRole('tab', { name: /胶片长条 2 张入选/ }).click();
  const stripStage = page.getByLabel('长条预览');
  await stripStage.getByRole('button', { name: '生成胶片长条', exact: true }).click();
  const output = stripStage.getByRole('img', { name: '已生成的胶片长条' });
  await expect(output).toBeVisible({ timeout: 30_000 });
  const originalUrl = await output.getAttribute('src');

  await stripStage.getByRole('button', { name: '重新生成胶片长条', exact: true }).click();
  const error = page.getByRole('dialog', { name: '需要处理' });
  await expect(error).toContainText('渲染超时');
  await error.getByRole('button', { name: '我知道了' }).click();

  await expect(output).toHaveAttribute('src', originalUrl!);
  const download = page.waitForEvent('download');
  await stripStage.getByRole('button', { name: '下载', exact: true }).click();
  expect(await (await download).failure()).toBeNull();
});

test('mobile batch curation remains operable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await uploadCurationFixtures(page);

  const [firstName] = curationNames;
  const firstCheckbox = curationCheckbox(page, '取消入选', firstName);
  await expect(page.getByTestId('workspace-summary').filter({ hasText: /^3\/3 张入选/ })).toBeVisible();
  await expect(firstCheckbox.locator('xpath=..')).toHaveCSS('min-height', '44px');

  await firstCheckbox.uncheck();
  await expect(page.getByTestId('workspace-summary').filter({ hasText: /^2\/3 张入选/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => window.innerWidth),
  );
});
