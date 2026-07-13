import type { FilmSettings } from '../types';
import type { KodakGoldOverlayLayout } from './filmOverlay';

export function normalizeFrameNumber(frameNumber: number, maxRollFrames = 36): number {
  if (!Number.isFinite(frameNumber)) return 1;

  const max = Number.isFinite(maxRollFrames) && maxRollFrames > 0 ? Math.floor(maxRollFrames) : 36;
  const n = Math.floor(frameNumber);
  const wrapped = ((n - 1) % max) + 1;

  return wrapped <= 0 ? wrapped + max : wrapped;
}

export function getFrameNumberForIndex(
  startFrameNumber: number,
  index: number,
  maxRollFrames = 36,
): number {
  return normalizeFrameNumber(startFrameNumber + index, maxRollFrames);
}

export function getFrameNumberForImage(
  startFrameNumber: number,
  image: { rollIndex?: number },
  fallbackIndex: number,
  maxRollFrames = 36,
): number {
  return getFrameNumberForIndex(
    startFrameNumber,
    image.rollIndex ?? fallbackIndex,
    maxRollFrames,
  );
}

export function getKodakGoldFrameNumberPositions(layout: KodakGoldOverlayLayout) {
  return {
    topCenterX: layout.filmW * 0.5,
    topCenterY: layout.imageY * 0.78,
    bottomCenterX: layout.filmW * 0.5,
    bottomCenterY: layout.imageY + layout.imageH + layout.bottomRebateH * 0.34,
    currentSuffixX: layout.filmW * 0.62,
    suffixY: layout.filmH - layout.bottomRebateH * 0.22,
  };
}

export function drawKodakGoldFrameNumbers(
  ctx: CanvasRenderingContext2D,
  layout: KodakGoldOverlayLayout,
  settings: FilmSettings
) {
  const maxRollFrames = settings.maxRollFrames ?? 36;
  const frameNumber = normalizeFrameNumber(settings.frameNumber, maxRollFrames);
  const textColor = settings.textColor || '#d99a16';

  ctx.save();
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.92;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = Math.max(1, Math.round(layout.filmW * 0.0015));

  const bigFontSize = Math.max(24, Math.round(layout.topRebateH * 0.22));
  const smallFontSize = Math.max(18, Math.round(layout.bottomRebateH * 0.16));

  ctx.font = `900 ${bigFontSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  const positions = getKodakGoldFrameNumberPositions(layout);

  // These positions match a no-number Kodak Gold template: large frame number in the free rebate area.
  ctx.fillText(String(frameNumber), positions.topCenterX, positions.topCenterY);
  ctx.fillText(String(frameNumber), positions.bottomCenterX, positions.bottomCenterY);

  ctx.font = `800 ${smallFontSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(`${frameNumber}A`, positions.currentSuffixX, positions.suffixY);

  ctx.restore();
}
