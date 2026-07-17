import { expect, test } from '@playwright/test';

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
