export const KODAK_GOLD_OVERLAY_URL = '/film-overlays/kodak-gold-200.png';
export const KODAK_GOLD_BASE_URL = '/film-overlays/film-base.png';
export const KODAK_GOLD_APERTURE_MASK_URL = '/film-overlays/aperture-mask-derived.png';
export const KODAK_GOLD_APERTURE_SHADOW_URL = '/film-overlays/aperture-shadow-derived.png';

const TEMPLATE_W = 1307;
const TEMPLATE_H = 1203;
export const KODAK_GOLD_APERTURE_ASPECT = 1123 / 800;

const APERTURE = {
  x: 92 / TEMPLATE_W,
  y: 211 / TEMPLATE_H,
  w: 1123 / TEMPLATE_W,
  h: 800 / TEMPLATE_H,
} as const;

export interface KodakGoldOverlayLayout {
  filmW: number;
  filmH: number;
  imageX: number;
  imageY: number;
  imageW: number;
  imageH: number;
  topRebateH: number;
  bottomRebateY: number;
  bottomRebateH: number;
}

export interface KodakGoldStripLayout {
  frame: KodakGoldOverlayLayout;
  frameStride: number;
  frameGap: number;
  rowGap: number;
  padding: number;
  maxPerRow: number;
  cols: number;
  rows: number;
  rowFilmW: number;
  totalW: number;
  totalH: number;
}

export function createKodakGoldOverlayLayout(targetImageWidthPx: number): KodakGoldOverlayLayout {
  const filmW = Math.round(targetImageWidthPx / APERTURE.w);
  const filmH = Math.round(filmW * TEMPLATE_H / TEMPLATE_W);
  const imageX = Math.round(filmW * APERTURE.x);
  const imageY = Math.round(filmH * APERTURE.y);
  const imageW = Math.round(filmW * APERTURE.w);
  const imageH = Math.round(filmH * APERTURE.h);
  const bottomRebateY = imageY + imageH;

  return {
    filmW,
    filmH,
    imageX,
    imageY,
    imageW,
    imageH,
    topRebateH: imageY,
    bottomRebateY,
    bottomRebateH: filmH - bottomRebateY,
  };
}

export function createKodakGoldStripLayout(
  targetImageWidthPx: number,
  frameCount: number,
  maxPerRow = 4
): KodakGoldStripLayout {
  const frame = createKodakGoldOverlayLayout(targetImageWidthPx);
  const safeCount = Math.max(1, frameCount);
  const safeMaxPerRow = Math.max(1, maxPerRow);
  const cols = Math.min(safeCount, safeMaxPerRow);
  const rows = Math.ceil(safeCount / safeMaxPerRow);
  const frameGap = Math.round(frame.imageW * 0.065);
  const frameStride = frame.imageW + frameGap;
  const rowGap = Math.round(frame.filmH * 0.08);
  const padding = Math.round(frame.filmW * 0.035);
  const rightRebateW = frame.filmW - frame.imageX - frame.imageW;
  const rowFilmW = frame.imageX + cols * frame.imageW + Math.max(0, cols - 1) * frameGap + rightRebateW;
  const totalW = padding * 2 + rowFilmW;
  const totalH = padding * 2 + rows * frame.filmH + Math.max(0, rows - 1) * rowGap;

  return {
    frame,
    frameStride,
    frameGap,
    rowGap,
    padding,
    maxPerRow: safeMaxPerRow,
    cols,
    rows,
    rowFilmW,
    totalW,
    totalH,
  };
}

export function drawKodakGoldOverlayLayer(
  ctx: CanvasRenderingContext2D,
  overlay: CanvasImageSource,
  layout: KodakGoldOverlayLayout
) {
  drawOverlayBand(ctx, overlay, layout, 0, 0, layout.filmW, layout.imageY + 12);
  drawOverlayBand(ctx, overlay, layout, 0, layout.bottomRebateY - 12, layout.filmW, layout.filmH - layout.bottomRebateY + 12);
  drawOverlayBand(ctx, overlay, layout, 0, 0, layout.imageX + 12, layout.filmH);
  drawOverlayBand(ctx, overlay, layout, layout.imageX + layout.imageW - 12, 0, layout.filmW - layout.imageX - layout.imageW + 12, layout.filmH);
}

function drawOverlayBand(
  ctx: CanvasRenderingContext2D,
  overlay: CanvasImageSource,
  layout: KodakGoldOverlayLayout,
  x: number,
  y: number,
  w: number,
  h: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(overlay, 0, 0, layout.filmW, layout.filmH);
  ctx.restore();
}
