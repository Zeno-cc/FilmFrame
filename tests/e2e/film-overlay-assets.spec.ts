import { expect, test } from '@playwright/test';
import { REAL135_SPROCKET_MASK_URLS } from '../../services/filmSprocket';

test('every real 135 sprocket mask covers only the rebate bands', async ({ page }) => {
  await page.goto('/');
  const maskUrls = Object.values(REAL135_SPROCKET_MASK_URLS).filter((url): url is string => Boolean(url));
  const results = await page.evaluate(async urls => Promise.all(urls.map(async url => {
    const bitmap = await createImageBitmap(await fetch(url).then(response => response.blob()));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let coveredPixels = 0;
    let aperturePixels = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const alpha = data[(y * canvas.width + x) * 4 + 3];
        if (alpha > 0) {
          coveredPixels += 1;
          if (y >= 211 && y < 1011) aperturePixels += 1;
        }
      }
    }
    return { url, width: canvas.width, height: canvas.height, coveredPixels, aperturePixels };
  })), maskUrls);

  expect(results).toHaveLength(16);
  for (const result of results) {
    expect(result.width, result.url).toBe(1307);
    expect(result.height, result.url).toBe(1203);
    expect(result.coveredPixels, result.url).toBeGreaterThan(50_000);
    expect(result.aperturePixels, result.url).toBe(0);
  }
});

test('Ilford HP5 Plus template keeps every sprocket hole black', async ({ page }) => {
  await page.goto('/');
  const holeCenters = [
    [67, 131], [233, 131], [406, 131], [577, 131],
    [748, 131], [917, 130], [1084, 131], [1242, 131],
    [67, 1072], [234, 1072], [406, 1073], [577, 1073],
    [748, 1073], [917, 1074], [1084, 1074], [1242, 1075],
  ];
  const pixels = await page.evaluate(async centers => {
    const response = await fetch('/film-overlays/ilford-hp5-plus.png');
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return centers.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
  }, holeCenters);

  for (const [red, green, blue, alpha] of pixels) {
    expect([red, green, blue]).toEqual([0, 0, 0]);
    expect(alpha).toBe(255);
  }
});
