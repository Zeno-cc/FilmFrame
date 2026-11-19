import type { Page } from '@playwright/test';

export type ImageSignature = {
  width: number;
  height: number;
  pixels: string;
  file: string;
  blocks: number[];
};

/**
 * Worker and main-thread routes both resample through a 2D canvas, but
 * OffscreenCanvas and HTMLCanvasElement are not required to resample
 * bit-identically, and the spectral step then amplifies that. Comparing 8x8
 * block means keeps a route comparison diagnosable: a structural difference
 * such as an edge only one route draws moves blocks by tens of units, while a
 * resampling difference stays near 1-2.
 */
export async function readImageSignature(target: Page, accessibleName: string): Promise<ImageSignature> {
  return target.getByRole('img', { name: accessibleName }).evaluate(async element => {
    const bytes = await (await fetch((element as HTMLImageElement).currentSrc)).arrayBuffer();
    const fileDigest = await crypto.subtle.digest('SHA-256', bytes);
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing output inspection canvas');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const pixelDigest = await crypto.subtle.digest('SHA-256', pixels);
    const hex = (digest: ArrayBuffer) =>
      Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const block = 8;
    const columns = Math.ceil(bitmap.width / block);
    const rows = Math.ceil(bitmap.height / block);
    const blocks: number[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        let sum = 0;
        let count = 0;
        for (let y = row * block; y < Math.min((row + 1) * block, bitmap.height); y += 1) {
          for (let x = column * block; x < Math.min((column + 1) * block, bitmap.width); x += 1) {
            const index = (y * bitmap.width + x) * 4;
            sum += pixels[index] + pixels[index + 1] + pixels[index + 2];
            count += 3;
          }
        }
        blocks.push(count ? sum / count : 0);
      }
    }
    return { width: bitmap.width, height: bitmap.height, pixels: hex(pixelDigest), file: hex(fileDigest), blocks };
  });
}

export function blockDifference(a: ImageSignature, b: ImageSignature) {
  const size = Math.min(a.blocks.length, b.blocks.length);
  let maxAbs = 0;
  let sum = 0;
  for (let index = 0; index < size; index += 1) {
    const delta = Math.abs(a.blocks[index] - b.blocks[index]);
    if (delta > maxAbs) maxAbs = delta;
    sum += delta;
  }
  return { maxAbs, meanAbs: size ? sum / size : 0, compared: size };
}
