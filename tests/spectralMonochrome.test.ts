import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMonochromePipeline, renderMonochromeStages } from '../services/spectral/monochrome';
import { renderPortraStages } from '../services/spectral/portraPipeline';
import { solveMonochromeHoleDensity } from '../services/physical135/density';
import { FilmType } from '../types';
import trix from '../services/spectral/resources/kodak_tri_x_400-setup.json';
import tmax from '../services/spectral/resources/kodak_tmax_100-setup.json';
import acros from '../services/spectral/resources/fujifilm_neopan_acros_100_ii-setup.json';
import hp5 from '../services/spectral/resources/ilford_hp5_plus_400-setup.json';
import { readLittleEndianFloat64Npy } from './spectralNpy';

const resources = { kodak_tri_x_400: trix, kodak_tmax_100: tmax, fujifilm_neopan_acros_100_ii: acros, ilford_hp5_plus_400: hp5 };

function image(recipe: string) {
  const size = recipe === 'gray_ramp_16' ? 16 : 8;
  const pixels = new Float32Array(size * size * 3);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    pixels.set(recipe === 'gray_ramp_16' ? Array(3).fill(0.01 + x * 0.99 / (size - 1)) : [0.05, 0.4, 0.05], (y * size + x) * 3);
  }
  return { width: size, height: size, pixels };
}

describe('monochrome Multigrade resources', () => {
  for (const [id, resource] of Object.entries(resources)) {
    it(`${id} matches its own product film and Multigrade tone stages`, () => {
      const pipeline = createMonochromePipeline(resource);
      expect(pipeline.setup.resource.resourceKind).toBe('spectral-monochrome-setup');
      expect(pipeline.setup.resource.configuration.paperId).toBe('ilford_multigrade_iv_rc');
      expect(pipeline.print.normalization[0]).toBeCloseTo(pipeline.print.normalization[2], 15);
      for (const recipe of ['gray_ramp_16', 'green_patch_8']) {
        const actual = renderMonochromeStages(image(recipe), pipeline);
        for (const stage of ['filmRaw', 'negativeDensity', 'paperLogExposure', 'paperDensity', 'printRgb'] as const) {
          const expected = readLittleEndianFloat64Npy(resolve(`tests/fixtures/spectral/${id}-${recipe}-${stage}.npy`)).values;
          expect(actual[stage].length).toBe(expected.length);
          for (let index = 0; index < expected.length; index += 1) {
            expect(Math.abs(actual[stage][index] - expected[index]), `${id} ${recipe} ${stage}[${index}]`).toBeLessThanOrEqual(1e-6 + 1.5e-3 * Math.abs(expected[index]));
          }
        }
        let spread = 0;
        for (let pixel = 0; pixel < actual.printRgb.length / 3; pixel += 1) {
          spread = Math.max(spread, Math.abs(actual.printRgb[pixel * 3] - actual.printRgb[pixel * 3 + 1]), Math.abs(actual.printRgb[pixel * 3 + 2] - actual.printRgb[pixel * 3 + 1]));
        }
        expect(spread, `${id} silver-print neutrality`).toBeLessThan(0.002);
      }
    });
  }

  it('keeps physical perforation development separate from monochrome aperture support', () => {
    for (const resource of Object.values(resources)) {
      const pipeline = createMonochromePipeline(resource);
      const solution = solveMonochromeHoleDensity(pipeline.setup.arrays.filmChannelDensity, pipeline.setup.arrays.filmBaseDensity, pipeline.setup.arrays.filmSpectralValidMask);
      expect(solution.cmy.every(Number.isFinite)).toBe(true);
      expect(solution.maxBaseResidual).toBeLessThan(0.5);
      expect(solution.cmy.every(value => value < 0)).toBe(true);
    }
  });

  it('does not accept a color-negative setup as a product monochrome resource', () => {
    const invalid = structuredClone(trix) as unknown as Record<string, unknown>;
    (invalid.configuration as Record<string, unknown>).channelModel = 'color';
    expect(() => createMonochromePipeline(invalid)).toThrow('monochrome');
  });

  it('lists only exact product stocks', () => {
    expect(FilmType.FUJI_ACROS_II).toBe('FUJI ACROS II');
  });
});
