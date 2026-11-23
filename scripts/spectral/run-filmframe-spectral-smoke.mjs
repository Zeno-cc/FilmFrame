import { chromium } from 'playwright';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { selectFilmStock } from '../../tests/e2e/stockPicker.ts';
import { getRecipeInspector, selectRecipeControl } from '../../tests/e2e/recipeControls.ts';

const fixture = path.resolve('public/film-overlays/aperture-mask-derived.png');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !response.url().includes('/api/runtime-config') && !response.url().includes('/auth/refresh')) errors.push(`${response.status()} ${response.url()}`); });
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text()); });
  await page.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles(fixture);
  const inspector = getRecipeInspector(page);
  await selectFilmStock(inspector,'KODAK PORTRA 400');
  await selectRecipeControl(page, '成像方式', 'spectral');
  await selectRecipeControl(page, '光谱计算', 'cpu');
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await page.getByRole('img', { name: '已出片' }).waitFor({ timeout: 60000 });
  await mkdir('output/playwright/spectral', { recursive: true });
  await page.screenshot({ path: 'output/playwright/spectral/filmframe-spectral-gpu.png', fullPage: true });
  const src = await page.getByRole('img', { name: 'aperture-mask-derived.png' }).getAttribute('src');
  const gpuPixels = await page.getByRole('img', { name: 'aperture-mask-derived.png' }).evaluate(image => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  });
  await inspector.getByLabel('光谱计算').selectOption('cpu');
  console.log('before-cpu-render', await page.locator('body').innerText());
  await page.getByRole('button', { name: /冲洗待更新照片|重新冲洗全部/ }).click();
  await page.getByRole('img', { name: '已出片' }).waitFor({ timeout: 60000 });
  const cpuSrc = await page.getByRole('img', { name: 'aperture-mask-derived.png' }).getAttribute('src');
  const cpuPixels = await page.getByRole('img', { name: 'aperture-mask-derived.png' }).evaluate(image => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  });
  let maxDifference = 0;
  let differingValues = 0;
  for (let index = 0; index < gpuPixels.length; index += 1) {
    const difference = Math.abs(gpuPixels[index] - cpuPixels[index]);
    maxDifference = Math.max(maxDifference, difference);
    if (difference > 1) differingValues += 1;
  }
  console.log(JSON.stringify({ gpuResult: src?.startsWith('blob:'), cpuResult: cpuSrc?.startsWith('blob:'), gpuChanged: src !== cpuSrc, maxDifference, differingValues, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
