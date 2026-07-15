import { FilmType } from '../types';

export const KODAK_GOLD_OVERLAY_URL = '/film-overlays/kodak-gold-200.png';
export const KODAK_PORTRA_160_OVERLAY_URL = '/film-overlays/kodak-portra-160.png';
export const KODAK_PORTRA_400_OVERLAY_URL = '/film-overlays/kodak-portra-400.png';
export const KODAK_EKTAR_100_OVERLAY_URL = '/film-overlays/kodak-ektar-100.png';
export const KODAK_PORTRA_800_OVERLAY_URL = '/film-overlays/kodak-portra-800.png';
export const KODAK_ULTRAMAX_400_OVERLAY_URL = '/film-overlays/kodak-ultramax-400.png';
export const KODAK_COLORPLUS_200_OVERLAY_URL = '/film-overlays/kodak-colorplus-200.png';
export const KODAK_PRO_IMAGE_100_OVERLAY_URL = '/film-overlays/kodak-pro-image-100.png';
export const KODAK_EKTACHROME_E100_OVERLAY_URL = '/film-overlays/kodak-ektachrome-e100.png';
export const KODAK_TRI_X_400_OVERLAY_URL = '/film-overlays/kodak-tri-x-400.png';
export const KODAK_TMAX_100_OVERLAY_URL = '/film-overlays/kodak-tmax-100.png';
export const KODAK_TMAX_400_OVERLAY_URL = '/film-overlays/kodak-tmax-400.png';
export const KODAK_TMAX_P3200_OVERLAY_URL = '/film-overlays/kodak-tmax-p3200.png';
export const FUJI_SUPERIA_400_OVERLAY_URL = '/film-overlays/fuji-superia-400.png';
export const CINESTILL_800T_OVERLAY_URL = '/film-overlays/cinestill-800t.png';
export const ILFORD_HP5_PLUS_OVERLAY_URL = '/film-overlays/ilford-hp5-plus.png';
export const KODAK_GOLD_BASE_URL = '/film-overlays/film-base.png';
export const KODAK_GOLD_APERTURE_MASK_URL = '/film-overlays/aperture-mask-derived.png';
export const KODAK_GOLD_APERTURE_SHADOW_URL = '/film-overlays/aperture-shadow-derived.png';

const TEMPLATE_W = 1307;
const TEMPLATE_H = 1203;
export const KODAK_GOLD_APERTURE_ASPECT = 1123 / 800;

export const REAL135_TEMPLATE_URLS: Partial<Record<FilmType, string>> = {
  [FilmType.KODAK_GOLD_200]: KODAK_GOLD_OVERLAY_URL,
  [FilmType.KODAK_PORTRA_160]: KODAK_PORTRA_160_OVERLAY_URL,
  [FilmType.KODAK_PORTRA_400]: KODAK_PORTRA_400_OVERLAY_URL,
  [FilmType.KODAK_EKTAR_100]: KODAK_EKTAR_100_OVERLAY_URL,
  [FilmType.KODAK_PORTRA_800]: KODAK_PORTRA_800_OVERLAY_URL,
  [FilmType.KODAK_ULTRAMAX_400]: KODAK_ULTRAMAX_400_OVERLAY_URL,
  [FilmType.KODAK_COLORPLUS_200]: KODAK_COLORPLUS_200_OVERLAY_URL,
  [FilmType.KODAK_PROIMAGE_100]: KODAK_PRO_IMAGE_100_OVERLAY_URL,
  [FilmType.KODAK_EKTACHROME_E100]: KODAK_EKTACHROME_E100_OVERLAY_URL,
  [FilmType.KODAK_TRI_X_400]: KODAK_TRI_X_400_OVERLAY_URL,
  [FilmType.KODAK_TMAX_100]: KODAK_TMAX_100_OVERLAY_URL,
  [FilmType.KODAK_TMAX_400]: KODAK_TMAX_400_OVERLAY_URL,
  [FilmType.KODAK_P3200]: KODAK_TMAX_P3200_OVERLAY_URL,
  [FilmType.FUJI_SUPERIA]: FUJI_SUPERIA_400_OVERLAY_URL,
  [FilmType.CINESTILL_800T]: CINESTILL_800T_OVERLAY_URL,
  [FilmType.ILFORD_HP5]: ILFORD_HP5_PLUS_OVERLAY_URL,
};

export function getReal135OverlayUrl(brand: FilmType): string | undefined {
  return REAL135_TEMPLATE_URLS[brand];
}

export function supportsReal135Template(brand: FilmType): boolean {
  return Boolean(getReal135OverlayUrl(brand));
}

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

export interface FilmTemplateStripLayout {
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

/**
 * Layout for flattened single-frame templates. Each frame keeps its complete
 * rebate and touches the next frame, so the strip reads as one continuous roll.
 */
export function createFilmTemplateStripLayout(
  targetImageWidthPx: number,
  frameCount: number,
  maxPerRow = 4,
): FilmTemplateStripLayout {
  const frame = createKodakGoldOverlayLayout(targetImageWidthPx);
  const safeCount = Math.max(1, frameCount);
  const safeMaxPerRow = Math.max(1, maxPerRow);
  const cols = Math.min(safeCount, safeMaxPerRow);
  const rows = Math.ceil(safeCount / safeMaxPerRow);
  // The generated template already contains the full rebate. Do not add a
  // second inter-frame gutter or each frame will look like a separate card.
  const frameGap = 0;
  const frameStride = frame.filmW + frameGap;
  const rowFilmW = cols * frame.filmW + Math.max(0, cols - 1) * frameGap;
  const rowGap = Math.round(frame.filmH * 0.08);
  const padding = Math.round(frame.filmW * 0.035);

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
    totalW: padding * 2 + rowFilmW,
    totalH: padding * 2 + rows * frame.filmH + Math.max(0, rows - 1) * rowGap,
  };
}

export function drawKodakGoldOverlayLayer(
  ctx: CanvasRenderingContext2D,
  overlay: CanvasImageSource,
  layout: KodakGoldOverlayLayout
) {
  drawOverlayBand(ctx, overlay, layout, 0, 0, layout.filmW, layout.imageY);
  drawOverlayBand(ctx, overlay, layout, 0, layout.bottomRebateY, layout.filmW, layout.filmH - layout.bottomRebateY);
  drawOverlayBand(ctx, overlay, layout, 0, 0, layout.imageX, layout.filmH);
  drawOverlayBand(ctx, overlay, layout, layout.imageX + layout.imageW, 0, layout.filmW - layout.imageX - layout.imageW, layout.filmH);
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
