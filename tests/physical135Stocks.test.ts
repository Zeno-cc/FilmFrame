import { describe, expect, it, vi } from 'vitest';
import { FilmType, type FilmSettings } from '../types';
import { physicalEdgeForFilm } from '../services/physical135/edgeRegistry';
import { createCinestillImprints, createFujiImprints, createIlfordImprints, createVisionImprints } from '../services/physical135/edgeLayouts';
import { createKodakImprints } from '../services/physical135/kodakEdge';
import { createPhysicalImprints } from '../services/physical135/canvas';
import { physicalPlanForSettings } from '../services/physical135/frame';
import { createPhysicalStripPlan, physicalStripFramePlan, renderPhysicalStripCanvas } from '../services/physical135/strip';
import { physicalEdgeExposureAtPoint, physicalImprintExposure } from '../services/physical135/spectralAdapter';
import { nextPhysicalSeed } from '../services/physical135/seed';
import { canvasToFilm } from '../services/physical135/plan';
import { assertPhysicalCombination } from '../services/physical135/plan';
import { supportsSpectralStock } from '../services/spectral/stockRegistry';
import { supportsPhysicalSpectralStock } from '../services/physical135/capability';

describe('stock-specific physical 135 edge identities', () => {
  it('rejects unknown stocks at both spectral capability boundaries', () => {
    const unknown = 'UNKNOWN STOCK' as FilmType;
    expect(supportsSpectralStock(unknown)).toBe(false);
    expect(supportsPhysicalSpectralStock(unknown)).toBe(false);
  });
  it('does not inherit Kodak imprints or DX across manufacturers', () => {
    for (const stock of [FilmType.KODAK_COLORPLUS_200, FilmType.KODAK_PROIMAGE_100]) {
      const imprints = createKodakImprints(stock, 1, -3.3);
      expect(imprints.filter(op => op.kind === 'rect')).toHaveLength(0);
      expect(physicalEdgeForFilm(stock)?.dx).toBeUndefined();
    }
    expect(physicalEdgeForFilm(FilmType.FUJI_XTRA_400)).toMatchObject({ kind: 'fuji-negative', text: 'S-400', dx: 628, dxLength: 14.1 });
    for (const stock of [FilmType.KODAK_PORTRA_800_PUSH1, FilmType.KODAK_PORTRA_800_PUSH2]) {
      expect(physicalEdgeForFilm(stock)).toMatchObject({ kind: 'kodak', text: 'KODAK PORTRA 800-3', dx: 1278 });
      expect(supportsPhysicalSpectralStock(stock)).toBe(true);
    }
    expect(physicalEdgeForFilm(FilmType.KODAK_VISION3_500T)?.dx).toBeUndefined();
    expect(physicalEdgeForFilm(FilmType.CINESTILL_800T)?.dx).toBeUndefined();
    expect(physicalEdgeForFilm(FilmType.ILFORD_HP5)).toMatchObject({ kind: 'ilford', text: 'ILFORD HP5 PLUS', dx: 1753, dxLength: 13.06 });
    expect(physicalEdgeForFilm(FilmType.FUJI_PRO_400H)?.dx).toBe(584);
    expect(physicalEdgeForFilm(FilmType.FUJI_SUPERIA)?.dx).toBeUndefined();
  });

  it('uses Fuji dot imprints and Vision3 dashes rather than Kodak bars', () => {
    const fuji = createFujiImprints(FilmType.FUJI_XTRA_400, 1, -3.3, 0.875, 0);
    const name = fuji.filter(op => op.kind === 'dot' && op.t > 0.55 && op.t < 0.56);
    expect(name.length).toBeGreaterThan(0);
    expect(new Set(name.map(op => op.t.toFixed(6))).size).toBe(1);
    expect(new Set(name.map(op => op.s.toFixed(6))).size).toBeGreaterThan(3);
    expect(fuji.filter(op => op.kind === 'dot' && op.t > 0.55 && op.t < 1.55).length).toBeGreaterThan(0);
    const superia = createFujiImprints(FilmType.FUJI_SUPERIA, 1, -3.3, 0.875, 0);
    const label = superia.filter(op => op.kind === 'dot' && op.t > 0.55 && op.t < 1.55 && op.s >= 21 && op.s < 32);
    const nextNumber = -3.3 + 0.62 + 19 + 16.38;
    expect(label.every(op => op.s < nextNumber - 0.5)).toBe(true);
    expect(fuji.some(op => op.kind === 'rect' && op.s >= 0 && op.s < 38)).toBe(true);
    const vision = createVisionImprints(FilmType.KODAK_VISION3_500T, -3.3, 0.875, 0);
    expect(vision.some(op => op.kind === 'rect' && op.s1! - op.s < 0.2)).toBe(true);
    expect(vision.some(op => op.kind === 'rect' && Math.abs(op.s1! - op.s - 1.16) < 1e-8)).toBe(true);
  });

  it('keeps Ilford DX module bounds and 180-degree text orientation after turning', () => {
    const perfPhase = -3.3;
    const ilford = createIlfordImprints(FilmType.ILFORD_HP5, 1, perfPhase, 0.875, 0);
    const dx = ilford.filter(op => op.kind === 'rect');
    expect(dx.length).toBeGreaterThan(0);
    expect(dx.every(op => op.s1! >= op.s && op.t1! >= op.t)).toBe(true);
    expect(dx.every(op => op.s1! - op.s <= 13.06 * 5 / 31 + 1e-8)).toBe(true);
    const codeEnds = dx.filter(op => op.s1! - op.s > 13.06 * 4.9 / 31).map(op => op.s1!).sort((a, b) => a - b);
    expect(codeEnds.length).toBeGreaterThan(1);
    for (let index = 1; index < codeEnds.length; index += 1) expect(codeEnds[index] - codeEnds[index - 1]).toBeCloseTo(19, 8);
    expect(codeEnds.every(end => Math.abs((end - perfPhase - 2.85) / 19 - Math.round((end - perfPhase - 2.85) / 19)) < 1e-8)).toBe(true);
    expect(ilford.some(op => op.kind === 'rect' && op.t > 33)).toBe(true);
    expect(ilford.every(op => op.kind !== 'text' && op.kind !== 'dot')).toBe(true);
  });

  it('keeps CineStill names continuous across an advance boundary and uses its stepped arrow', () => {
    const cinestill = createCinestillImprints(FilmType.CINESTILL_800T, 1, -3.3, 0.875, 0);
    const name = cinestill.filter(op => op.kind === 'rect' && op.t < 2 && op.s < 0.1 && op.s1! > 0 && op.s1! - op.s < 0.3);
    expect(name.length).toBeGreaterThan(0);
    expect(name.every(op => op.s1! - op.s > 0.1)).toBe(true);
    expect(cinestill.some(op => op.kind === 'text' && op.s >= 0 && op.s <= 38)).toBe(true);
    expect(cinestill.some(op => op.kind === 'rect' && op.s >= 0 && op.s <= 38
      && Math.abs(op.s1! - op.s - 0.38) < 1e-8)).toBe(true);
    expect(cinestill.some(op => op.kind === 'text' && op.text?.endsWith('A'))).toBe(true);
    expect(cinestill.every(op => Number.isFinite(op.s))).toBe(true);
  });

  it('keeps each global DX interval identical across strip frame windows', () => {
    const settings = { brandText: FilmType.KODAK_GOLD_200, frameNumber: 1, frameRenderMode: 'real135' as const, imagingMode: 'spectral' as const, edgeRenderMode: 'physical135' as const, processingMode: 'preview' as const };
    const plan = createPhysicalStripPlan(settings, 3);
    const first = createPhysicalImprints(plan, settings);
    const second = createPhysicalImprints(plan, { ...settings, frameNumber: 2 });
    expect(second).not.toEqual(first);
    const window = createPhysicalImprints({ ...plan, imprintSpanMm: undefined }, settings);
    const interval = (op: (typeof first)[number]) => [Math.floor(op.s / 19), op.s % 19, op.s1! % 19, op.t, op.t1] as const;
    const bars = (imprints: typeof first, origin: number) => imprints.filter(op => op.kind === 'rect' && op.s >= origin && op.s1! <= origin + 38).map(interval);
    expect(bars(window, 0)).toEqual(bars(first, 0));
    const secondWindow = createPhysicalImprints({ ...plan, advanceOriginS: 38, imprintSpanMm: undefined }, settings);
    expect(bars(secondWindow, 38)).toEqual(bars(first, 38));
  });

  it('keeps spectral edge exposure continuous across strip windows', () => {
    const settings = { brandText: FilmType.KODAK_GOLD_200, frameNumber: 1, frameRenderMode: 'real135' as const, imagingMode: 'spectral' as const, edgeRenderMode: 'physical135' as const, processingMode: 'preview' as const, physicalFog: 1, physicalLeaks: 0 };
    const plan = createPhysicalStripPlan(settings, 3);
    const first = physicalEdgeExposureAtPoint(plan, 37.98, 34.96);
    const second = physicalEdgeExposureAtPoint({ ...plan, advanceOriginS: 38 }, -0.02, 34.96);
    expect(second.fog).toBeCloseTo(first.fog, 12);
    expect(second.leak).toBeCloseTo(first.leak, 12);
  });

  it('keeps generated frame seeds unsigned for edge fog noise', () => {
    const settings = { brandText: FilmType.KODAK_GOLD_200, frameNumber: 1, frameRenderMode: 'real135' as const, imagingMode: 'spectral' as const, edgeRenderMode: 'physical135' as const, processingMode: 'preview' as const, physicalFog: 1, physicalLeaks: 1, physicalFrameSeed: nextPhysicalSeed(1) };
    const plan = createPhysicalStripPlan(settings, 1);
    const exposure = physicalEdgeExposureAtPoint(plan, -0.1, 0.1);
    expect(Number.isFinite(exposure.fog)).toBe(true);
    expect(Number.isFinite(exposure.leak)).toBe(true);
    expect(exposure.fog).toBeCloseTo(physicalEdgeExposureAtPoint({ ...plan, advanceOriginS: -38 }, 37.9, 0.1).fog, 12);
  });

  it('keeps roll edge exposure independent of photo seed and crop origin', () => {
    const settings = { brandText: FilmType.KODAK_GOLD_200, frameNumber: 1, frameRenderMode: 'real135' as const, imagingMode: 'spectral' as const, edgeRenderMode: 'physical135' as const, processingMode: 'preview' as const, physicalFog: 1, physicalLeaks: 1, physicalFrameSeed: 1 };
    const strip = createPhysicalStripPlan(settings, 2);
    const left = physicalStripFramePlan(strip, 0, { physicalFrameSeed: 1 }, settings);
    const right = physicalStripFramePlan(strip, 1, { physicalFrameSeed: 7 }, settings);
    const a = physicalEdgeExposureAtPoint(left, 38.02, 0.1);
    const b = physicalEdgeExposureAtPoint(right, 0.02, 0.1);
    expect(b.fog).toBeCloseTo(a.fog, 12);
    expect(b.leak).toBeCloseTo(a.leak, 12);
  });

  it('samples fog from both physical film edges in portrait coordinates', () => {
    const settings = { brandText: FilmType.KODAK_PORTRA_400, frameNumber: 1, frameRenderMode: 'real135' as const, imagingMode: 'spectral' as const, edgeRenderMode: 'physical135' as const, physicalFog: 1, physicalLeaks: 0 };
    const plan = physicalPlanForSettings(settings, 'portrait', 36, 33);
    const left = canvasToFilm(plan, 0, plan.outputHeight / (2 * plan.pxPerMm));
    const right = canvasToFilm(plan, plan.film.height, plan.outputHeight / (2 * plan.pxPerMm));
    const center = canvasToFilm(plan, plan.film.height / 2, plan.outputHeight / (2 * plan.pxPerMm));
    const leftExposure = physicalEdgeExposureAtPoint(plan, left.s, left.t);
    const rightExposure = physicalEdgeExposureAtPoint(plan, right.s, right.t);
    expect(leftExposure.fog).toBeCloseTo(rightExposure.fog, 12);
    expect(leftExposure.fog).toBeGreaterThan(0.01);
    expect(physicalEdgeExposureAtPoint(plan, center.s, center.t).fog).toBeLessThan(0.001);
  });

  it('uses each registered stock imprint exposure rather than one Kodak gain', () => {
    expect(physicalImprintExposure(FilmType.KODAK_PORTRA_400)).toBeCloseTo(0.184 * 2 ** 1.7, 12);
    expect(physicalImprintExposure(FilmType.FUJI_PRO_400H)).toBeCloseTo(physicalImprintExposure(FilmType.FUJI_XTRA_400) * 2 ** 0.7, 12);
    expect(physicalImprintExposure(FilmType.KODAK_VISION3_500T)).toBeLessThan(physicalImprintExposure(FilmType.KODAK_PORTRA_400));
  });

  it('checks the strip output budget before allocating its canvas', async () => {
    const settings = { brandText: FilmType.KODAK_GOLD_200, frameNumber: 1, frameRenderMode: 'real135' as const, imagingMode: 'legacy' as const, edgeRenderMode: 'physical135' as const, processingMode: 'preview' as const } as FilmSettings;
    const allocate = vi.fn();
    vi.stubGlobal('OffscreenCanvas', class { constructor(width: number, height: number) { allocate(width, height); } });
    await expect(renderPhysicalStripCanvas([{} as never], async () => { throw new Error('decode must not start'); }, settings, { maxPixels: 1 }, true)).rejects.toThrow('max-pixels-exceeded');
    expect(allocate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('uses the selected stock layout in production plans and preserves unsupported imaging boundaries', () => {
    for (const stock of Object.values(FilmType)) {
      const settings = {
        brandText: stock,
        frameNumber: 1,
        frameRenderMode: 'real135' as const,
        imagingMode: supportsPhysicalSpectralStock(stock) ? 'spectral' as const : 'legacy' as const,
        edgeRenderMode: 'physical135' as const,
      };
      const plan = physicalPlanForSettings(settings, 'landscape', 36, 33);
      const imprints = createPhysicalImprints(plan, settings);
      if (!physicalEdgeForFilm(stock)) {
        expect(settings.imagingMode).toBe('legacy');
        expect(imprints).toHaveLength(0);
        expect(() => physicalPlanForSettings({ ...settings, imagingMode: 'spectral' }, 'landscape', 36, 33)).toThrow('没有经验证的物理片边布局');
        continue;
      }
      expect(imprints.length).toBeGreaterThan(0);
      expect(imprints.every(op => Number.isFinite(op.s) && Number.isFinite(op.t))).toBe(true);
    }
    expect(supportsSpectralStock(FilmType.CINESTILL_800T)).toBe(true);
    expect(supportsPhysicalSpectralStock(FilmType.CINESTILL_800T)).toBe(false);
    expect(supportsSpectralStock(FilmType.ILFORD_HP5)).toBe(true);
    expect(supportsPhysicalSpectralStock(FilmType.ILFORD_HP5)).toBe(false);
    expect(supportsPhysicalSpectralStock(FilmType.KODAK_TRI_X_400)).toBe(false);
    expect(supportsSpectralStock(FilmType.KODAK_EKTACHROME_E100)).toBe(true);
    expect(supportsPhysicalSpectralStock(FilmType.KODAK_EKTACHROME_E100)).toBe(false);
    expect(supportsPhysicalSpectralStock(FilmType.KODAK_KODACHROME_64)).toBe(false);
    expect(() => assertPhysicalCombination({ brandText: FilmType.FUJI_PROVIA_100F, frameRenderMode: 'real135', imagingMode: 'spectral', edgeRenderMode: 'legacy-template' })).not.toThrow();
    expect(() => assertPhysicalCombination({ brandText: FilmType.FUJI_PROVIA_100F, frameRenderMode: 'real135', imagingMode: 'spectral', edgeRenderMode: 'physical135' })).toThrow('没有经验证的物理片边布局');
    // Pro 400H follows upstream overscan.cpp: the same least-squares CMY with
    // no residual acceptance gate, so full physical spectral rendering is allowed.
    expect(supportsPhysicalSpectralStock(FilmType.FUJI_PRO_400H)).toBe(true);
    expect(() => physicalPlanForSettings({ brandText: FilmType.FUJI_PRO_400H, frameRenderMode: 'real135', imagingMode: 'spectral', edgeRenderMode: 'physical135' }, 'landscape', 36, 33)).not.toThrow();
  });
});
