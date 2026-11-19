import type { FilmSettings, FilmType, RenderTransform } from '../../types';
import { supportsSpectralStock } from '../spectral/stockRegistry';
import { supportsPhysicalSpectralStock } from './capability';
import { createBodyVariation, createFrameVariation } from './seed';
import { physicalEdgeForFilm } from './edgeRegistry';
import { EDGE_MODE_LABELS, FRAME_MODE_LABELS } from '../renderModePresentation';

/**
 * Convert a point in this frame's local scan window to its identity on the
 * continuous roll. Gate, imprint and perforation geometry stays local; only
 * roll-owned material and edge exposure use this translation.
 */
export function filmToRollPoint(plan: PhysicalFilmPlan, point: FilmPoint): FilmPoint {
  return { s: point.s + plan.advanceOriginS, t: point.t };
}

export function rollToFilmPoint(plan: PhysicalFilmPlan, point: FilmPoint): FilmPoint {
  return { s: point.s - plan.advanceOriginS, t: point.t };
}

export type PhysicalBacking = FilmSettings['physicalBacking'];
export type EdgeRenderMode = FilmSettings['edgeRenderMode'];
export type PhysicalOrientation = 'landscape' | 'portrait';
export type PhysicalRenderingKind = 'geometry-compatibility' | 'spectral-negative';

export function filmToCanvas(plan: PhysicalFilmPlan, s: number, t: number): FilmPoint {
  const oriented = plan.orientation === 'portrait'
    ? { s: plan.film.height - t, t: s }
    : { s, t };
  if (plan.frame.straightenDegrees === 0) return oriented;
  const centerS = plan.film.width / 2;
  const centerT = plan.film.height / 2;
  const radians = plan.frame.straightenDegrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = (oriented.s + plan.advanceOriginS - centerS) * plan.pxPerMm;
  const y = (oriented.t - centerT) * plan.pxPerMm;
  return {
    s: (cos * x - sin * y) / plan.pxPerMm + centerS - plan.frame.scanOffset.s,
    t: (sin * x + cos * y) / plan.pxPerMm + centerT - plan.frame.scanOffset.t - plan.frame.weave,
  };
}

export function canvasToFilm(plan: PhysicalFilmPlan, x: number, y: number): FilmPoint {
  if (plan.frame.straightenDegrees === 0) {
    return plan.orientation === 'portrait' ? { s: y, t: plan.film.height - x } : { s: x, t: y };
  }
  const centerS = plan.film.width / 2;
  const centerT = plan.film.height / 2;
  const dx = (x - centerS + plan.frame.scanOffset.s) * plan.pxPerMm;
  const dy = (y - centerT + plan.frame.scanOffset.t + plan.frame.weave) * plan.pxPerMm;
  const radians = plan.frame.straightenDegrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const oriented = {
    s: (cos * dx + sin * dy) / plan.pxPerMm + centerS - plan.advanceOriginS,
    t: (-sin * dx + cos * dy) / plan.pxPerMm + centerT,
  };
  return plan.orientation === 'portrait'
    ? { s: oriented.t, t: plan.film.height - oriented.s }
    : oriented;
}

export interface FilmPoint {
  s: number;
  t: number;
}

export interface FilmRect {
  s: number;
  t: number;
  width: number;
  height: number;
}

export interface PerforationPlan {
  center: FilmPoint;
  width: number;
  height: number;
  radius: number;
  softness: number;
  phase: number;
}

export interface BodyVariation {
  gateOffset: FilmPoint;
  gateRadii: readonly [number, number, number, number];
  registration: number;
  perforationPhase: number;
}

export interface FrameVariation {
  straightenDegrees: number;
  weave: number;
  scanOffset: FilmPoint;
}

export interface PhysicalFilmPlan {
  format: '135-full';
  kind: PhysicalRenderingKind;
  film: FilmRect;
  gate: FilmRect;
  orientation: PhysicalOrientation;
  pxPerMm: number;
  outputWidth: number;
  outputHeight: number;
  perforations: readonly PerforationPlan[];
  gateOriginS: number;
  advanceOriginS: number;
  continuous: boolean;
  imprintSpanMm?: number;
  backing: PhysicalBacking;
  aperture: number;
  body: BodyVariation;
  frame: FrameVariation;
  fog: number;
  leaks: number;
  bodySeed: number;
  frameSeed: number;
}

export interface PhysicalPlanInput {
  filmType?: FilmType;
  settings: Pick<FilmSettings, 'brandText'> & Partial<Pick<FilmSettings,
    'frameRenderMode' | 'imagingMode' | 'edgeRenderMode' | 'physicalBacking'
    | 'physicalBodySeed' | 'physicalFrameSeed' | 'physicalFog' | 'physicalLeaks'
    | 'physicalStraighten' | 'physicalAperture' | 'processingMode' | 'frameNumber'
  >>;
  orientation: PhysicalOrientation;
  gateWidth: number;
  gateHeight: number;
  pxPerMm: number;
  transform?: RenderTransform;
}

export const FULL_FRAME_135 = {
  filmWidthMm: 35,
  advanceMm: 38,
  gateWidthMm: 36.25,
  gateHeightMm: 24.3,
  perforationPitchMm: 4.75,
  perforationWidthMm: 1.98,
  perforationHeightMm: 2.8,
  perforationEdgeMm: 2,
  perforationRadiusMm: 0.5,
  perforationsPerAdvance: 8,
} as const;

export function physicalRenderingKind(settings: Partial<Pick<FilmSettings, 'edgeRenderMode' | 'imagingMode'>>): PhysicalRenderingKind {
  return settings.edgeRenderMode === 'physical135' && settings.imagingMode === 'spectral'
    ? 'spectral-negative'
    : 'geometry-compatibility';
}

export function assertPhysicalCombination(settings: Pick<FilmSettings, 'brandText'> & Partial<Pick<FilmSettings, 'frameRenderMode' | 'edgeRenderMode' | 'imagingMode'>>): void {
  if (settings.edgeRenderMode !== 'physical135') return;
  if (settings.imagingMode === 'spectral' && !physicalEdgeForFilm(settings.brandText)) {
    throw new Error(`${settings.brandText} 没有经验证的物理片边布局；请改用${EDGE_MODE_LABELS['legacy-template']}。`);
  }
  if ((settings.frameRenderMode ?? 'real135') !== 'real135') {
    throw new Error(`${EDGE_MODE_LABELS.physical135}需要启用 ${FRAME_MODE_LABELS.real135}。`);
  }
  if (settings.imagingMode === 'spectral' && !supportsSpectralStock(settings.brandText)) {
    throw new Error(`${settings.brandText} 没有经验证的光谱负片资源，不能用于物理光谱片边。`);
  }
  if (settings.imagingMode === 'spectral' && !supportsPhysicalSpectralStock(settings.brandText)) {
    throw new Error(`${settings.brandText} 的物理孔密度未通过验收，不能用于完整物理光谱片边。`);
  }
}

export function createPhysicalFilmPlan(input: PhysicalPlanInput): PhysicalFilmPlan {
  assertPhysicalCombination({ ...input.settings, brandText: input.filmType ?? input.settings.brandText });
  if (!Number.isFinite(input.pxPerMm) || input.pxPerMm <= 0 || !Number.isSafeInteger(Math.round(input.pxPerMm))) {
    throw new RangeError('Physical film px/mm must be a positive finite integer');
  }
  if (![input.gateWidth, input.gateHeight].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Physical gate dimensions must be positive finite millimetres');
  }
  const pxPerMm = Math.round(input.pxPerMm);
  const body = createBodyVariation(input.settings.physicalBodySeed ?? 1);
  const frame = createFrameVariation(input.settings.physicalFrameSeed ?? 1, input.settings.physicalStraighten ?? 0);
  const gate: FilmRect = {
    s: (FULL_FRAME_135.advanceMm - input.gateWidth) / 2 + body.gateOffset.s,
    t: (FULL_FRAME_135.filmWidthMm - input.gateHeight) / 2 + body.gateOffset.t,
    width: input.gateWidth,
    height: input.gateHeight,
  };
  if (gate.s < 0 || gate.t < 0 || gate.s + gate.width > FULL_FRAME_135.advanceMm
    || gate.t + gate.height > FULL_FRAME_135.filmWidthMm) {
    throw new RangeError('Physical gate lies outside the 135 film advance');
  }
  const film = {
    s: 0,
    t: 0,
    width: FULL_FRAME_135.advanceMm,
    height: FULL_FRAME_135.filmWidthMm,
  };
  const perforations = Array.from({ length: FULL_FRAME_135.perforationsPerAdvance * 2 }, (_, index) => {
    const row = index < FULL_FRAME_135.perforationsPerAdvance ? 0 : 1;
    const column = index % FULL_FRAME_135.perforationsPerAdvance;
    const along = (column + 0.5) * FULL_FRAME_135.perforationPitchMm + body.perforationPhase;
    const near = FULL_FRAME_135.perforationEdgeMm + FULL_FRAME_135.perforationHeightMm / 2;
    const far = FULL_FRAME_135.filmWidthMm - near;
    return {
      center: { s: along, t: row === 0 ? near : far },
      width: FULL_FRAME_135.perforationWidthMm,
      height: FULL_FRAME_135.perforationHeightMm,
      radius: FULL_FRAME_135.perforationRadiusMm,
      softness: 0.017,
      phase: body.perforationPhase,
    };
  });
  const outputWidth = Math.round((input.orientation === 'portrait' ? film.height : film.width) * pxPerMm);
  const outputHeight = Math.round((input.orientation === 'portrait' ? film.width : film.height) * pxPerMm);
  const rasterWidth = outputWidth;
  const rasterHeight = outputHeight;
  return {
    format: '135-full',
    kind: physicalRenderingKind(input.settings),
    film,
    gate,
    orientation: input.orientation,
    pxPerMm,
    outputWidth: rasterWidth,
    outputHeight: rasterHeight,
    perforations,
    gateOriginS: gate.s,
    advanceOriginS: 0,
    continuous: false,
    backing: input.settings.physicalBacking ?? 'open',
    aperture: input.settings.physicalAperture ?? 5.6,
    body,
    frame,
    fog: input.settings.physicalFog ?? 1,
    leaks: input.settings.physicalLeaks ?? 0,
    bodySeed: input.settings.physicalBodySeed ?? 1,
    frameSeed: input.settings.physicalFrameSeed ?? 1,
  };
}
