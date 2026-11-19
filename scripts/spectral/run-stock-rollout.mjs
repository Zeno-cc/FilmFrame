import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { selectFilmStock } from '../../tests/e2e/stockPicker.ts';
import { getRecipeInspector, selectRecipeControl } from '../../tests/e2e/recipeControls.ts';

const stocks = [
  ['KODAK PORTRA 160', 'kodak_portra_160'],
  ['KODAK PORTRA 400', 'kodak_portra_400'],
  ['KODAK PORTRA 800', 'kodak_portra_800'],
  ['KODAK EKTAR 100', 'kodak_ektar_100'],
  ['KODAK GOLD 200', 'kodak_gold_200'],
  ['GC 400 KODAK', 'kodak_ultramax_400'],
  ['FUJI C200', 'fujifilm_c200'],
  ['FUJI X-TRA 400', 'fujifilm_xtra_400'],
  ['FUJI PRO 400H', 'fujifilm_pro_400h'],
  ['KODAK VISION3 50D', 'kodak_vision3_50d'],
  ['KODAK VISION3 200T', 'kodak_vision3_200t'],
  ['KODAK VISION3 250D', 'kodak_vision3_250d'],
  ['KODAK VISION3 500T', 'kodak_vision3_500t'],
];
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const errors = [];
  for (const [filmType, profileId] of stocks) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(`${filmType}: ${error.message}`));
    await page.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles('public/film-overlays/aperture-mask-derived.png');
    const inspector = getRecipeInspector(page);
    await selectFilmStock(inspector,filmType);
    await selectRecipeControl(page, '成像方式', 'spectral');
    await selectRecipeControl(page, '光谱计算', 'cpu');
    await inspector.getByLabel('颗粒强度').fill('0');
    await page.getByRole('button', { name: /冲洗待更新照片|重新冲洗全部/ }).click();
    await page.getByRole('img', { name: '已出片' }).waitFor({ timeout: 60000 });
    const processed = page.getByRole('img', { name: 'aperture-mask-derived.png' });
    const src = await processed.getAttribute('src');
    const dimensions = await processed.evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight }));
    results.push({ filmType, profileId, rendered: src?.startsWith('blob:'), dimensions });
    await page.close();
  }
  await writeFile('.trellis/tasks/11-06-spectral-negative-stock-rollout/research/filmframe-stock-rendering.json', JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
