import type { FocusAnchor, QuarterTurn, RenderTransform } from '../types';

export type NormalizedRenderTransform = Required<RenderTransform>;

export const DEFAULT_RENDER_TRANSFORM: Readonly<NormalizedRenderTransform> = Object.freeze({
  focusX: 0.5,
  focusY: 0.5,
  zoom: 1,
  quarterTurns: 0,
});

const QUARTER_TURNS = new Set<unknown>([0, 1, 2, 3]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeFinite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback;
}

function quantize(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function normalizeRenderTransform(value?: unknown): NormalizedRenderTransform {
  const candidate = value && typeof value === 'object'
    ? value as Partial<RenderTransform>
    : undefined;
  return {
    focusX: normalizeFinite(candidate?.focusX, 0.5, 0, 1),
    focusY: normalizeFinite(candidate?.focusY, 0.5, 0, 1),
    zoom: normalizeFinite(candidate?.zoom, 1, 1, 3),
    quarterTurns: QUARTER_TURNS.has(candidate?.quarterTurns)
      ? candidate!.quarterTurns as QuarterTurn
      : 0,
  };
}

export function createRenderTransformKey(value?: unknown): string {
  const transform = normalizeRenderTransform(value);
  return JSON.stringify([
    quantize(transform.focusX),
    quantize(transform.focusY),
    quantize(transform.zoom),
    transform.quarterTurns,
  ]);
}

export function rotateFocusAnchor(
  focusX: FocusAnchor,
  focusY: FocusAnchor,
  quarterTurns: QuarterTurn,
): { x: FocusAnchor; y: FocusAnchor } {
  switch (quarterTurns) {
    case 1: return { x: (1 - focusY) as FocusAnchor, y: focusX };
    case 2: return { x: (1 - focusX) as FocusAnchor, y: (1 - focusY) as FocusAnchor };
    case 3: return { x: focusY, y: (1 - focusX) as FocusAnchor };
    default: return { x: focusX, y: focusY };
  }
}

export function getRotatedDimensions(
  width: number,
  height: number,
  quarterTurns: QuarterTurn,
): { width: number; height: number } {
  return quarterTurns % 2 === 0
    ? { width, height }
    : { width: height, height: width };
}

export function getVisibleFrameAspect(
  imageWidth: number,
  imageHeight: number,
  quarterTurns: QuarterTurn,
  landscapeFrameAspect?: number,
): number {
  const rotated = getRotatedDimensions(imageWidth, imageHeight, quarterTurns);
  if (typeof landscapeFrameAspect !== 'number' || !Number.isFinite(landscapeFrameAspect) || landscapeFrameAspect <= 0) {
    return rotated.width / rotated.height;
  }
  return rotated.height > rotated.width ? 1 / landscapeFrameAspect : landscapeFrameAspect;
}

export function getAutoQuarterTurns(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  userQuarterTurns: QuarterTurn,
): 0 | 1 {
  const rotated = getRotatedDimensions(imageWidth, imageHeight, userQuarterTurns);
  return rotated.height > rotated.width && frameWidth > frameHeight ? 1 : 0;
}

export interface CoverPlacement {
  userQuarterTurns: QuarterTurn;
  autoQuarterTurns: 0 | 1;
  totalQuarterTurns: QuarterTurn;
  rotatedWidth: number;
  rotatedHeight: number;
  scale: number;
  drawWidth: number;
  drawHeight: number;
  offsetX: number;
  offsetY: number;
}

export function createCoverPlacement(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  value?: Partial<RenderTransform> | null,
  autoRotatePortrait = false,
): CoverPlacement {
  const transform = normalizeRenderTransform(value);
  const autoQuarterTurns = autoRotatePortrait
    ? getAutoQuarterTurns(imageWidth, imageHeight, frameWidth, frameHeight, transform.quarterTurns)
    : 0;
  const totalQuarterTurns = ((transform.quarterTurns + autoQuarterTurns) % 4) as QuarterTurn;
  const rotated = getRotatedDimensions(imageWidth, imageHeight, totalQuarterTurns);
  // Focus is expressed in the user-rotated view. Only the internal film-frame
  // auto rotation changes that coordinate space.
  const focus = rotateFocusAnchor(transform.focusX, transform.focusY, autoQuarterTurns);
  const scale = Math.max(frameWidth / rotated.width, frameHeight / rotated.height) * transform.zoom;
  const drawWidth = rotated.width * scale;
  const drawHeight = rotated.height * scale;
  const overflowX = Math.max(0, drawWidth - frameWidth);
  const overflowY = Math.max(0, drawHeight - frameHeight);

  return {
    userQuarterTurns: transform.quarterTurns,
    autoQuarterTurns,
    totalQuarterTurns,
    rotatedWidth: rotated.width,
    rotatedHeight: rotated.height,
    scale,
    drawWidth,
    drawHeight,
    offsetX: overflowX === 0 || focus.x === 0 ? 0 : -overflowX * focus.x,
    offsetY: overflowY === 0 || focus.y === 0 ? 0 : -overflowY * focus.y,
  };
}

export function changeZoomPreservingView(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  value: Partial<RenderTransform> | null | undefined,
  zoom: number,
): NormalizedRenderTransform {
  const current = normalizeRenderTransform(value);
  const currentPlacement = createCoverPlacement(imageWidth, imageHeight, frameWidth, frameHeight, current);
  const next = normalizeRenderTransform({ ...current, zoom });
  const nextPlacement = createCoverPlacement(imageWidth, imageHeight, frameWidth, frameHeight, next);
  const sourceCenterX = (-currentPlacement.offsetX + frameWidth / 2) / currentPlacement.scale;
  const sourceCenterY = (-currentPlacement.offsetY + frameHeight / 2) / currentPlacement.scale;
  const overflowX = Math.max(0, nextPlacement.drawWidth - frameWidth);
  const overflowY = Math.max(0, nextPlacement.drawHeight - frameHeight);
  const desiredOffsetX = frameWidth / 2 - sourceCenterX * nextPlacement.scale;
  const desiredOffsetY = frameHeight / 2 - sourceCenterY * nextPlacement.scale;

  return normalizeRenderTransform({
    ...next,
    focusX: overflowX > 0 ? clamp(-desiredOffsetX / overflowX, 0, 1) : 0.5,
    focusY: overflowY > 0 ? clamp(-desiredOffsetY / overflowY, 0, 1) : 0.5,
  });
}
