import { describe, expect, it } from 'vitest';
import { FilmType, type FilmSettings } from '../types';
import { portraResource } from '../services/spectral/resources/portraResource';
import { createPhysicalFilmPlan, FULL_FRAME_135, filmToCanvas, canvasToFilm } from '../services/physical135/plan';
import { nextPhysicalSeed, seedUnit } from '../services/physical135/seed';
import { STOCK_RESOURCES } from '../services/spectral/resources/stockResources';
import { blendFilmPresence, solveBaseCancelingHoleDensity } from '../services/physical135/density';
import { createPhysicalStripPlan, physicalStripFramePlan } from '../services/physical135/strip';

const settings: Pick<FilmSettings, 'brandText'> & Partial<Pick<FilmSettings,
  'frameRenderMode' | 'imagingMode' | 'edgeRenderMode' | 'physicalBacking'
  | 'physicalBodySeed' | 'physicalFrameSeed' | 'physicalFog' | 'physicalLeaks' | 'physicalStraighten'
>> = {
  brandText: FilmType.KODAK_PORTRA_400,
  frameRenderMode: 'real135' as const,
  imagingMode: 'spectral' as const,
  edgeRenderMode: 'physical135' as const,
  physicalBacking: 'open' as const,
  physicalBodySeed: 1,
  physicalFrameSeed: 1,
  physicalFog: 1,
  physicalLeaks: 0,
  physicalStraighten: 0,
};

function plan(patch: Partial<typeof settings> = {}) {
  return createPhysicalFilmPlan({
    filmType: FilmType.KODAK_PORTRA_400,
    settings: { ...settings, ...patch },
    orientation: 'landscape',
    gateWidth: FULL_FRAME_135.gateWidthMm,
    gateHeight: FULL_FRAME_135.gateHeightMm,
    pxPerMm: 20,
  });
}

describe('physical 135 planning', () => {
  it('preserves a coherent advance and eight registered perforations', () => {
    const result = plan();
    expect(result.film).toEqual({ s: 0, t: 0, width: 38, height: 35 });
    expect(result.gate.width).toBe(FULL_FRAME_135.gateWidthMm);
    expect(result.gate.height).toBe(FULL_FRAME_135.gateHeightMm);
    expect(result.perforations).toHaveLength(16);
    expect(result.perforations[0].width).toBe(1.98);
    expect(result.perforations[0].height).toBe(2.8);
    expect(result.perforations[1].center.s - result.perforations[0].center.s).toBeCloseTo(4.75, 12);
    expect(result.perforations.filter(hole => hole.center.t === 3.4)).toHaveLength(8);
    expect(result.perforations.filter(hole => hole.center.t === 31.6)).toHaveLength(8);
    expect(result.outputWidth).toBe(760);
    expect(result.outputHeight).toBe(700);
    expect(FULL_FRAME_135.perforationsPerAdvance).toBe(8);
  });

  it('maps portrait film coordinates once without transposing the plan twice', () => {
    const result = createPhysicalFilmPlan({
      settings,
      orientation: 'portrait',
      gateWidth: FULL_FRAME_135.gateWidthMm,
      gateHeight: FULL_FRAME_135.gateHeightMm,
      pxPerMm: 20,
    });
    expect(result.film).toEqual({ s: 0, t: 0, width: 38, height: 35 });
    expect(result.gate.width).toBe(FULL_FRAME_135.gateWidthMm);
    expect(result.gate.height).toBe(FULL_FRAME_135.gateHeightMm);
    expect(result.outputWidth).toBe(700);
    expect(result.outputHeight).toBe(760);
    expect(result.perforations[0].width).toBe(1.98);
    expect(result.perforations[0].height).toBe(2.8);
    expect(result.perforations[0].center.t).toBe(3.4);
    expect(result.perforations[0].center.s).toBeCloseTo(2.375 + result.body.perforationPhase, 12);
    expect(filmToCanvas(result, 10, 5)).toEqual({ s: 30, t: 10 });
    expect(filmToCanvas(result, 10, 0)).toEqual({ s: 35, t: 10 });
    expect(canvasToFilm(result, 30, 10)).toEqual({ s: 10, t: 5 });
    expect(canvasToFilm(result, 35, 10)).toEqual({ s: 10, t: 0 });
  });

  it('keeps body and frame seed domains independent', () => {
    const same = plan();
    expect(plan()).toEqual(same);
    const nextBody = plan({ physicalBodySeed: nextPhysicalSeed(1) });
    expect(nextBody.body).not.toEqual(same.body);
    expect(nextBody.frame).toEqual(same.frame);
    const nextFrame = plan({ physicalFrameSeed: nextPhysicalSeed(1) });
    expect(nextFrame.frame).not.toEqual(same.frame);
    expect(nextFrame.body).toEqual(same.body);
    expect(seedUnit(1, 'body', 0)).not.toBe(seedUnit(1, 'frame', 0));
  });

  it('keeps straightening invertible for photo, imprints and perforations', () => {
    const result = plan({ physicalStraighten: 2.5 });
    for (const point of [{ s: 10, t: 5 }, { s: 20, t: 31.6 }, { s: 37, t: 1 }]) {
      const mapped = filmToCanvas(result, point.s, point.t);
      expect(canvasToFilm(result, mapped.s, mapped.t).s).toBeCloseTo(point.s, 10);
      expect(canvasToFilm(result, mapped.s, mapped.t).t).toBeCloseTo(point.t, 10);
    }
    expect(filmToCanvas(result, 10, 5)).not.toEqual({ s: 10, t: 5 });
  });

  it('uses one local scan transform for equal strip frame seeds', () => {
    const input = { ...settings, physicalStraighten: 1.5, processingMode: 'preview' as const };
    const strip = createPhysicalStripPlan(input, 2);
    const first = physicalStripFramePlan(strip, 0, { physicalFrameSeed: 1 }, input);
    const second = physicalStripFramePlan(strip, 1, { physicalFrameSeed: 1 }, input);
    for (const point of [{ s: 0.02, t: 30.14 }, { s: 20, t: 12 }, { s: 37.98, t: 1 }]) {
      const firstMapped = filmToCanvas(first, point.s, point.t);
      const secondMapped = filmToCanvas(second, point.s, point.t);
      const firstRoundTrip = canvasToFilm(first, firstMapped.s, firstMapped.t);
      const secondRoundTrip = canvasToFilm(second, secondMapped.s, secondMapped.t);
      expect(secondRoundTrip.s).toBeCloseTo(firstRoundTrip.s, 10);
      expect(secondRoundTrip.t).toBeCloseTo(firstRoundTrip.t, 10);
    }
  });

  it('rejects classic-border combinations and unvalidated spectral stocks', () => {
    expect(() => plan({ frameRenderMode: 'classic' })).toThrow('需要启用 135 画幅');
    expect(() => createPhysicalFilmPlan({
      filmType: FilmType.CINESTILL_800T,
      settings,
      orientation: 'landscape', gateWidth: 36, gateHeight: 24, pxPerMm: 20,
    })).toThrow('物理孔密度未通过验收');
    expect(plan({ imagingMode: 'legacy' }).kind).toBe('geometry-compatibility');
  });
});

describe('base-canceling perforation density', () => {
  it('cancels the film base before paper exposure', () => {
    const channel = [
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ];
    const base = [0.2, 0.15, 0.12];
    const solution = solveBaseCancelingHoleDensity(channel, base, [1, 1, 1]);
    expect(solution.validWavelengths).toBe(3);
    expect(solution.maxBaseResidual).toBeLessThan(1e-12);
    const negative = [0.8, 0.5, 0.3, 0.2, 0.4, 0.6];
    expect(blendFilmPresence(negative, [1, 0], solution.cmy)).toEqual(new Float32Array([
      0.8, 0.5, 0.3, ...solution.cmy.map(value => Math.fround(value)),
    ]));
  });

  it('solves the actual Portra dye/base data without a hardcoded hole color', () => {
    const solution = solveBaseCancelingHoleDensity(
      portraResource.arrays.filmChannelDensity.values,
      portraResource.arrays.filmBaseDensity.values,
      portraResource.arrays.filmSpectralValidMask.values,
    );
    expect(solution.validWavelengths).toBeGreaterThan(3);
    expect(solution.cmy.every(Number.isFinite)).toBe(true);
    expect(solution.maxBaseResidual).toBeLessThan(0.4);
    expect(solution.cmy).not.toEqual([0, 0, 0]);
  });

  it('matches the independently solved Pro 400H hole density without an upstream rejection gate', () => {
    const resource = STOCK_RESOURCES.fujiPro400h;
    const solution = solveBaseCancelingHoleDensity(
      resource.arrays.filmChannelDensity.values,
      resource.arrays.filmBaseDensity.values,
      resource.arrays.filmSpectralValidMask.values,
    );
    // Independent NumPy least-squares on the pinned upstream profile's finite
    // samples. Upstream uses these values without a residual acceptance gate.
    for (const [index, expected] of [-0.15987999377865675, -0.6212653381170062, -1.0281100912279255].entries()) {
      expect(solution.cmy[index]).toBeCloseTo(expected, 12);
    }
    expect(solution.validWavelengths).toBe(64);
    expect(solution.maxBaseResidual).toBeCloseTo(0.9707583357910277, 12);
  });

  it('validates hole-density residuals as measurements, not a stock-specific rejection threshold', () => {
    for (const [id, resource] of Object.entries(STOCK_RESOURCES)) {
      const solution = solveBaseCancelingHoleDensity(
        resource.arrays.filmChannelDensity.values,
        resource.arrays.filmBaseDensity.values,
        resource.arrays.filmSpectralValidMask.values,
      );
      if (id === 'fujiPro400h') {
        expect(solution.maxBaseResidual).toBeGreaterThanOrEqual(0.5);
        continue;
      }
      expect(solution.maxBaseResidual, id).toBeLessThan(0.5);
      expect(blendFilmPresence([0.6, 0.4, 0.2, 0.3, 0.5, 0.7], [1, 0], solution.cmy).slice(0, 3))
        .toEqual(new Float32Array([0.6, 0.4, 0.2]));
      expect(Array.from(blendFilmPresence([0.6, 0.4, 0.2], [0], solution.cmy)))
        .toEqual(solution.cmy.map(value => Math.fround(value)));
    }
  });

  it('matches an independent overdetermined least-squares residual', () => {
    const channel = [
      0.8, 0.1, 0.05,
      0.1, 0.65, 0.1,
      0.04, 0.12, 0.55,
      0.6, 0.15, 0.03,
    ];
    const base = [0.2, 0.15, 0.12, 0.25];
    const solution = solveBaseCancelingHoleDensity(channel, base, [1, 1, 1, 1]);
    expect(solution.cmy[0]).toBeCloseTo(-0.27039504197919184, 12);
    expect(solution.cmy[1]).toBeCloseTo(-0.1758954701837982, 12);
    expect(solution.cmy[2]).toBeCloseTo(-0.1565404642641629, 12);
    expect(solution.maxBaseResidual).toBeCloseTo(0.0566824403569903, 12);
    const negative = [0.8, 0.5, 0.3, 0.2, 0.4, 0.6];
    const exactSolution = solveBaseCancelingHoleDensity(
      [1, 0, 0, 0, 1, 0, 0, 0, 1], [0.1, 0.1, 0.1], [1, 1, 1],
    );
    const result = blendFilmPresence([0.9, 0.8, 0.7], [0.25], exactSolution.cmy);
    expect(result[0]).toBeCloseTo(0.25 * 0.9 + 0.75 * -0.1, 6);
    expect(() => blendFilmPresence([0.9, 0.8, 0.7], [1.2], solution.cmy)).toThrow('[0, 1]');
    expect(() => solveBaseCancelingHoleDensity([1, 1], [0.1], [1])).toThrow('dimensions');
  });
});
