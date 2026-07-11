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
  const srcRatio = img.width / img.height;
  const dstRatio = dw / dh;

  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;

  if (srcRatio > dstRatio) {
    sw = img.height * dstRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / dstRatio;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
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
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  if (!shouldAutoRotateForFilmFrame(img.width, img.height, dw, dh)) {
    drawImageCover(ctx, img, dx, dy, dw, dh);
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();

  ctx.translate(dx + dw / 2, dy + dh / 2);
  ctx.rotate(getAutoRotateRadiansForFilmFrame(img.width, img.height, dw, dh));

  const rotatedW = img.height;
  const rotatedH = img.width;
  const scale = Math.max(dw / rotatedW, dh / rotatedH);
  const drawW = img.width * scale;
  const drawH = img.height * scale;

  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}
