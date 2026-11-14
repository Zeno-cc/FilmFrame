import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpectralBackend } from '../services/spectral/backend';
import { createPortraPipeline } from '../services/spectral/portraPipeline';
import { createPositivePipeline, renderPositiveStages } from '../services/spectral/positive';
import { createMonochromePipeline, renderMonochromeStages } from '../services/spectral/monochrome';
import * as film from '../services/spectral/film';
import { portraResource } from '../services/spectral/resources/portraResource';
import provia from '../services/spectral/resources/fujifilm_provia_100f-setup.json';
import hp5 from '../services/spectral/resources/ilford_hp5_plus_400-setup.json';
import type { RenderLimits, RgbImage } from '../services/spectral/types';

const negative = createPortraPipeline(portraResource);
const positive = createPositivePipeline(provia);
const monochrome = createMonochromePipeline(hp5);
const onePixel: RgbImage = { width: 1, height: 1, pixels: new Float32Array([0.2, 0.2, 0.2]) };
const receiverBytes = 81 * 3 * 8;

afterEach(() => vi.restoreAllMocks());

const cases: { name: string; planes: number; render(image: RgbImage, limits: RenderLimits): Promise<Float32Array> }[] = [
  {
    name: 'physical negative', planes: 7,
    async render(image, limits) {
      const backend = createSpectralBackend({ pipeline: negative, prefer: 'cpu', limits });
      try {
        const frame = await backend.render(image, new Float32Array(image.width * image.height).fill(1), [0, 0, 0]);
        try { return backend.readRgb(frame); }
        finally { backend.release(frame); }
      } finally { backend.dispose(); }
    },
  },
  { name: 'positive', planes: 4, async render(image, limits) { return renderPositiveStages(image, positive, limits).scanRgb; } },
  { name: 'monochrome', planes: 7, async render(image, limits) { return renderMonochromeStages(image, monochrome, limits).printRgb; } },
];

describe.each(cases)('$name CPU render limits', ({ planes, render }) => {
  const exactBytes = planes * 3 * 4 + receiverBytes;

  it('rejects one byte below its working set before exposing any stage', async () => {
    const expose = vi.spyOn(film, 'exposeFilm');
    await expect(render(onePixel, { maxPixels: 1, maxWorkingSetBytes: exactBytes - 1 })).rejects.toThrow('working set');
    expect(expose).not.toHaveBeenCalled();
  });

  it('accepts the exact working-set boundary and retains numerical output', async () => {
    const expected = await render(onePixel, { maxPixels: 1, maxWorkingSetBytes: exactBytes + 1024 });
    const actual = await render(onePixel, { maxPixels: 1, maxWorkingSetBytes: exactBytes });
    expect(actual).toEqual(expected);
    expect(actual).toHaveLength(3);
    expect(actual.every(Number.isFinite)).toBe(true);
  });

  it('rejects over-pixel-budget input before exposing any stage', async () => {
    const expose = vi.spyOn(film, 'exposeFilm');
    await expect(render({ width: 2, height: 1, pixels: new Float32Array(6) }, {
      maxPixels: 1, maxWorkingSetBytes: exactBytes * 2,
    })).rejects.toThrow('pixel budget');
    expect(expose).not.toHaveBeenCalled();
  });

  it('rejects invalid limits before exposing any stage', async () => {
    const expose = vi.spyOn(film, 'exposeFilm');
    for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(render(onePixel, { maxPixels: invalid, maxWorkingSetBytes: exactBytes })).rejects.toThrow('positive safe integers');
      await expect(render(onePixel, { maxPixels: 1, maxWorkingSetBytes: invalid })).rejects.toThrow('positive safe integers');
    }
    expect(expose).not.toHaveBeenCalled();
  });

  it('rejects malformed and non-finite RGB before exposing any stage', async () => {
    const expose = vi.spyOn(film, 'exposeFilm');
    const limits = { maxPixels: 1, maxWorkingSetBytes: exactBytes };
    await expect(render({ ...onePixel, pixels: new Float32Array(2) }, limits)).rejects.toThrow('packed Float32Array RGB');
    await expect(render({ ...onePixel, pixels: new Float32Array([0, Number.NaN, 0]) }, limits)).rejects.toThrow('Non-finite spectral input');
    expect(expose).not.toHaveBeenCalled();
  });
});
