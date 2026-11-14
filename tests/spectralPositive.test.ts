import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPositivePipeline, decodePositiveSetupResource, developPositiveFilm, renderPositiveStages, verifyPositiveResourceDigests } from '../services/spectral/positive';
import { createPortraPipeline } from '../services/spectral/portraPipeline';
import { portraResource } from '../services/spectral/resources/portraResource';
import provia from '../services/spectral/resources/fujifilm_provia_100f-setup.json';
import velvia from '../services/spectral/resources/fujifilm_velvia_100-setup.json';
import ektachrome from '../services/spectral/resources/kodak_ektachrome_100-setup.json';
import kodachrome from '../services/spectral/resources/kodak_kodachrome_64-setup.json';
import { readLittleEndianFloat64Npy } from './spectralNpy';
import { decodeSrgbChannel, srgbByteToLinearProPhoto } from '../services/spectral/inputColor';
import { multiply3 } from '../services/spectral/math';

const resources = { fujifilm_provia_100f: provia, fujifilm_velvia_100: velvia, kodak_ektachrome_100: ektachrome, kodak_kodachrome_64: kodachrome };

function image(recipe: string) {
  const size = recipe === 'gray_ramp_16' ? 16 : 8;
  const pixels = new Float32Array(size * size * 3);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const rgb = recipe === 'gray_ramp_16' ? Array(3).fill(0.01 + x * 0.99 / (size - 1)) : [0.05, 0.4, 0.05];
    pixels.set(rgb, (y * size + x) * 3);
  }
  return { width: size, height: size, pixels };
}

function expectClose(actual: Float32Array, expected: Float64Array) {
  expect(actual.length).toBe(expected.length);
  let maximum = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const difference = Math.abs(actual[index] - expected[index]);
    maximum = Math.max(maximum, difference);
    expect(difference).toBeLessThanOrEqual(1e-5 + 2e-3 * Math.abs(expected[index]));
  }
  return maximum;
}

describe('positive direct film scan', () => {
  for (const [id, resource] of Object.entries(resources)) {
    it(`${id} matches its own develop and direct-scan references`, () => {
      const pipeline = createPositivePipeline(resource);
      expect(pipeline.setup.resource.configuration.filmId).toBe(id);
      for (const recipe of ['gray_ramp_16', 'green_patch_8']) {
        const result = renderPositiveStages(image(recipe), pipeline);
        for (const [stage, actual] of [['filmRaw', result.filmRaw], ['positiveDensity', result.positiveDensity], ['scanRgb', result.scanRgb]] as const) {
          expectClose(actual, readLittleEndianFloat64Npy(resolve(`tests/fixtures/spectral/${id}-${recipe}-${stage}.npy`)).values);
        }
      }
    });
  }

  it('uses silver density rather than negative normalized density for DIR', () => {
    const pipeline = createPositivePipeline(provia);
    const raw = new Float32Array([0, 0.2, 0.4]);
    const actual = developPositiveFilm(pipeline.setup, pipeline.densityMax, raw);
    const negativePipeline = createPortraPipeline(portraResource);
    const negative = developPositiveFilm(negativePipeline.setup, [0, 0, 0], raw);
    expect(actual).not.toEqual(negative);
  });

  it('uses the inverse reference transform for real sRGB input', () => {
    const pipeline = createPositivePipeline(provia);
    const actual = srgbByteToLinearProPhoto(pipeline.setup, 64, 128, 191);
    const expected = multiply3(pipeline.setup.arrays.srgbToProPhoto, [64, 128, 191].map(value => decodeSrgbChannel(value / 255)) as unknown as readonly [number, number, number]);
    expect(actual).toEqual(expected);
    expect(actual.every(Number.isFinite)).toBe(true);
  });

  it('retains positive identity through lazy-load digest verification', async () => {
    const pipeline = createPositivePipeline(provia);
    await expect(verifyPositiveResourceDigests(pipeline.setup.resource)).resolves.toBeUndefined();
  });

  it('rejects a negative setup or an indirect scan as positive', () => {
    expect(() => decodePositiveSetupResource(portraResource)).toThrow('positive');
    const invalid = structuredClone(provia) as unknown as Record<string, unknown>;
    (invalid.configuration as Record<string, unknown>).directFilmScan = false;
    expect(() => decodePositiveSetupResource(invalid)).toThrow('positive');
  });
});
