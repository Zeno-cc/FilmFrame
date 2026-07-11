import type { RenderTransform } from '../types';
import { createCoverPlacement } from './renderTransform';

export const PHYS_135 = {
  filmWidthMm: 35,
  frameWidthMm: 36,
  frameHeightMm: 24,
  frameAdvanceMm: 38,
  perforationsPerFrame: 8,
  pitchMm: 4.75,
  perfWidthMm: 2.8,
  perfHeightMm: 2.0,
  rebateMm: 5.5,
} as const;

export type FilmOrientation = 'landscape' | 'portrait';

export interface Film135Layout {
  pxPerMm: number;
  filmW: number;
  filmH: number;
  imageX: number;
  imageY: number;
  imageW: number;
  imageH: number;
  topRebateH: number;
  bottomRebateY: number;
  bottomRebateH: number;
  perfW: number;
  perfH: number;
  perfPitch: number;
  perfTopY: number;
  perfBottomY: number;
  perfStartX: number;
}

export interface Film135SideLayout {
  pxPerMm: number;
  filmW: number;
  filmH: number;
  imageX: number;
  imageY: number;
  imageW: number;
  imageH: number;
  sideRailW: number;
  verticalRebateH: number;
  perfW: number;
  perfH: number;
  perfCount: number;
  perfPitch: number;
  perfLeftX: number;
  perfRightX: number;
  perfStartY: number;
}

export function create135LandscapeLayout(targetImageWidthPx: number): Film135Layout {
  const pxPerMm = targetImageWidthPx / PHYS_135.frameWidthMm;

  const filmW = Math.round(PHYS_135.frameAdvanceMm * pxPerMm);
  const filmH = Math.round(PHYS_135.filmWidthMm * pxPerMm);
  const imageW = Math.round(PHYS_135.frameWidthMm * pxPerMm);
  const imageH = Math.round(PHYS_135.frameHeightMm * pxPerMm);

  const imageX = Math.round((filmW - imageW) / 2);
  const imageY = Math.round(PHYS_135.rebateMm * pxPerMm);

  const topRebateH = imageY;
  const bottomRebateY = imageY + imageH;
  const bottomRebateH = filmH - bottomRebateY;

  const perfW = Math.round(PHYS_135.perfWidthMm * pxPerMm);
  const perfH = Math.round(PHYS_135.perfHeightMm * pxPerMm);
  const perfPitch = PHYS_135.pitchMm * pxPerMm;
  const perfTopY = Math.round((topRebateH - perfH) / 2);
  const perfBottomY = Math.round(bottomRebateY + (bottomRebateH - perfH) / 2);
  const perfStartX = Math.round(((PHYS_135.pitchMm - PHYS_135.perfWidthMm) / 2) * pxPerMm);

  return {
    pxPerMm,
    filmW,
    filmH,
    imageX,
    imageY,
    imageW,
    imageH,
    topRebateH,
    bottomRebateY,
    bottomRebateH,
    perfW,
    perfH,
    perfPitch,
    perfTopY,
    perfBottomY,
    perfStartX,
  };
}

export function create135SidePerforationLayout(targetImageWidthPx: number): Film135SideLayout {
  const pxPerMm = targetImageWidthPx / PHYS_135.frameWidthMm;

  const imageW = Math.round(PHYS_135.frameWidthMm * pxPerMm);
  const imageH = Math.round(PHYS_135.frameHeightMm * pxPerMm);
  const sideRailW = Math.round(3 * pxPerMm);
  const verticalRebateH = Math.round(2 * pxPerMm);
  const filmW = imageW + sideRailW * 2;
  const filmH = imageH + verticalRebateH * 2;

  const perfW = Math.round(2.1 * pxPerMm);
  const perfH = Math.round(1.65 * pxPerMm);
  const perfCount = PHYS_135.perforationsPerFrame;
  const perfPitch = filmH / perfCount;
  const perfLeftX = Math.round((sideRailW - perfW) / 2);
  const perfRightX = Math.round(filmW - sideRailW + (sideRailW - perfW) / 2);
  const perfStartY = Math.round((perfPitch - perfH) / 2);

  return {
    pxPerMm,
    filmW,
    filmH,
    imageX: sideRailW,
    imageY: verticalRebateH,
    imageW,
    imageH,
    sideRailW,
    verticalRebateH,
    perfW,
    perfH,
    perfCount,
    perfPitch,
    perfLeftX,
    perfRightX,
    perfStartY,
  };
}

// Draw an image so it fully covers the destination frame while preserving aspect ratio.
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  drawImageCoverWithTransform(ctx, img, dx, dy, dw, dh);
}

export function shouldAutoRotateForFilmFrame(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number
) {
  return imageHeight > imageWidth && frameWidth > frameHeight;
}

export function getAutoRotateRadiansForFilmFrame(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number
) {
  return shouldAutoRotateForFilmFrame(imageWidth, imageHeight, frameWidth, frameHeight)
    ? Math.PI / 2
    : 0;
}

export function getOutputRestoreRotationRadiansForFilmFrame(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number
) {
  return -getAutoRotateRadiansForFilmFrame(imageWidth, imageHeight, frameWidth, frameHeight);
}

export function drawImageCoverAutoRotate(
  ctx: RenderContext,
  img: RenderImage,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  transform?: RenderTransform,
) {
  drawImageCoverWithTransform(ctx, img, dx, dy, dw, dh, transform, true);
}

type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type RenderImage = HTMLImageElement | ImageBitmap;

export function drawImageCoverWithTransform(
  ctx: RenderContext,
  img: RenderImage,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  transform?: RenderTransform,
  autoRotatePortrait = false,
) {
  const placement = createCoverPlacement(
    img.width,
    img.height,
    dw,
    dh,
    transform,
    autoRotatePortrait,
  );
  const sourceDrawWidth = img.width * placement.scale;
  const sourceDrawHeight = img.height * placement.scale;

  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();

  ctx.translate(dx + placement.offsetX, dy + placement.offsetY);

  switch (placement.totalQuarterTurns) {
    case 1:
      ctx.translate(placement.drawWidth, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case 2:
      ctx.translate(placement.drawWidth, placement.drawHeight);
      ctx.rotate(Math.PI);
      break;
    case 3:
      ctx.translate(0, placement.drawHeight);
      ctx.rotate(-Math.PI / 2);
      break;
  }

  ctx.drawImage(img, 0, 0, sourceDrawWidth, sourceDrawHeight);
  ctx.restore();
}
