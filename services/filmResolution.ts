import type { ProcessingMode } from '../types';

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
