import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';

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

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('desktop empty darkroom exposes the new shell and inspector', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await expect(page.getByRole('heading', { name: '接触印象' })).toBeVisible();
  await expect(page.getByLabel('新胶卷，本地处理')).toBeVisible();
  await expect(page.getByRole('heading', { name: '让这一卷，慢慢显影' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '暗房配方' })).toBeVisible();
  const quote = page.getByTestId('photography-quote');
  await expect(quote.locator('blockquote')).not.toBeEmpty();
  await expect(quote.locator('cite')).not.toBeEmpty();
  await expect(quote).toHaveAttribute('aria-live', 'off');
  await expect(page.getByRole('button', { name: '换一句摄影名言' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /暂停名言轮播|继续名言轮播/ })).toHaveCount(0);
  await expect(page.getByText(/照片仅在当前设备处理|名言语料由 Wikiquote/)).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name))).not.toContainEqual(
    expect.stringContaining('wikiquote.org'),
  );

  const track = page.getByTestId('empty-darkroom-film-track');
  await expect(track).toBeVisible();
  await expect(track).toHaveCSS('animation-name', 'ff-empty-film-transport');
  await expect(track).toHaveCSS('animation-duration', '36s');
  await expect(track).toHaveCSS('animation-timing-function', 'linear');
  await expect(track).toHaveCSS('animation-iteration-count', 'infinite');
  const exposureBackground = await page.locator('.ff-empty-darkroom__exposures').evaluate(element => {
    const frame = element.firstElementChild;
    if (!frame) throw new Error('Decorative 135 exposure frame is missing');
    return {
      color: getComputedStyle(frame).backgroundColor,
      image: getComputedStyle(frame).backgroundImage,
    };
  });
  expect(exposureBackground.color).toBe('rgba(72, 63, 49, 0.12)');
  expect(exposureBackground.image).not.toContain('repeating-linear-gradient');

  const frameGeometry = await page.getByTestId('empty-darkroom-exposure-frame').first().evaluate(element => {
    const frame = element.getBoundingClientRect();
    const trackElement = element.parentElement?.parentElement;
    if (!trackElement) throw new Error('Decorative 135 film track is missing');
    const track = trackElement.getBoundingClientRect();
    return {
      width: frame.width,
      height: frame.height,
      ratio: frame.width / frame.height,
      topClearance: frame.top - track.top,
      bottomClearance: track.bottom - frame.bottom,
    };
  });
  const railGeometry = await page.getByTestId('empty-darkroom-film-rail').evaluateAll(elements => elements.map(element => {
    const rail = element.getBoundingClientRect();
    const holes = getComputedStyle(element, '::before');
    return {
      top: rail.top,
      bottom: rail.bottom,
      height: rail.height,
      holeHeight: holes.height,
      holeBackground: holes.backgroundImage,
    };
  }));
  const negativeHeight = await track.evaluate(element => element.getBoundingClientRect().height);
  expect(negativeHeight).toBe(332);
  expect(frameGeometry.width).toBe(342);
  expect(frameGeometry.height).toBe(228);
  expect(frameGeometry.ratio).toBeCloseTo(1.5, 5);
  expect(frameGeometry.topClearance).toBeCloseTo(52, 5);
  expect(frameGeometry.bottomClearance).toBeCloseTo(52, 5);
  expect(railGeometry).toHaveLength(2);
  expect(railGeometry[0].height).toBe(52);
  expect(railGeometry[1].height).toBe(52);
  expect(railGeometry[0].bottom).toBeCloseTo(frameGeometry.topClearance + railGeometry[0].top, 5);
  expect(railGeometry[1].top).toBeCloseTo(frameGeometry.bottomClearance + frameGeometry.height + railGeometry[0].top, 5);
  expect(railGeometry[0].holeHeight).toBe('20px');
  expect(railGeometry[0].holeBackground).toContain('repeating-linear-gradient');

  const context = await page.getByTestId('empty-darkroom-context').boundingBox();
  const negative = await track.boundingBox();
  if (!context || !negative) throw new Error('Empty darkroom composition is missing');
  expect(context.y).toBeGreaterThanOrEqual(negative.y + negative.height);

  const transforms = await track.evaluate(element => {
    const animation = element.getAnimations()[0];
    if (!animation) throw new Error('Film transport animation is missing');
    animation.pause();
    animation.currentTime = 0;
    const start = getComputedStyle(element).transform;
    animation.currentTime = 1000;
    const end = getComputedStyle(element).transform;
    return { start, end };
  });
  expect(transforms.end).not.toBe(transforms.start);
  await track.evaluate(element => element.getAnimations()[0]?.play());
  await expect(track).toHaveCSS('animation-play-state', 'running');

  const emptyDarkroom = page.locator('.ff-empty-darkroom');
  await emptyDarkroom.hover();
  await expect(track).toHaveCSS('animation-play-state', 'paused');
  await page.mouse.move(0, 0);
  await emptyDarkroom.getByRole('button', { name: '选择照片' }).focus();
  await expect(track).toHaveCSS('animation-play-state', 'paused');
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
  await expect(page.locator('.ff-empty-darkroom').getByRole('button', { name: '选择照片' })).toBeVisible();
  const mobileFrame = await page.getByTestId('empty-darkroom-exposure-frame').first().boundingBox();
  if (!mobileFrame) throw new Error('Decorative 135 exposure frame is not visible');
  expect(mobileFrame.width / mobileFrame.height).toBeCloseTo(1.5, 5);
  const mobileNegative = await track.boundingBox();
  const mobileContext = await page.getByTestId('empty-darkroom-context').boundingBox();
  if (!mobileNegative || !mobileContext) throw new Error('Mobile empty darkroom composition is missing');
  expect(mobileNegative.height).toBe(332);
  expect(mobileContext.y).toBeGreaterThanOrEqual(mobileNegative.y + mobileNegative.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => window.innerWidth),
  );

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

test('mobile settings sheet traps the settings flow and closes with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.locator('header').getByRole('button', { name: '打开暗房配方' });

  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '暗房配方' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('tab', { name: '输出' }).click();
  await expect(sheet.getByRole('group', { name: '输出格式' })).toBeVisible();
  await sheet.getByRole('tab', { name: '胶片' }).click();
  await expect(sheet.getByLabel('帧号颜色')).toBeVisible();
  await expect(sheet.getByLabel('齿孔颜色')).toBeVisible();

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
  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  const sprocketColor = inspector.getByRole('textbox', { name: '齿孔颜色', exact: true });
  await sprocketColor.evaluate((input, value) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, '#3366cc');
  await page.locator('input[type="file"]').setInputFiles(fixture);

  await expect(page.getByTestId('empty-darkroom-film-track')).toHaveCount(0);
  await expect(page.getByRole('list', { name: /接触印象，共 1 张照片/ })).toBeVisible();
  await expect(page.getByText('待冲洗', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
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

  await page.getByRole('tab', { name: /连底长条/ }).click();
  await expect(page.getByRole('heading', { name: '长条审片台' })).toBeVisible();
  const stripStage = page.getByLabel('长条审片台');
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

test('Kodak Portra 160 supports real 135 single and template strip rendering', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await inspector.getByLabel('胶片型号').selectOption('KODAK PORTRA 160');

  const frameNumberColor = inspector.getByLabel('帧号颜色');
  await frameNumberColor.evaluate((input, value) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, '#44cc88');
  await expect(frameNumberColor).toHaveValue('#44cc88');

  const sprocketColor = inspector.getByRole('textbox', { name: '齿孔颜色', exact: true });
  await expect(inspector.getByText('跟随原片', { exact: true })).toBeVisible();
  await sprocketColor.evaluate((input, value) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, '#cc3344');
  await expect(sprocketColor).toHaveValue('#cc3344');
  await expect(inspector.getByText('#cc3344', { exact: true })).toBeVisible();
  await inspector.getByLabel('胶片型号').selectOption('KODAK PORTRA 400');
  await expect(frameNumberColor).toHaveValue('#44cc88');
  await expect(sprocketColor).toHaveValue('#cc3344');
  await inspector.getByLabel('胶片型号').selectOption('KODAK PORTRA 160');
  await expect(frameNumberColor).toHaveValue('#44cc88');
  await inspector.getByRole('button', { name: '恢复原片齿孔颜色' }).click();
  await expect(inspector.getByText('跟随原片', { exact: true })).toBeVisible();
  await sprocketColor.evaluate((input, value) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, '#cc3344');

  await expect(inspector.getByRole('button', { name: '真实 135' })).toHaveAttribute('aria-pressed', 'true');
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
  await inspector.getByRole('button', { name: '仅保留底片' }).click();
  await page.locator('input[type="file"]').setInputFiles(fixture);
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
    return Array.from(context.getImageData(
      Math.round(image.naturalWidth * 121 / 1307),
      Math.round(image.naturalHeight * 136 / 1203),
      1,
      1,
    ).data);
  });
  expect(Math.abs(frameSprocketPixel[0] - 204)).toBeLessThan(18);
  expect(Math.abs(frameSprocketPixel[1] - 51)).toBeLessThan(18);
  expect(Math.abs(frameSprocketPixel[2] - 68)).toBeLessThan(18);

  await page.getByRole('tab', { name: /连底长条/ }).click();
  const stripStage = page.getByLabel('长条审片台');
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
    return Array.from(context.getImageData(
      Math.round(image.naturalWidth * xRatio),
      Math.round(image.naturalHeight * yRatio),
      1,
      1,
    ).data);
  });
  expect(Math.abs(stripSprocketPixel[0] - 204)).toBeLessThan(18);
  expect(Math.abs(stripSprocketPixel[1] - 51)).toBeLessThan(18);
  expect(Math.abs(stripSprocketPixel[2] - 68)).toBeLessThan(18);
});

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
    const inspector = page.getByRole('complementary', { name: '暗房配方' });
    await inspector.getByLabel('胶片型号').selectOption(stock);

    await expect(inspector.getByRole('button', { name: '真实 135' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('input[type="file"]').setInputFiles(fixture);
    const frameImage = page.getByRole('img', { name: path.basename(fixture) });
    const originalFrameSource = await frameImage.getAttribute('src');
    await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
    await expect(page.getByRole('img', { name: '已出片' })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => frameImage.getAttribute('src')).not.toBe(originalFrameSource);

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

test('incomplete ZIP export requires an explicit partial export or finishes the roll first', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await uploadCurationFixtures(page);

  const thirdName = curationNames[2];
  await curationCheckbox(page, '取消入选', thirdName).uncheck();
  const emptyExportButton = page.getByRole('button', { name: '完成冲洗并导出 ZIP (0/2)' });
  await emptyExportButton.click();
  const dialog = page.getByRole('dialog', { name: '这一卷还没有全部冲洗完成' });
  await expect(dialog).toContainText('当前 0/2 张已有成片，另有 2 张待冲洗。');
  await expect(dialog.getByRole('button', { name: /仅导出当前/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(emptyExportButton).toBeFocused();

  await page.getByRole('button', { name: /冲洗待更新照片 \(2\)/ }).click();
  await expect(page.getByRole('img', { name: '已出片' })).toHaveCount(2, { timeout: 30_000 });

  await curationCheckbox(page, '入选', thirdName).check();
  const exportButton = page.getByRole('button', { name: '完成冲洗并导出 ZIP (2/3)' });
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

  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await inspector.getByLabel('胶片型号').selectOption('KODAK PORTRA 160');
  await uploadCurationFixtures(page, 2);
  await page.getByRole('tab', { name: /连底长条 · 2 张入选/ }).click();

  const trigger = page.getByRole('button', { name: '删除全部照片' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '删除全部照片？' });
  await expect(dialog).toContainText('将从当前工作区移除 2 张照片及其生成结果。');
  await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByText('入选 2 / 2', { exact: true })).toBeVisible();

  await trigger.click();
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole('button', { name: '删除 2 张照片' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: '让这一卷，慢慢显影' })).toBeVisible();
  await expect(trigger).toBeHidden();
  await expect(page.locator('#workspace-add-photos')).toBeFocused();
  await expect(inspector.getByLabel('胶片型号')).toHaveValue('KODAK PORTRA 160');
  await expect(page.getByRole('tab', { name: /连底长条/ })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => (
    (window as Window & { __revokedObjectUrls?: string[] }).__revokedObjectUrls ?? []
  ))).toHaveLength(2);

  await uploadCurationFixtures(page, 2);
  await expect(page.getByText('入选 2 / 2', { exact: true })).toBeVisible();
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

  await expect(page.getByText('入选 3 / 3', { exact: true })).toBeVisible();
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
