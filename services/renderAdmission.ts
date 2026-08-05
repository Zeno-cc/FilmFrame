import type { FilmSettings, ImageItem } from '../types';
import { FilmType } from '../types';
import {
  formatBatchAdmission,
  type BatchAdmissionResult,
} from './batchAdmission';
import { create135SidePerforationLayout } from './filmGeometry';
import {
  createFilmTemplateStripLayout,
  createKodakGoldOverlayLayout,
  createKodakGoldStripLayout,
  supportsReal135Template,
} from './filmOverlay';
import {
  getReal135StripTargetImageWidth,
  getReal135TargetImageWidth,
  getScannerCanvasSize,
} from './filmResolution';
import {
  validateCanvasBudget,
  type RenderBudgetLimits,
  type RenderBudgetResult,
} from './renderBudget';
import { getRotatedDimensions, normalizeRenderTransform } from './renderTransform';

export interface RenderCanvasSize {
  width: number;
  height: number;
}

export type SingleImageRenderAdmission = {
  ok: boolean;
  canvas: RenderCanvasSize;
  budget: RenderBudgetResult;
};

export function frameNumberForIndex(settings: FilmSettings, index: number): number {
  return ((settings.frameNumber + index - 1) % (settings.maxRollFrames ?? 36)) + 1;
}

export function settingsForImage(settings: FilmSettings, index: number): FilmSettings {
  return {
    ...settings,
    frameNumber: frameNumberForIndex(settings, index),
  };
}

function getClassicSingleCanvasSize(
  image: Pick<ImageItem, 'sourceWidth' | 'sourceHeight' | 'transform'>,
  settings: FilmSettings,
): RenderCanvasSize {
  const rotated = getRotatedDimensions(
    image.sourceWidth,
    image.sourceHeight,
    normalizeRenderTransform(image.transform).quarterTurns,
  );
  const isPortrait = rotated.height > rotated.width;
  const baseDimension = isPortrait ? rotated.height : rotated.width;
  const borderSize = Math.floor(baseDimension * (settings.borderSize / 100));
  return {
    width: isPortrait ? rotated.width + borderSize * 2 : rotated.width,
    height: isPortrait ? rotated.height : rotated.height + borderSize * 2,
  };
}

export function getSingleImageCanvasSizes(
  image: Pick<ImageItem, 'sourceWidth' | 'sourceHeight' | 'transform'>,
  settings: FilmSettings,
): readonly RenderCanvasSize[] {
  const usesReal135 = (settings.frameRenderMode ?? 'real135') === 'real135';
  if (!usesReal135) return [getClassicSingleCanvasSize(image, settings)];

  const usesTemplate = settings.useFilmOverlayTemplate !== false
    && supportsReal135Template(settings.brandText);
  const targetImageWidth = getReal135TargetImageWidth(image.sourceWidth, settings.processingMode);
  const layout = usesTemplate
    ? createKodakGoldOverlayLayout(targetImageWidth)
    : create135SidePerforationLayout(targetImageWidth);
  const filmCanvas = { width: layout.filmW, height: layout.filmH };
  const scanOutputAspect = settings.scanOutputAspect ?? (usesTemplate ? 'native' : '4:3');

  return scanOutputAspect === '4:3'
    ? [filmCanvas, getScannerCanvasSize(filmCanvas)]
    : [filmCanvas];
}

export function evaluateSingleImageRenderAdmission(
  image: Pick<ImageItem, 'sourceWidth' | 'sourceHeight' | 'transform'>,
  settings: FilmSettings,
  limits: RenderBudgetLimits,
): SingleImageRenderAdmission {
  const canvasSizes = getSingleImageCanvasSizes(image, settings);
  for (const canvas of canvasSizes) {
    const budget = validateCanvasBudget(canvas.width, canvas.height, limits);
    if (!budget.ok) return { ok: false, canvas, budget };
  }

  const canvas = canvasSizes.reduce((largest, candidate) => (
    candidate.width * candidate.height > largest.width * largest.height ? candidate : largest
  ));
  return {
    ok: true,
    canvas,
    budget: validateCanvasBudget(canvas.width, canvas.height, limits),
  };
}

export function getStripCanvasSize(
  settings: FilmSettings,
  frameCount: number,
): RenderCanvasSize {
  if (
    (settings.frameRenderMode ?? 'real135') === 'real135'
    && settings.useFilmOverlayTemplate !== false
    && supportsReal135Template(settings.brandText)
  ) {
    const targetWidth = getReal135StripTargetImageWidth(settings.processingMode);
    const layout = settings.brandText === FilmType.KODAK_GOLD_200
      ? createKodakGoldStripLayout(targetWidth, frameCount, 4)
      : createFilmTemplateStripLayout(targetWidth, frameCount, 4);
    return { width: layout.totalW, height: layout.totalH };
  }

  const maxPerRow = 6;
  const stripHeight = 1600;
  const rowGap = 120;
  const borderSize = Math.floor(stripHeight * 0.16);
  const imageAreaHeight = stripHeight - borderSize * 2;
  const frameWidth = imageAreaHeight * 1.5;
  const frameGap = frameWidth * 0.055;
  const columns = Math.min(frameCount, maxPerRow);
  const rows = Math.ceil(frameCount / maxPerRow);
  const width = frameWidth * 0.2 * 2
    + frameWidth * columns
    + frameGap * Math.max(0, columns - 1);

  return {
    width: Math.trunc(width),
    height: rows * stripHeight + Math.max(0, rows - 1) * rowGap,
  };
}

const ADMISSION_ACTION_COPY: Record<BatchAdmissionResult['recommendations'][number], string> = {
  'select-images': '取消部分入选',
  'remove-largest-images': '移除最大图片',
  'use-preview-mode': '切换预览质量',
};

export function formatAdmissionFeedback(result: BatchAdmissionResult, operation: string): string {
  const advice = result.recommendations
    .map(action => ADMISSION_ACTION_COPY[action])
    .join('、');
  const suffix = advice ? ` 建议：${advice}。` : '';
  return `${operation}前预检：${formatBatchAdmission(result)}${suffix}`;
}

export function formatSingleImageAdmissionFeedback(
  result: SingleImageRenderAdmission,
  operation: string,
): string {
  const canvasSize = `${result.canvas.width} x ${result.canvas.height}`;
  const reason = result.budget.reason === 'max-edge-exceeded'
    ? '边长超过浏览器安全上限'
    : result.budget.reason === 'max-pixels-exceeded'
      ? 'RGBA 内存估算超过当前 Canvas 上限'
      : '尺寸无法用于安全估算';
  return `${operation}前预检：预计画布 ${canvasSize}，${reason}。建议切换预览质量或使用尺寸更小的图片。`;
}
