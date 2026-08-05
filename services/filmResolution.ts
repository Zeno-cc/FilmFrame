import type { ProcessingMode } from '../types';

export interface CanvasSize {
  width: number;
  height: number;
}

const PREVIEW_SINGLE_WIDTH = 1200;
const HIGH_SINGLE_MIN_WIDTH = 1800;
const HIGH_SINGLE_MAX_WIDTH = 3600;
const PREVIEW_STRIP_FRAME_WIDTH = 900;
const HIGH_STRIP_FRAME_WIDTH = 1400;

export function getReal135TargetImageWidth(
  sourceImageWidth: number,
  processingMode: ProcessingMode = 'preview'
): number {
  if (processingMode === 'preview') {
    return PREVIEW_SINGLE_WIDTH;
  }

  return Math.max(HIGH_SINGLE_MIN_WIDTH, Math.min(sourceImageWidth, HIGH_SINGLE_MAX_WIDTH));
}

export function getReal135StripTargetImageWidth(
  processingMode: ProcessingMode = 'preview'
): number {
  return processingMode === 'preview' ? PREVIEW_STRIP_FRAME_WIDTH : HIGH_STRIP_FRAME_WIDTH;
}

export function getScannerCanvasSize(filmCanvas: CanvasSize): CanvasSize {
  const paddingRatio = 0.055;
  let width = filmCanvas.width;
  let height = Math.round((width * 3) / 4);

  if (filmCanvas.height > height * (1 - paddingRatio * 2)) {
    height = Math.round(filmCanvas.height / (1 - paddingRatio * 2));
    width = Math.round((height * 4) / 3);
  }

  return { width, height };
}
