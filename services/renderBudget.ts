import { createKodakGoldStripLayout } from './filmOverlay';

export type RenderBudgetReason =
  | 'invalid-dimensions'
  | 'max-edge-exceeded'
  | 'max-pixels-exceeded';

export type RenderBudgetResult = {
  ok: boolean;
  pixels: number;
  reason?: RenderBudgetReason;
};

export type RenderBudgetLimits = {
  maxEdge?: number;
  maxPixels?: number;
};

export const DEFAULT_MAX_CANVAS_EDGE = 32_767;
export const DEFAULT_MAX_CANVAS_MIB = 700;
export const MEBIBYTE = 1024 * 1024;
export const RGBA_BYTES_PER_PIXEL = 4;
export const DEFAULT_MAX_CANVAS_BYTES = DEFAULT_MAX_CANVAS_MIB * MEBIBYTE;
export const DEFAULT_MAX_CANVAS_PIXELS = DEFAULT_MAX_CANVAS_BYTES / RGBA_BYTES_PER_PIXEL;

export function validateCanvasBudget(
  width: number,
  height: number,
  limits: RenderBudgetLimits = {}
): RenderBudgetResult {
  const maxEdge = limits.maxEdge ?? DEFAULT_MAX_CANVAS_EDGE;
  const maxPixels = limits.maxPixels ?? DEFAULT_MAX_CANVAS_PIXELS;

  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isSafeInteger(maxEdge) ||
    !Number.isSafeInteger(maxPixels) ||
    maxEdge <= 0 ||
    maxPixels <= 0
  ) {
    return { ok: false, pixels: 0, reason: 'invalid-dimensions' };
  }

  const pixels = width * height;
  if (width > maxEdge || height > maxEdge) {
    return { ok: false, pixels, reason: 'max-edge-exceeded' };
  }

  if (!Number.isSafeInteger(pixels) || pixels > maxPixels) {
    return { ok: false, pixels, reason: 'max-pixels-exceeded' };
  }

  return { ok: true, pixels };
}

export function assertCanvasBudget(
  width: number,
  height: number,
  limits: RenderBudgetLimits = {},
): void {
  const budget = validateCanvasBudget(width, height, limits);
  if (!budget.ok) {
    throw new Error(`Render canvas exceeds the safe budget: ${budget.reason}`);
  }
}

export function validateKodakStripBudget(
  targetWidth: number,
  frameCount: number,
  maxPerRow = 4,
  limits: RenderBudgetLimits = {}
): RenderBudgetResult {
  if (
    !Number.isFinite(targetWidth) ||
    !Number.isInteger(frameCount) ||
    !Number.isInteger(maxPerRow) ||
    targetWidth <= 0 ||
    frameCount <= 0 ||
    maxPerRow <= 0
  ) {
    return { ok: false, pixels: 0, reason: 'invalid-dimensions' };
  }

  const layout = createKodakGoldStripLayout(targetWidth, frameCount, maxPerRow);
  return validateCanvasBudget(layout.totalW, layout.totalH, limits);
}
