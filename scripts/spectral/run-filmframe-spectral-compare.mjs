import { chromium } from 'playwright';
import path from 'node:path';
import { selectFilmStock } from '../../tests/e2e/stockPicker.ts';

const fixture = path.resolve('public/film-overlays/aperture-mask-derived.png');
const browser = await chromium.launch({ headless: true });
async function capture(backend) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    page.on('pageerror', error => console.log('PAGEERROR', backend, error.message));
    page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') console.log('CONSOLE', backend, message.type(), message.text()); });
    await page.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    const inspector = page.getByRole('complementary', { name: '暗房配方' });
    await selectFilmStock(inspector,'KODAK PORTRA 400');
    await inspector.getByLabel('成像方式').selectOption('spectral');
    await inspector.getByLabel('光谱计算').selectOption(backend);
    await inspector.getByLabel('颗粒强度').fill('0');
    await page.locator('input[type="file"]').setInputFiles(fixture);
    await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
    await page.getByRole('img', { name: '已出片' }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: /查看 aperture-mask-derived\.png/ }).click();
    const dialog = page.getByRole('dialog', { name: /aperture-mask-derived\.png/ });
    await dialog.getByRole('button', { name: '成片', exact: true }).click();
    const image = dialog.getByRole('img', { name: /aperture-mask-derived/ });
    await image.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => !document.body.textContent.includes('正在生成预览'));
    return await image.evaluate(image => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      return { width: canvas.width, height: canvas.height, pixels: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
    });
  } finally { await page.close(); }
}
try {
  const gpu = await capture('auto');
  const cpu = await capture('cpu');
  let maxDifference = 0;
  let different = 0;
  for (let index = 0; index < gpu.pixels.length; index += 1) {
    const difference = Math.abs(gpu.pixels[index] - cpu.pixels[index]);
    maxDifference = Math.max(maxDifference, difference);
    if (difference > 1) different += 1;
  }
  console.log(JSON.stringify({ gpuSize: [gpu.width, gpu.height], cpuSize: [cpu.width, cpu.height], maxDifference, different }, null, 2));
} finally { await browser.close(); }
