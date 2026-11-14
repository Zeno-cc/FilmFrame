import { describe, expect, it } from 'vitest';
import vision500tJson from '../services/spectral/resources/kodak_vision3_500t-setup.json';
import type { PortraSetupResource } from '../services/spectral/types';

const vision500t = vision500tJson as unknown as PortraSetupResource;
import { applyCineStillHeadroom, applyCineStillBackReflection, applyCineStillHalation, createCineStillPipeline, loadCineStillStockResource } from '../services/spectral/cineStill';
import { CINESTILL_SIGMA_OVER_BASE, CINESTILL_WEIGHTS } from '../services/spectral/cineStillModel';
import { createPortraPipeline, renderPortraStages } from '../services/spectral/portraPipeline';
import { verifyPortraResourceDigests } from '../services/spectral/setup';
import { FilmType } from '../types';
import { spectralStockForFilm } from '../services/spectral/stockRegistry';

describe('CineStill no-rem-jet exposure', () => {
  it('uses the whole-frame maximum and preserves the color ratios of clipped highlights', () => {
    const pixels = new Float32Array([
      0.184, 0.184, 0.184,
      0.184 * 2 ** 2, 0.184 * 2 ** 2, 0.184 * 2 ** 2,
      8, 4, 2,
    ]);
    const result = applyCineStillHeadroom({ width: 3, height: 1, pixels }, 4);
    expect(result.clip).toBe(8);
    expect(Array.from(result.pixels.slice(0, 3))).toEqual([pixels[0], pixels[1], pixels[2]]);
    expect(Array.from(result.pixels.slice(3, 6))).toEqual([pixels[3], pixels[4], pixels[5]]);
    expect(result.pixels[6]).toBeCloseTo(128, 5);
    expect(result.pixels[7] / result.pixels[6]).toBeCloseTo(0.5, 6);
    expect(result.pixels[8] / result.pixels[6]).toBeCloseTo(0.25, 6);
    expect(applyCineStillHeadroom({ width: 3, height: 1, pixels }, 0).pixels).toEqual(pixels);
  });

  it('retains signed Gaussian weights and the source 120um base scale', () => {
    const pipeline = createCineStillPipeline(vision500t);
    expect(pipeline.filmKind).toBe('cineStill');
    expect(pipeline.setup.resource.configuration.filmId).toBe('cinestill_800t');
    expect(pipeline.setup.resource.configuration.paperId).toBe('kodak_2383');
    expect(pipeline.spatial.baseProfileId).toBe('kodak_vision3_500t');
    expect(CINESTILL_WEIGHTS.flat()).toContain(-0.5);
    const plan = pipeline.spatial.plan(2064, 1366);
    expect(plan.baseThicknessPx).toBeCloseTo(120 / (36000 / 2064), 10);
    expect(plan.components[3].sigma[1]).toBeCloseTo(CINESTILL_SIGMA_OVER_BASE[3][1] * plan.baseThicknessPx, 10);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(CINESTILL_WEIGHTS.reduce((sum, weights) => sum + weights[channel], 0)).toBeCloseTo(1, 5);
    }
    expect(CINESTILL_SIGMA_OVER_BASE).toHaveLength(4);
  });

  it('creates a normalized reflected-edge blur, with a brighter ring than its gap', () => {
    const width = 128;
    const height = 128;
    const pixels = new Float32Array(width * height * 3);
    pixels.set([1, 1, 1], ((height / 2) * width + width / 2) * 3);
    const pipeline = createCineStillPipeline({ ...vision500t, configuration: { ...vision500t.configuration, spatialScale: 16 } });
    const spatial = pipeline.spatial;
    expect(spatial.plan(width, height).baseThicknessPx).toBeCloseTo(120 / (36000 / 2048), 10);
    const halo = applyCineStillBackReflection({ width, height, pixels }, spatial);
    const at = (x: number, y: number) => halo.pixels[(y * width + x) * 3];
    // Independently recomputed with NumPy from the pinned table, separable truncate-3 FIR.
    expect(at(64, 64)).toBeCloseTo(0.7701923492596705, 6);
    expect(at(69, 64)).toBeCloseTo(0.00003310490411804911, 8);
    expect(at(77, 64)).toBeCloseTo(0.00009418537770675312, 8);
    expect(at(77, 64)).toBeGreaterThan(2 * at(69, 64));
    const flat = applyCineStillHalation({ width: 8, height: 8, pixels: new Float32Array(8 * 8 * 3).fill(0.25) }, spatial, { headroomEv: 0 });
    expect(flat.pixels[0]).toBeCloseTo(0.25, 5);
    expect(flat.pixels.every(Number.isFinite)).toBe(true);
  });

  it('does not silently substitute the ordinary Vision3 render', async () => {
    const pipeline = await loadCineStillStockResource();
    expect(pipeline.setup.resource.resourceKind).toBe('spectral-cinestill-setup');
    await expect(verifyPortraResourceDigests(pipeline.setup.resource)).resolves.toBeUndefined();
    expect(spectralStockForFilm(FilmType.CINESTILL_800T)?.status).toBe('add');
    const ordinary = createPortraPipeline(vision500t);
    const input = { width: 3, height: 1, pixels: new Float32Array([0.184, 0.184, 0.184, 1, 0.5, 0.25, 0.184, 0.184, 0.184]) };
    const cineStill = pipeline.render(input);
    expect(cineStill.printRgb).not.toEqual(renderPortraStages(input, ordinary).printRgb);
  });
});
