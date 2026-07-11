import { FilmSettings, FILM_PRESETS, FilmType, ImageItem, RenderTransform } from '../types';
import { applyGold200Look } from './filmColor';
import { drawKodakGoldFrameNumbers, getFrameNumberForIndex } from './filmFrameNumber';
import {
  createKodakGoldOverlayLayout,
  createKodakGoldStripLayout,
  KODAK_GOLD_APERTURE_MASK_URL,
  KODAK_GOLD_APERTURE_SHADOW_URL,
  KODAK_GOLD_BASE_URL,
} from './filmOverlay';
import { drawImageCoverAutoRotate, drawImageCoverWithTransform } from './filmGeometry';
import { getAutoQuarterTurns, getRotatedDimensions, normalizeRenderTransform } from './renderTransform';
import { getReal135StripTargetImageWidth, getReal135TargetImageWidth } from './filmResolution';
import { drawGrain } from './filmTexture';
import { validateCanvasBudget } from './renderBudget';

type ProcessRequest = {
  id: number;
  type: 'processImage';
  file: File;
  settings: FilmSettings;
  dateOverride?: string;
  transform?: RenderTransform;
};

type StripRequest = {
  id: number;
  type: 'generateFilmStrip';
  images: ImageItem[];
  settings: FilmSettings;
};

type WorkerRequest = ProcessRequest | StripRequest;

type WorkerResponse =
  | { id: number; ok: true; blob: Blob }
  | { id: number; ok: false; error: string };

type WorkerCanvas = OffscreenCanvas;
type WorkerContext = OffscreenCanvasRenderingContext2D;
type WorkerImage = ImageBitmap;

type KodakGoldLayeredAssets = {
  base: ImageBitmap;
  apertureMask: ImageBitmap;
  apertureShadow: ImageBitmap;
};

function assertCanvasBudget(width: number, height: number) {
  const budget = validateCanvasBudget(width, height);
  if (!budget.ok) {
    throw new Error(`Render canvas exceeds the safe budget: ${budget.reason}`);
  }
}

let kodakGoldLayeredAssetsPromise: Promise<KodakGoldLayeredAssets> | null = null;

function roundedRect(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }
  ctx.closePath();
}

function drawHole(
  ctx: OffscreenCanvasRenderingContext2D,
  settings: FilmSettings,
  x: number,
  y: number,
  w: number,
  h: number,
  borderSize: number
) {
  const radius = Math.min(w, h) * (settings.holeType === 'rounded' ? 0.35 : 0.12);
  ctx.save();
  roundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = settings.holeColor;
  ctx.fill();
  ctx.clip();

  const strokeWidth = Math.max(2, borderSize * 0.15);
  const blurSize = Math.max(2, borderSize * 0.05);
  const shadowDist = Math.max(1, borderSize * 0.02);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = strokeWidth;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = blurSize;
  ctx.shadowOffsetX = shadowDist;
  ctx.shadowOffsetY = shadowDist;
  roundedRect(ctx, x - strokeWidth / 2, y - strokeWidth / 2, w + strokeWidth, h + strokeWidth, radius + strokeWidth / 2);
  ctx.stroke();
  ctx.restore();
}

async function loadBitmapFromUrl(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load asset: ${url}`);
  return createImageBitmap(await response.blob());
}

function loadKodakGoldLayeredAssets(): Promise<KodakGoldLayeredAssets> {
  if (!kodakGoldLayeredAssetsPromise) {
    kodakGoldLayeredAssetsPromise = (async () => {
      let base: ImageBitmap | null = null;
      let apertureMask: ImageBitmap | null = null;
      try {
        base = await loadBitmapFromUrl(KODAK_GOLD_BASE_URL);
        apertureMask = await loadBitmapFromUrl(KODAK_GOLD_APERTURE_MASK_URL);
        const apertureShadow = await loadBitmapFromUrl(KODAK_GOLD_APERTURE_SHADOW_URL);
        return { base, apertureMask, apertureShadow };
      } catch (error) {
        base?.close();
        apertureMask?.close();
        throw error;
      }
    })()
      .catch(error => {
        kodakGoldLayeredAssetsPromise = null;
        throw error;
      });
  }

  return kodakGoldLayeredAssetsPromise;
}

function createLuminanceAlphaMask(mask: WorkerImage, width: number, height: number): WorkerCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas init failed');

  ctx.drawImage(mask, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = Math.round(data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722);
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = alpha;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function composeOnScannerCanvas(filmCanvas: WorkerCanvas): WorkerCanvas {
  const paddingRatio = 0.055;
  const outputW = filmCanvas.width;
  const outputH = Math.round((outputW * 3) / 4);

  let canvasW = outputW;
  let canvasH = outputH;

  if (filmCanvas.height > canvasH * (1 - paddingRatio * 2)) {
    canvasH = Math.round(filmCanvas.height / (1 - paddingRatio * 2));
    canvasW = Math.round((canvasH * 4) / 3);
  }

  const canvas = new OffscreenCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas init failed');

  ctx.fillStyle = '#e8e3d8';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const gradient = ctx.createRadialGradient(
    canvasW / 2,
    canvasH / 2,
    canvasH * 0.1,
    canvasW / 2,
    canvasH / 2,
    canvasW * 0.75
  );
  gradient.addColorStop(0, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasW, canvasH);

  const x = Math.round((canvasW - filmCanvas.width) / 2);
  const y = Math.round((canvasH - filmCanvas.height) / 2);
  ctx.drawImage(filmCanvas, x, y);

  return canvas;
}

function rotateCanvas(canvas: WorkerCanvas, radians: number): WorkerCanvas {
  if (radians === 0) return canvas;

  const quarterTurn = Math.abs(Math.abs(radians) - Math.PI / 2) < 0.0001;
  const output = new OffscreenCanvas(
    quarterTurn ? canvas.height : canvas.width,
    quarterTurn ? canvas.width : canvas.height
  );
  const ctx = output.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas init failed');

  ctx.fillStyle = '#e8e3d8';
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.translate(output.width / 2, output.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return output;
}

function restoreOutputOrientationForSource(
  canvas: WorkerCanvas,
  img: WorkerImage,
  frameWidth: number,
  frameHeight: number,
  transform?: RenderTransform,
) {
  const normalized = normalizeRenderTransform(transform);
  const autoQuarterTurns = getAutoQuarterTurns(
    img.width,
    img.height,
    frameWidth,
    frameHeight,
    normalized.quarterTurns,
  );
  return rotateCanvas(
    canvas,
    -autoQuarterTurns * Math.PI / 2,
  );
}

async function canvasToBlob(canvas: OffscreenCanvas, settings: FilmSettings) {
  return canvas.convertToBlob({
    type: settings.outputFormat,
    quality: settings.outputQuality,
  });
}

async function renderClassicFrame(file: File, settings: FilmSettings, dateOverride?: string, transform?: RenderTransform): Promise<Blob> {
  const img = await createImageBitmap(file);
  try {
    const preset = FILM_PRESETS[settings.brandText] || FILM_PRESETS['KODAK PORTRA 400'];
    if (!preset) throw new Error('Invalid preset');

    const rotated = getRotatedDimensions(img.width, img.height, normalizeRenderTransform(transform).quarterTurns);
    const isPortrait = rotated.height > rotated.width;
    const baseDim = isPortrait ? rotated.height : rotated.width;
    const borderSize = Math.floor(baseDim * (settings.borderSize / 100));
    const canvasWidth = isPortrait ? rotated.width + borderSize * 2 : rotated.width;
    const canvasHeight = isPortrait ? rotated.height : rotated.height + borderSize * 2;
    assertCanvasBudget(canvasWidth, canvasHeight);
    const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas init failed');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = settings.borderColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imgX = isPortrait ? borderSize : 0;
    const imgY = isPortrait ? 0 : borderSize;
    drawImageCoverWithTransform(ctx, img, imgX, imgY, rotated.width, rotated.height, transform);
    drawGrain(ctx, imgX, imgY, rotated.width, rotated.height, settings.grainIntensity);

    const holePerp = borderSize * 0.6;
    const holePara = holePerp * 0.74;
    const targetHoleCount = 8;
    if (isPortrait) {
      const pitch = canvas.height / targetHoleCount;
      const start = (canvas.height - ((targetHoleCount - 1) * pitch + holePara)) / 2;
      for (let i = 0; i < targetHoleCount; i++) {
        const y = start + i * pitch;
        drawHole(ctx, settings, (borderSize - holePerp) / 2, y, holePerp, holePara, borderSize);
        drawHole(ctx, settings, canvas.width - (borderSize + holePerp) / 2, y, holePerp, holePara, borderSize);
      }
    } else {
      const pitch = canvas.width / targetHoleCount;
      const start = (canvas.width - ((targetHoleCount - 1) * pitch + holePara)) / 2;
      for (let i = 0; i < targetHoleCount; i++) {
        const x = start + i * pitch;
        drawHole(ctx, settings, x, (borderSize - holePerp) / 2, holePara, holePerp, borderSize);
        drawHole(ctx, settings, x, canvas.height - (borderSize + holePerp) / 2, holePara, holePerp, borderSize);
      }
    }

    ctx.fillStyle = settings.textColor;
    const fontSize = Math.max(10, Math.floor(borderSize * 0.18));
    ctx.font = `${preset.fontWeight} ${fontSize}px ${preset.fontFamily}`;
    ctx.textBaseline = 'middle';
    const brandText = settings.customText.trim() !== '' ? settings.customText : settings.brandText;
    const dateStr = dateOverride || settings.dateStr;

    if (isPortrait) {
      ctx.save();
      ctx.translate(borderSize * 0.1, canvas.height * 0.05);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(brandText, 0, 0);
      ctx.restore();
      ctx.save();
      ctx.translate(canvas.width - borderSize * 0.1, canvas.height * 0.05);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(`${settings.frameNumber}A`, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(brandText, canvas.width * 0.05, borderSize * 0.1);
      const frameText = `${settings.frameNumber}A`;
      ctx.fillText(frameText, canvas.width - ctx.measureText(frameText).width - canvas.width * 0.05, borderSize * 0.1);
      if (settings.showDate) {
        ctx.font = `normal ${Math.floor(fontSize * 0.75)}px ${preset.fontFamily}`;
        ctx.fillText(dateStr, canvas.width - ctx.measureText(dateStr).width - canvas.width * 0.05, canvas.height - borderSize * 0.1);
      }
    }

    return canvasToBlob(canvas, settings);
  } finally {
    img.close();
  }
}

async function renderReal135Frame(file: File, settings: FilmSettings, transform?: RenderTransform): Promise<Blob> {
  if (settings.brandText !== FilmType.KODAK_GOLD_200 || settings.useFilmOverlayTemplate === false) {
    return renderClassicFrame(file, { ...settings, frameRenderMode: 'classic' }, undefined, transform);
  }

  const assets = await loadKodakGoldLayeredAssets();
  const img = await createImageBitmap(file);

  try {
    const targetImageWidthPx = getReal135TargetImageWidth(img.width, settings.processingMode);
    const layout = createKodakGoldOverlayLayout(targetImageWidthPx);
    const canvas = new OffscreenCanvas(layout.filmW, layout.filmH);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas init failed');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#050403';
    ctx.fillRect(0, 0, layout.filmW, layout.filmH);

    const emulsion = new OffscreenCanvas(layout.filmW, layout.filmH);
    const emulsionCtx = emulsion.getContext('2d', { alpha: true });
    if (!emulsionCtx) throw new Error('Canvas init failed');

    emulsionCtx.imageSmoothingEnabled = true;
    emulsionCtx.imageSmoothingQuality = 'high';
    drawImageCoverAutoRotate(emulsionCtx, img, layout.imageX, layout.imageY, layout.imageW, layout.imageH, transform);
    applyGold200Look(emulsionCtx as unknown as CanvasRenderingContext2D, layout.imageX, layout.imageY, layout.imageW, layout.imageH);
    drawGrain(emulsionCtx, layout.imageX, layout.imageY, layout.imageW, layout.imageH, settings.grainIntensity);

    emulsionCtx.save();
    emulsionCtx.globalCompositeOperation = 'destination-in';
    emulsionCtx.drawImage(createLuminanceAlphaMask(assets.apertureMask, layout.filmW, layout.filmH), 0, 0);
    emulsionCtx.restore();

    ctx.drawImage(emulsion, 0, 0);
    ctx.drawImage(assets.base, 0, 0, layout.filmW, layout.filmH);
    // Keep aperture shadow disabled to match the current main-thread renderer.
    // ctx.drawImage(assets.apertureShadow, 0, 0, layout.filmW, layout.filmH);
    drawKodakGoldFrameNumbers(ctx as unknown as CanvasRenderingContext2D, layout, settings);

    const finalCanvas =
      (settings.scanOutputAspect ?? 'native') === '4:3'
        ? composeOnScannerCanvas(canvas)
        : canvas;
    const outputCanvas = restoreOutputOrientationForSource(
      finalCanvas,
      img,
      targetImageWidthPx,
      Math.round(targetImageWidthPx * 2 / 3),
      transform,
    );

    return canvasToBlob(outputCanvas, settings);
  } finally {
    img.close();
  }
}

async function renderClassicStrip(images: ImageItem[], settings: FilmSettings): Promise<Blob> {
  if (images.length === 0) throw new Error('No images to render');

  const frameHeight = 1200;
  const borderSize = Math.floor(frameHeight * 0.16);
  const imageHeight = frameHeight - borderSize * 2;
  const frameWidth = imageHeight * 1.5;
  const gap = frameWidth * 0.055;
  const maxPerRow = 6;
  const rows = Math.ceil(images.length / maxPerRow);
  const cols = Math.min(images.length, maxPerRow);
  const totalWidth = frameWidth * cols + gap * Math.max(0, cols - 1) + frameWidth * 0.4;
  const totalHeight = rows * frameHeight + Math.max(0, rows - 1) * 100;
  assertCanvasBudget(totalWidth, totalHeight);
  const canvas = new OffscreenCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Canvas init failed');

  ctx.fillStyle = settings.borderColor;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  for (let index = 0; index < images.length; index++) {
    const img = await createImageBitmap(images[index].file);
    try {
      const row = Math.floor(index / maxPerRow);
      const col = index % maxPerRow;
      const frameX = frameWidth * 0.2 + col * (frameWidth + gap);
      const frameY = row * (frameHeight + 100) + borderSize;
      drawImageCoverAutoRotate(
        ctx,
        img,
        frameX,
        frameY,
        frameWidth,
        imageHeight,
        images[index].transform,
      );
      drawGrain(ctx, frameX, frameY, frameWidth, imageHeight, settings.grainIntensity);
    } finally {
      img.close();
    }
  }

  return canvasToBlob(canvas, settings);
}

function drawReal135Hole(ctx: WorkerContext, x: number, y: number, w: number, h: number) {
  const radius = Math.round(Math.min(w, h) * 0.22);

  ctx.save();
  roundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = '#020100';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = Math.max(4, Math.round(h * 0.12));
  ctx.fill();

  ctx.clip();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = 'rgba(230, 165, 45, 0.28)';
  ctx.lineWidth = Math.max(2, Math.round(h * 0.08));
  roundedRect(ctx, x + 1, y + 1, w - 2, h - 2, radius);
  ctx.stroke();
  ctx.restore();
}

function drawContinuousDxBlocks(ctx: WorkerContext, x: number, y: number, width: number, height: number) {
  const pattern = [1, 0.35, 0.8, 0.45, 1, 0.3, 0.65, 0.9, 0.5, 1, 0.4, 0.8];
  const gap = Math.max(2, Math.round(width * 0.018));
  const blockW = Math.max(3, Math.round((width - gap * pattern.length) / pattern.length));
  let cursor = x;

  for (const p of pattern) {
    ctx.fillRect(cursor, y + height * (1 - p), blockW, height * p);
    cursor += blockW + gap;
  }
}

function drawContinuousFilmRowBase(ctx: WorkerContext, layout: ReturnType<typeof createKodakGoldStripLayout>, rowY: number, rowCount: number) {
  const frame = layout.frame;
  const rowW = frame.imageX + rowCount * frame.imageW + Math.max(0, rowCount - 1) * layout.frameGap + (frame.filmW - frame.imageX - frame.imageW);
  const radius = Math.max(10, Math.round(frame.filmH * 0.018));

  ctx.save();
  ctx.translate(layout.padding, rowY);

  ctx.fillStyle = '#050403';
  roundedRect(ctx, 0, 0, rowW, frame.filmH, radius);
  ctx.fill();

  const glow = ctx.createLinearGradient(0, 0, 0, frame.filmH);
  glow.addColorStop(0, 'rgba(255,255,255,0.055)');
  glow.addColorStop(0.42, 'rgba(255,255,255,0.012)');
  glow.addColorStop(0.58, 'rgba(0,0,0,0.1)');
  glow.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = glow;
  roundedRect(ctx, 0, 0, rowW, frame.filmH, radius);
  ctx.fill();

  for (let col = 0; col < rowCount; col++) {
    const apertureX = frame.imageX + col * layout.frameStride;
    ctx.fillStyle = '#020100';
    ctx.fillRect(apertureX - 5, frame.imageY - 5, frame.imageW + 10, frame.imageH + 10);

    ctx.strokeStyle = 'rgba(255,255,255,0.11)';
    ctx.lineWidth = Math.max(1, Math.round(frame.filmH * 0.002));
    ctx.strokeRect(apertureX - 4, frame.imageY - 4, frame.imageW + 8, frame.imageH + 8);
  }

  const holeW = Math.round(frame.imageW * 0.055);
  const holeH = Math.round(frame.topRebateH * 0.42);
  const pitch = layout.frameStride / 8;
  const topY = Math.round(frame.topRebateH * 0.42);
  const bottomY = Math.round(frame.bottomRebateY + frame.bottomRebateH * 0.18);

  for (let x = frame.imageX * 0.42; x < rowW - holeW; x += pitch) {
    drawReal135Hole(ctx, Math.round(x), topY, holeW, holeH);
    drawReal135Hole(ctx, Math.round(x), bottomY, holeW, holeH);
  }

  ctx.restore();
}

function drawContinuousStripMarkings(ctx: WorkerContext, layout: ReturnType<typeof createKodakGoldStripLayout>, rowY: number, index: number, frameNumber: number) {
  const frame = layout.frame;
  const col = index % layout.maxPerRow;
  const slotX = layout.padding + col * layout.frameStride;
  const imageX = slotX + frame.imageX;
  const textColor = '#d99a16';

  ctx.save();
  ctx.translate(0, rowY);
  ctx.beginPath();
  ctx.rect(slotX, 0, layout.frameStride, frame.filmH);
  ctx.clip();
  ctx.fillStyle = textColor;
  ctx.globalAlpha = 0.9;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 2;

  const brandFont = Math.max(12, Math.round(frame.topRebateH * 0.118));
  const numberFont = Math.max(12, Math.round(frame.topRebateH * 0.11));
  const smallFont = Math.max(10, Math.round(frame.bottomRebateH * 0.09));
  const topLabelY = Math.round(frame.topRebateH * 0.16);
  const topNumberY = Math.round(frame.topRebateH * 0.29);
  const bottomBarcodeY = Math.round(frame.bottomRebateY + frame.bottomRebateH * 0.64);
  const bottomTextY = Math.round(frame.bottomRebateY + frame.bottomRebateH * 0.82);
  const bottomNumberY = Math.round(frame.bottomRebateY + frame.bottomRebateH * 0.92);

  ctx.font = `900 ${brandFont}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('KODAK  GOLD 200', slotX + frame.imageX * 0.18, topLabelY);

  ctx.textAlign = 'center';
  ctx.font = `800 ${Math.round(brandFont * 0.86)}px Arial, Helvetica, sans-serif`;
  ctx.fillText('GB 36', imageX + frame.imageW * 0.53, topLabelY);

  ctx.textAlign = 'right';
  ctx.font = `900 ${brandFont}px Arial, Helvetica, sans-serif`;
  ctx.fillText('KODAK', imageX + frame.imageW * 0.91, topLabelY);

  ctx.textAlign = 'center';
  ctx.font = `900 ${numberFont}px Arial, Helvetica, sans-serif`;
  ctx.fillText(String(frameNumber), imageX + frame.imageW * 0.5, topNumberY);
  ctx.fillText(String(frameNumber), imageX + frame.imageW * 0.5, bottomNumberY);

  ctx.textAlign = 'left';
  ctx.font = `800 ${smallFont}px Arial, Helvetica, sans-serif`;
  ctx.fillText('DX', slotX + frame.imageX * 0.18, bottomTextY);
  ctx.fillText('SAFETY FILM', imageX + frame.imageW * 0.43, bottomTextY);
  drawContinuousDxBlocks(ctx, imageX + frame.imageW * 0.1, bottomBarcodeY, frame.imageW * 0.22, smallFont);
  drawContinuousDxBlocks(ctx, imageX + frame.imageW * 0.72, bottomBarcodeY, frame.imageW * 0.18, smallFont);

  ctx.restore();
}

async function renderReal135Strip(images: ImageItem[], settings: FilmSettings): Promise<Blob> {
  if (images.length === 0) throw new Error('No images to render');
  if (settings.brandText !== FilmType.KODAK_GOLD_200 || settings.useFilmOverlayTemplate === false) {
    return renderClassicStrip(images, { ...settings, frameRenderMode: 'classic' });
  }

  const targetImageWidthPx = getReal135StripTargetImageWidth(settings.processingMode);
  const layout = createKodakGoldStripLayout(targetImageWidthPx, images.length, 4);
  assertCanvasBudget(layout.totalW, layout.totalH);
  const canvas = new OffscreenCanvas(layout.totalW, layout.totalH);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas init failed');

  ctx.fillStyle = '#161514';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < layout.rows; row++) {
    const rowCount = Math.min(layout.maxPerRow, images.length - row * layout.maxPerRow);
    const y = layout.padding + row * (layout.frame.filmH + layout.rowGap);
    drawContinuousFilmRowBase(ctx, layout, y, rowCount);
  }

  for (let index = 0; index < images.length; index++) {
    const img = await createImageBitmap(images[index].file);
    try {
      const row = Math.floor(index / layout.maxPerRow);
      const col = index % layout.maxPerRow;
      const y = layout.padding + row * (layout.frame.filmH + layout.rowGap);
      const imageX = layout.padding + layout.frame.imageX + col * layout.frameStride;
      const imageY = y + layout.frame.imageY;

      ctx.save();
      drawImageCoverAutoRotate(ctx, img, imageX, imageY, layout.frame.imageW, layout.frame.imageH, images[index].transform);
      applyGold200Look(ctx as unknown as CanvasRenderingContext2D, imageX, imageY, layout.frame.imageW, layout.frame.imageH);
      drawGrain(ctx, imageX, imageY, layout.frame.imageW, layout.frame.imageH, settings.grainIntensity);
      ctx.strokeStyle = 'rgba(0,0,0,0.72)';
      ctx.lineWidth = Math.max(2, Math.round(layout.frame.filmH * 0.003));
      ctx.strokeRect(imageX, imageY, layout.frame.imageW, layout.frame.imageH);
      ctx.restore();

      const frameNumber = getFrameNumberForIndex(
        settings.frameNumber,
        index,
        settings.maxRollFrames ?? 36,
      );
      drawContinuousStripMarkings(ctx, layout, y, index, frameNumber);
    } finally {
      img.close();
    }
  }

  return canvasToBlob(canvas, settings);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const blob =
      request.type === 'processImage'
        ? (request.settings.frameRenderMode ?? 'real135') === 'real135'
          ? await renderReal135Frame(request.file, request.settings, request.transform)
          : await renderClassicFrame(request.file, request.settings, request.dateOverride, request.transform)
        : (request.settings.frameRenderMode ?? 'real135') === 'real135'
          ? await renderReal135Strip(request.images, request.settings)
          : await renderClassicStrip(request.images, request.settings);

    self.postMessage({ id: request.id, ok: true, blob } satisfies WorkerResponse);
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Worker render failed',
    } satisfies WorkerResponse);
  }
};
