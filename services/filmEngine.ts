
import { DEFAULT_SCAN_BACKGROUND_COLOR, FilmSettings, FILM_PRESETS, FilmType, ImageItem, RenderTransform } from '../types';
import { applyGold200Look } from './filmColor';
import {
  getReal135SprocketColor,
  getReal135SprocketMaskUrl,
  paintTintedSprocketMask,
  REAL135_SPROCKET_MASK_HEIGHT,
  REAL135_SPROCKET_MASK_WIDTH,
} from './filmSprocket';
import {
  drawFilmTemplateFrameNumber,
  drawKodakGoldFrameNumbers,
  getFrameNumberColor,
  getFrameNumberForImage,
} from './filmFrameNumber';
import {
  create135LandscapeLayout,
  create135SidePerforationLayout,
  drawImageCoverAutoRotate,
  drawImageCoverWithTransform,
  Film135Layout,
  Film135SideLayout,
  PHYS_135,
} from './filmGeometry';
import { getRotatedDimensions, normalizeRenderTransform } from './renderTransform';
import { draw135Markings, draw135SideMarkings } from './filmMarkings';
import {
  KODAK_GOLD_APERTURE_MASK_URL,
  KODAK_GOLD_APERTURE_SHADOW_URL,
  KODAK_GOLD_BASE_URL,
  createFilmTemplateStripLayout,
  createKodakGoldStripLayout,
  createKodakGoldOverlayLayout,
  drawKodakGoldOverlayLayer,
  getReal135OverlayUrl,
  KodakGoldOverlayLayout,
  supportsReal135Template,
} from './filmOverlay';
import {
  drawDust,
  drawFilmBaseTexture,
  drawGrain as drawRealGrain,
  drawRealFilmStockTexture,
} from './filmTexture';
import {
  getReal135StripTargetImageWidth,
  getReal135TargetImageWidth,
  getScannerCanvasSize,
} from './filmResolution';
import { assertCanvasBudget, type RenderBudgetLimits } from './renderBudget';
import {
  createLuminanceAlphaMask,
  exportCanvasToObjectUrl,
  loadCanvasImage,
  restoreOutputOrientationForSource,
} from './canvasRuntime';

/**
 * 绘制圆角矩形 polyfill
 */
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

async function createTintedSprocketOverlay(
  settings: FilmSettings,
  renderBudgetLimits: RenderBudgetLimits = {},
): Promise<HTMLCanvasElement | null> {
  const color = getReal135SprocketColor(settings);
  const maskUrl = getReal135SprocketMaskUrl(settings.brandText);
  if (!color || !maskUrl) return null;

  try {
    const mask = await loadCanvasImage(maskUrl);
    assertCanvasBudget(
      REAL135_SPROCKET_MASK_WIDTH,
      REAL135_SPROCKET_MASK_HEIGHT,
      renderBudgetLimits,
    );
    const canvas = document.createElement('canvas');
    canvas.width = REAL135_SPROCKET_MASK_WIDTH;
    canvas.height = REAL135_SPROCKET_MASK_HEIGHT;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;
    paintTintedSprocketMask(context, mask, color, canvas.width, canvas.height);
    return canvas;
  } catch (error) {
    console.warn('Sprocket mask unavailable; preserving the source template.', error);
    return null;
  }
}

type KodakGoldLayeredAssets = {
  base: HTMLImageElement;
  apertureMask: HTMLImageElement;
  apertureShadow: HTMLImageElement;
};

let kodakGoldLayeredAssetsPromise: Promise<KodakGoldLayeredAssets> | null = null;

const loadKodakGoldLayeredAssets = (): Promise<KodakGoldLayeredAssets> => {
  if (!kodakGoldLayeredAssetsPromise) {
    kodakGoldLayeredAssetsPromise = Promise.all([
      loadCanvasImage(KODAK_GOLD_BASE_URL),
      loadCanvasImage(KODAK_GOLD_APERTURE_MASK_URL),
      loadCanvasImage(KODAK_GOLD_APERTURE_SHADOW_URL),
    ])
      .then(([base, apertureMask, apertureShadow]) => ({ base, apertureMask, apertureShadow }))
      .catch((error) => {
        kodakGoldLayeredAssetsPromise = null;
        throw error;
      });
  }

  return kodakGoldLayeredAssetsPromise;
};

/**
 * 内部辅助：绘制单个齿孔（带3D效果）
 */
const drawHole = (
  ctx: CanvasRenderingContext2D, 
  settings: FilmSettings, 
  x: number, 
  y: number, 
  w: number, 
  h: number, 
  borderSize: number
) => {
  const roundingRatio = settings.holeType === 'rounded' ? 0.35 : 0.12;
  const radius = Math.min(w, h) * roundingRatio;

  // A. 基础孔填充
  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = settings.holeColor;
  ctx.fill();

  // B. 3D 深度感 (Inner Shadow + Highlight)
  ctx.clip();

  const strokeWidth = Math.max(2, borderSize * 0.15); 
  const pathOffset = strokeWidth / 2;
  const blurSize = Math.max(2, borderSize * 0.05);
  const shadowDist = Math.max(1, borderSize * 0.02);

  const traceOuterShape = () => {
    ctx.beginPath();
    drawRoundedRect(
      ctx,
      x - pathOffset,
      y - pathOffset,
      w + pathOffset * 2,
      h + pathOffset * 2,
      radius + pathOffset
    );
  };

  // 1. 内阴影 (Top-Left)
  traceOuterShape();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = strokeWidth;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = blurSize;
  ctx.shadowOffsetX = shadowDist;
  ctx.shadowOffsetY = shadowDist;
  ctx.stroke();

  // 2. 内高光 (Bottom-Right)
  traceOuterShape();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = strokeWidth;
  ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
  ctx.shadowBlur = blurSize;
  ctx.shadowOffsetX = -shadowDist;
  ctx.shadowOffsetY = -shadowDist;
  ctx.stroke();

  ctx.restore();
};

// 缓存噪点 Canvas，避免重复创建
let cachedNoiseCanvas: HTMLCanvasElement | null = null;

/**
 * 创建高斯噪点纹理 (256x256 小图)
 * 相比于在主画布上逐像素操作，先生成小块纹理再平铺 (Pattern) 性能提升巨大。
 * 优化：使用 Box-Muller 变换生成真实的高斯分布(正态分布)噪点，而非简单的 Uniform Noise。
 */
const getNoisePatternCanvas = (renderBudgetLimits: RenderBudgetLimits = {}): HTMLCanvasElement => {
  if (cachedNoiseCanvas) return cachedNoiseCanvas;

  const size = 256;
  assertCanvasBudget(size, size, renderBudgetLimits);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    // Box-Muller 变换生成正态分布
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    
    // 标准正态分布 N(0, 1)
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    
    // 调整到 0-255 范围，中心点为 128 (Overlay 混合模式的中性点)
    // 30 是标准差，决定了噪点的对比度
    let val = 128 + z * 30;
    val = Math.max(0, Math.min(255, val));

    data[i] = val;     // R
    data[i+1] = val;   // G
    data[i+2] = val;   // B
    data[i+3] = 255;   // Alpha
  }
  
  ctx.putImageData(imageData, 0, 0);
  cachedNoiseCanvas = canvas;
  return canvas;
};

/**
 * 内部辅助：绘制颗粒 (性能优化版)
 * 使用 globalCompositeOperation = 'overlay' 配合 Pattern 填充
 */
const drawGrain = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  intensity: number,
  renderBudgetLimits: RenderBudgetLimits = {},
) => {
  if (intensity <= 0) return;
  if (width <= 0 || height <= 0) return;

  ctx.save();
  
  // 1. 限制绘制区域
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  // 2. 准备噪点纹理
  const noiseCanvas = getNoisePatternCanvas(renderBudgetLimits);
  const pattern = ctx.createPattern(noiseCanvas, 'repeat');

  if (pattern) {
    // 3. 设置混合模式
    // 'overlay' 模式会根据底色叠加噪点，亮部更亮，暗部更暗，非常适合模拟胶片颗粒
    // 同时也比逐像素计算快得多
    ctx.globalCompositeOperation = 'overlay';
    
    // 4. 通过透明度控制强度
    // 强度系数映射，让用户感知的 0-60 范围比较线性
    ctx.globalAlpha = Math.min(1.0, (intensity / 100) * 2.0);
    
    ctx.fillStyle = pattern;
    
    // 随机偏移纹理原点，避免多张图的噪点模式完全一致
    const offsetX = Math.random() * 256;
    const offsetY = Math.random() * 256;
    ctx.translate(offsetX, offsetY);
    
    // 绘制覆盖整个区域的矩形 (反向偏移回来以覆盖左上角)
    ctx.fillRect(-offsetX, -offsetY, width + offsetX, height + offsetY); 
  }

  ctx.restore();
};

function drawFilmBase(
  ctx: CanvasRenderingContext2D,
  layout: Film135Layout,
  settings: FilmSettings
) {
  const base = settings.enableRealisticRebate === false ? settings.borderColor : '#090807';

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, layout.filmW, layout.filmH);

  if (settings.enableRealisticRebate === false) return;

  const gradient = ctx.createRadialGradient(
    layout.filmW / 2,
    layout.filmH / 2,
    layout.filmH * 0.2,
    layout.filmW / 2,
    layout.filmH / 2,
    layout.filmW * 0.75
  );

  gradient.addColorStop(0, 'rgba(255,255,255,0.035)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.18)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, layout.filmW, layout.filmH);
}

function drawReal135FilmBase(
  ctx: CanvasRenderingContext2D,
  layout: Film135SideLayout,
  settings: FilmSettings
) {
  const radius = Math.round(layout.sideRailW * 0.6);

  ctx.save();
  drawRoundedRect(ctx, 0, 0, layout.filmW, layout.filmH, radius);
  ctx.clip();

  const base = settings.enableRealisticRebate === false ? settings.borderColor : '#060504';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, layout.filmW, layout.filmH);

  if (settings.enableRealisticRebate !== false) {
    const gradient = ctx.createLinearGradient(0, 0, layout.filmW, 0);
    gradient.addColorStop(0, 'rgba(255, 190, 72, 0.12)');
    gradient.addColorStop(0.14, 'rgba(255, 190, 72, 0.035)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.015)');
    gradient.addColorStop(0.86, 'rgba(255, 190, 72, 0.04)');
    gradient.addColorStop(1, 'rgba(255, 190, 72, 0.14)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, layout.filmW, layout.filmH);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000000';
    ctx.fillRect(layout.sideRailW, 0, Math.max(1, layout.pxPerMm * 0.12), layout.filmH);
    ctx.fillRect(layout.imageX + layout.imageW, 0, Math.max(1, layout.pxPerMm * 0.12), layout.filmH);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawImageGateShadow(ctx: CanvasRenderingContext2D, layout: Film135SideLayout) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.72)';
  ctx.lineWidth = Math.max(3, Math.round(layout.pxPerMm * 0.08));
  ctx.strokeRect(layout.imageX, layout.imageY, layout.imageW, layout.imageH);

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000000';
  ctx.fillRect(layout.imageX - Math.round(layout.pxPerMm * 0.12), layout.imageY, Math.round(layout.pxPerMm * 0.12), layout.imageH);
  ctx.fillRect(layout.imageX + layout.imageW, layout.imageY, Math.round(layout.pxPerMm * 0.12), layout.imageH);
  ctx.restore();
}

function draw135Perforations(
  ctx: CanvasRenderingContext2D,
  layout: Film135Layout,
  settings: FilmSettings
) {
  const holeColor = settings.holeColor || '#f2efe6';

  for (let i = 0; i < PHYS_135.perforationsPerFrame; i++) {
    const x = Math.round(layout.perfStartX + i * layout.perfPitch);

    drawHole(ctx, { ...settings, holeColor }, x, layout.perfTopY, layout.perfW, layout.perfH, layout.topRebateH);
    drawHole(ctx, { ...settings, holeColor }, x, layout.perfBottomY, layout.perfW, layout.perfH, layout.bottomRebateH);
  }
}

function drawReal135SidePerforations(
  ctx: CanvasRenderingContext2D,
  layout: Film135SideLayout,
  settings: FilmSettings,
) {
  const color = getReal135SprocketColor(settings) ?? '#020100';
  for (let i = 0; i < layout.perfCount; i++) {
    const y = Math.round(layout.perfStartY + i * layout.perfPitch);
    drawReal135Hole(ctx, layout.perfLeftX, y, layout.perfW, layout.perfH, color);
    drawReal135Hole(ctx, layout.perfRightX, y, layout.perfW, layout.perfH, color);
  }
}

function drawReal135Hole(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color = '#020100',
) {
  const radius = Math.round(Math.min(w, h) * 0.22);

  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = Math.max(4, Math.round(h * 0.12));
  ctx.fill();

  ctx.clip();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = 'rgba(230, 165, 45, 0.28)';
  ctx.lineWidth = Math.max(2, Math.round(h * 0.08));
  drawRoundedRect(ctx, x + 1, y + 1, w - 2, h - 2, radius);
  ctx.stroke();
  ctx.restore();
}

function composeOnScannerCanvas(
  filmCanvas: HTMLCanvasElement,
  backgroundColor = DEFAULT_SCAN_BACKGROUND_COLOR,
  renderBudgetLimits: RenderBudgetLimits = {},
): HTMLCanvasElement {
  const { width: canvasW, height: canvasH } = getScannerCanvasSize({
    width: filmCanvas.width,
    height: filmCanvas.height,
  });

  assertCanvasBudget(canvasW, canvasH, renderBudgetLimits);
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context not found');

  ctx.fillStyle = backgroundColor;
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

export const processImageReal135 = async (
  imageSource: string,
  settings: FilmSettings,
  dateOverride?: string,
  transform?: RenderTransform,
  renderBudgetLimits: RenderBudgetLimits = {},
): Promise<string> => {
  const img = await loadCanvasImage(imageSource);
  const targetImageWidthPx = getReal135TargetImageWidth(img.width, settings.processingMode);
  const layout = create135SidePerforationLayout(targetImageWidthPx);

  assertCanvasBudget(layout.filmW, layout.filmH, renderBudgetLimits);
  const filmCanvas = document.createElement('canvas');
  filmCanvas.width = layout.filmW;
  filmCanvas.height = layout.filmH;

  const ctx = filmCanvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not found');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  drawReal135FilmBase(ctx, layout, settings);
  drawImageCoverAutoRotate(ctx, img, layout.imageX, layout.imageY, layout.imageW, layout.imageH, transform);
  drawImageGateShadow(ctx, layout);

  if (settings.brandText === FilmType.KODAK_GOLD_200) {
    applyGold200Look(ctx, layout.imageX, layout.imageY, layout.imageW, layout.imageH);
  }

  drawRealGrain(ctx, layout.imageX, layout.imageY, layout.imageW, layout.imageH, settings.grainIntensity);
  drawReal135SidePerforations(ctx, layout, settings);
  draw135SideMarkings(ctx, layout, settings);
  drawRealFilmStockTexture(ctx, layout, settings);
  drawDust(ctx, layout.filmW, layout.filmH, 30);

  const finalCanvas =
    (settings.scanOutputAspect ?? '4:3') === '4:3'
      ? composeOnScannerCanvas(
        filmCanvas,
        settings.scanBackgroundColor ?? DEFAULT_SCAN_BACKGROUND_COLOR,
        renderBudgetLimits,
      )
      : filmCanvas;

  const outputCanvas = restoreOutputOrientationForSource(
    finalCanvas,
    img,
    layout.imageW,
    layout.imageH,
    transform,
    renderBudgetLimits,
  );
  return exportCanvasToObjectUrl(outputCanvas, settings.outputFormat, settings.outputQuality);
};

const processImageWithTemplateOverlay = async (
  imageSource: string,
  settings: FilmSettings,
  transform?: RenderTransform,
  renderBudgetLimits: RenderBudgetLimits = {},
): Promise<string | null> => {
  if (settings.useFilmOverlayTemplate === false) return null;
  const registeredOverlayUrl = getReal135OverlayUrl(settings.brandText);
  if (!registeredOverlayUrl) return null;
  const sprocketOverlay = await createTintedSprocketOverlay(settings, renderBudgetLimits);

  if (settings.brandText === FilmType.KODAK_GOLD_200) {
    try {
      const layeredAssets = await loadKodakGoldLayeredAssets();
      const img = await loadCanvasImage(imageSource);
      const targetImageWidthPx = getReal135TargetImageWidth(img.width, settings.processingMode);
      const canvas = renderKodakGoldLayeredFrameCanvas(
        img,
        layeredAssets.base,
        layeredAssets.apertureMask,
        layeredAssets.apertureShadow,
        settings,
        targetImageWidthPx,
        transform,
        sprocketOverlay,
        renderBudgetLimits,
      );

      const finalCanvas =
        (settings.scanOutputAspect ?? 'native') === '4:3'
          ? composeOnScannerCanvas(
            canvas,
            settings.scanBackgroundColor ?? DEFAULT_SCAN_BACKGROUND_COLOR,
            renderBudgetLimits,
          )
          : canvas;

      const outputCanvas = restoreOutputOrientationForSource(
        finalCanvas,
        img,
        targetImageWidthPx,
        Math.round(targetImageWidthPx * 2 / 3),
        transform,
        renderBudgetLimits,
      );
      return exportCanvasToObjectUrl(outputCanvas, settings.outputFormat, settings.outputQuality);
    } catch (error) {
      console.warn('Layered film assets not available, falling back to flattened template.', error);
    }
  }

  try {
    const overlayUrl = settings.brandText === FilmType.KODAK_GOLD_200
      ? settings.filmOverlayUrl || registeredOverlayUrl
      : registeredOverlayUrl;
    const overlay = await loadCanvasImage(overlayUrl);
    const img = await loadCanvasImage(imageSource);
    const targetImageWidthPx = getReal135TargetImageWidth(img.width, settings.processingMode);
    const canvas = renderKodakGoldTemplateFrameCanvas(
      img,
      overlay,
      settings,
      targetImageWidthPx,
      transform,
      sprocketOverlay,
      renderBudgetLimits,
    );

    const finalCanvas =
      (settings.scanOutputAspect ?? 'native') === '4:3'
        ? composeOnScannerCanvas(
          canvas,
          settings.scanBackgroundColor ?? DEFAULT_SCAN_BACKGROUND_COLOR,
          renderBudgetLimits,
        )
        : canvas;

    const outputCanvas = restoreOutputOrientationForSource(
      finalCanvas,
      img,
      targetImageWidthPx,
      Math.round(targetImageWidthPx * 2 / 3),
      transform,
      renderBudgetLimits,
    );
    return exportCanvasToObjectUrl(outputCanvas, settings.outputFormat, settings.outputQuality);
  } catch (error) {
    console.warn('Film overlay template not available, falling back to programmatic renderer.', error);
    return null;
  }
};

function renderKodakGoldTemplateFrameCanvas(
  img: HTMLImageElement,
  overlay: HTMLImageElement,
  settings: FilmSettings,
  targetImageWidthPx: number,
  transform?: RenderTransform,
  sprocketOverlay?: CanvasImageSource | null,
  renderBudgetLimits: RenderBudgetLimits = {},
): HTMLCanvasElement {
  const layout = createKodakGoldOverlayLayout(targetImageWidthPx);
  assertCanvasBudget(layout.filmW, layout.filmH, renderBudgetLimits);
  const canvas = document.createElement('canvas');
  canvas.width = layout.filmW;
  canvas.height = layout.filmH;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context not found');

  drawKodakGoldTemplateFrame(ctx, img, overlay, layout, settings, transform, sprocketOverlay);
  return canvas;
}

function renderKodakGoldLayeredFrameCanvas(
  img: HTMLImageElement,
  base: HTMLImageElement,
  apertureMask: HTMLImageElement,
  apertureShadow: HTMLImageElement,
  settings: FilmSettings,
  targetImageWidthPx: number,
  transform?: RenderTransform,
  sprocketOverlay?: CanvasImageSource | null,
  renderBudgetLimits: RenderBudgetLimits = {},
): HTMLCanvasElement {
  const layout = createKodakGoldOverlayLayout(targetImageWidthPx);
  assertCanvasBudget(layout.filmW, layout.filmH, renderBudgetLimits);
  const canvas = document.createElement('canvas');
  canvas.width = layout.filmW;
  canvas.height = layout.filmH;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context not found');

  drawKodakGoldLayeredFrame(
    ctx,
    img,
    base,
    apertureMask,
    apertureShadow,
    layout,
    settings,
    transform,
    sprocketOverlay,
    renderBudgetLimits,
  );
  return canvas;
}

function drawKodakGoldLayeredFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  base: HTMLImageElement,
  apertureMask: HTMLImageElement,
  apertureShadow: HTMLImageElement,
  layout: KodakGoldOverlayLayout,
  settings: FilmSettings,
  transform?: RenderTransform,
  sprocketOverlay?: CanvasImageSource | null,
  renderBudgetLimits: RenderBudgetLimits = {},
) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#050403';
  ctx.fillRect(0, 0, layout.filmW, layout.filmH);

  assertCanvasBudget(layout.filmW, layout.filmH, renderBudgetLimits);
  const emulsion = document.createElement('canvas');
  emulsion.width = layout.filmW;
  emulsion.height = layout.filmH;

  const emulsionCtx = emulsion.getContext('2d', { alpha: true });
  if (!emulsionCtx) throw new Error('Canvas context not found');

  emulsionCtx.imageSmoothingEnabled = true;
  emulsionCtx.imageSmoothingQuality = 'high';
  drawImageCoverAutoRotate(emulsionCtx, img, layout.imageX, layout.imageY, layout.imageW, layout.imageH, transform);

  if (settings.brandText === FilmType.KODAK_GOLD_200) {
    applyGold200Look(emulsionCtx, layout.imageX, layout.imageY, layout.imageW, layout.imageH);
  }

  drawRealGrain(emulsionCtx, layout.imageX, layout.imageY, layout.imageW, layout.imageH, settings.grainIntensity);

  emulsionCtx.save();
  emulsionCtx.globalCompositeOperation = 'destination-in';
  emulsionCtx.drawImage(
    createLuminanceAlphaMask(
      apertureMask,
      layout.filmW,
      layout.filmH,
      renderBudgetLimits,
    ),
    0,
    0,
  );
  emulsionCtx.restore();

  ctx.drawImage(emulsion, 0, 0);
  ctx.drawImage(base, 0, 0, layout.filmW, layout.filmH);
  if (sprocketOverlay) {
    ctx.drawImage(sprocketOverlay, 0, 0, layout.filmW, layout.filmH);
  }
  // Temporarily disabled to avoid darkening the photo edges.
  // ctx.drawImage(apertureShadow, 0, 0, layout.filmW, layout.filmH);
  drawKodakGoldFrameNumbers(ctx, layout, settings);
}

function drawKodakGoldTemplateFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  overlay: HTMLImageElement,
  layout: KodakGoldOverlayLayout,
  settings: FilmSettings,
  transform?: RenderTransform,
  sprocketOverlay?: CanvasImageSource | null,
) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#050403';
  ctx.fillRect(0, 0, layout.filmW, layout.filmH);

  ctx.drawImage(overlay, 0, 0, layout.filmW, layout.filmH);
  drawImageCoverAutoRotate(ctx, img, layout.imageX, layout.imageY, layout.imageW, layout.imageH, transform);

  if (settings.brandText === FilmType.KODAK_GOLD_200) {
    applyGold200Look(ctx, layout.imageX, layout.imageY, layout.imageW, layout.imageH);
  }

  drawRealGrain(ctx, layout.imageX, layout.imageY, layout.imageW, layout.imageH, settings.grainIntensity);
  drawKodakGoldOverlayLayer(ctx, overlay, layout);
  if (sprocketOverlay) {
    ctx.drawImage(sprocketOverlay, 0, 0, layout.filmW, layout.filmH);
  }
  if (settings.brandText === FilmType.KODAK_GOLD_200) {
    drawKodakGoldFrameNumbers(ctx, layout, settings);
  } else {
    drawFilmTemplateFrameNumber(ctx, layout, settings);
  }
}

function drawContinuousFilmRowBase(
  ctx: CanvasRenderingContext2D,
  layout: ReturnType<typeof createKodakGoldStripLayout>,
  rowY: number,
  rowCount: number,
  settings: FilmSettings,
) {
  const frame = layout.frame;
  const rowW = frame.imageX + rowCount * frame.imageW + Math.max(0, rowCount - 1) * layout.frameGap + (frame.filmW - frame.imageX - frame.imageW);
  const radius = Math.max(10, Math.round(frame.filmH * 0.018));

  ctx.save();
  ctx.translate(layout.padding, rowY);

  ctx.fillStyle = '#050403';
  drawRoundedRect(ctx, 0, 0, rowW, frame.filmH, radius);
  ctx.fill();

  const glow = ctx.createLinearGradient(0, 0, 0, frame.filmH);
  glow.addColorStop(0, 'rgba(255,255,255,0.055)');
  glow.addColorStop(0.42, 'rgba(255,255,255,0.012)');
  glow.addColorStop(0.58, 'rgba(0,0,0,0.1)');
  glow.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = glow;
  drawRoundedRect(ctx, 0, 0, rowW, frame.filmH, radius);
  ctx.fill();

  // Continuous base texture: the strip should read as one physical film stock, not repeated single-frame PNGs.
  for (let i = 0; i < Math.round(rowW * frame.filmH / 1050); i++) {
    const x = Math.random() * rowW;
    const y = Math.random() * frame.filmH;
    ctx.globalAlpha = 0.012 + Math.random() * 0.045;
    ctx.fillStyle = Math.random() > 0.5 ? '#3a2b19' : '#000000';
    ctx.fillRect(x, y, 1, 1);
  }

  ctx.globalAlpha = 1;
  for (let col = 0; col < rowCount; col++) {
    const apertureX = frame.imageX + col * layout.frameStride;
    ctx.fillStyle = '#020100';
    ctx.fillRect(apertureX - 5, frame.imageY - 5, frame.imageW + 10, frame.imageH + 10);

    ctx.strokeStyle = 'rgba(255,255,255,0.11)';
    ctx.lineWidth = Math.max(1, Math.round(frame.filmH * 0.002));
    ctx.strokeRect(apertureX - 4, frame.imageY - 4, frame.imageW + 8, frame.imageH + 8);

    if (col < rowCount - 1) {
      const gapX = apertureX + frame.imageW;
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(gapX, frame.imageY - 8, layout.frameGap, frame.imageH + 16);
    }
  }

  drawContinuousSprocketHoles(
    ctx,
    frame,
    rowW,
    layout.frameStride,
    getReal135SprocketColor(settings) ?? '#020100',
  );
  ctx.restore();
}

function drawContinuousSprocketHoles(
  ctx: CanvasRenderingContext2D,
  frame: KodakGoldOverlayLayout,
  rowW: number,
  frameStride: number,
  color: string,
) {
  const holeW = Math.round(frame.imageW * 0.055);
  const holeH = Math.round(frame.topRebateH * 0.42);
  const pitch = frameStride / 8;
  const topY = Math.round(frame.topRebateH * 0.42);
  const bottomY = Math.round(frame.bottomRebateY + frame.bottomRebateH * 0.18);

  for (let x = frame.imageX * 0.42; x < rowW - holeW; x += pitch) {
    drawReal135Hole(ctx, Math.round(x), topY, holeW, holeH, color);
    drawReal135Hole(ctx, Math.round(x), bottomY, holeW, holeH, color);
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = Math.max(1, Math.round(frame.filmH * 0.002));
  ctx.strokeRect(2, 2, rowW - 4, frame.filmH - 4);
  ctx.restore();
}

function drawContinuousStripMarkings(
  ctx: CanvasRenderingContext2D,
  layout: ReturnType<typeof createKodakGoldStripLayout>,
  rowY: number,
  index: number,
  settings: FilmSettings,
) {
  const frame = layout.frame;
  const col = index % layout.maxPerRow;
  const slotX = layout.padding + col * layout.frameStride;
  const imageX = slotX + frame.imageX;
  const textColor = '#d99a16';
  const frameNumberColor = getFrameNumberColor(settings, textColor);

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
  ctx.fillStyle = frameNumberColor;
  ctx.fillText(String(settings.frameNumber), imageX + frame.imageW * 0.5, topNumberY);
  ctx.fillText(String(settings.frameNumber), imageX + frame.imageW * 0.5, bottomNumberY);

  ctx.textAlign = 'left';
  ctx.font = `800 ${smallFont}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = textColor;
  ctx.fillText('DX', slotX + frame.imageX * 0.18, bottomTextY);
  ctx.fillText('SAFETY FILM', imageX + frame.imageW * 0.43, bottomTextY);
  drawContinuousDxBlocks(ctx, imageX + frame.imageW * 0.1, bottomBarcodeY, frame.imageW * 0.22, smallFont);
  drawContinuousDxBlocks(ctx, imageX + frame.imageW * 0.72, bottomBarcodeY, frame.imageW * 0.18, smallFont);

  ctx.restore();
}

function drawContinuousDxBlocks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const pattern = [1, 0.35, 0.8, 0.45, 1, 0.3, 0.65, 0.9, 0.5, 1, 0.4, 0.8];
  const gap = Math.max(2, Math.round(width * 0.018));
  const blockW = Math.max(3, Math.round((width - gap * pattern.length) / pattern.length));
  let cursor = x;

  for (const p of pattern) {
    ctx.fillRect(cursor, y + height * (1 - p), blockW, height * p);
    cursor += blockW + gap;
  }
}

const generateReal135FilmStrip = async (
  images: ImageItem[],
  settings: FilmSettings,
  renderBudgetLimits: RenderBudgetLimits = {},
): Promise<string | null> => {
  if (settings.useFilmOverlayTemplate === false || !supportsReal135Template(settings.brandText)) return null;
  if (settings.brandText !== FilmType.KODAK_GOLD_200) {
    const overlayUrl = getReal135OverlayUrl(settings.brandText);
    if (!overlayUrl) return null;

    let overlay: HTMLImageElement;
    try {
      overlay = await loadCanvasImage(overlayUrl);
    } catch (error) {
      console.warn('Film strip overlay template not available, falling back to classic strip.', error);
      return null;
    }
    const sprocketOverlay = await createTintedSprocketOverlay(settings, renderBudgetLimits);

    const targetImageWidthPx = getReal135StripTargetImageWidth(settings.processingMode);
    const layout = createFilmTemplateStripLayout(targetImageWidthPx, images.length, 4);
    assertCanvasBudget(layout.totalW, layout.totalH, renderBudgetLimits);
    const canvas = document.createElement('canvas');
    canvas.width = layout.totalW;
    canvas.height = layout.totalH;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas context not found');

    ctx.fillStyle = '#161514';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let index = 0; index < images.length; index++) {
      const row = Math.floor(index / layout.maxPerRow);
      const col = index % layout.maxPerRow;
      const x = layout.padding + col * layout.frameStride;
      const y = layout.padding + row * (layout.frame.filmH + layout.rowGap);
      const img = await loadCanvasImage(images[index].previewUrl);
      const frameSettings = {
        ...settings,
        frameNumber: getFrameNumberForImage(
          settings.frameNumber,
          images[index],
          index,
          settings.maxRollFrames ?? 36,
        ),
      };

      ctx.save();
      ctx.translate(x, y);
      drawKodakGoldTemplateFrame(
        ctx,
        img,
        overlay,
        layout.frame,
        frameSettings,
        images[index].transform,
        sprocketOverlay,
      );
      ctx.restore();
    }

    return exportCanvasToObjectUrl(
      canvas,
      settings.outputFormat,
      settings.outputQuality,
      'Failed to export template film strip blob',
    );
  }

  const targetImageWidthPx = getReal135StripTargetImageWidth(settings.processingMode);
  const layout = createKodakGoldStripLayout(targetImageWidthPx, images.length, 4);
  assertCanvasBudget(layout.totalW, layout.totalH, renderBudgetLimits);
  const canvas = document.createElement('canvas');
  canvas.width = layout.totalW;
  canvas.height = layout.totalH;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context not found');

  ctx.fillStyle = '#161514';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < layout.rows; row++) {
    const rowCount = Math.min(layout.maxPerRow, images.length - row * layout.maxPerRow);
    const y = layout.padding + row * (layout.frame.filmH + layout.rowGap);
    drawContinuousFilmRowBase(ctx, layout, y, rowCount, settings);
  }

  for (let index = 0; index < images.length; index++) {
    const row = Math.floor(index / layout.maxPerRow);
    const col = index % layout.maxPerRow;
    const y = layout.padding + row * (layout.frame.filmH + layout.rowGap);
    const img = await loadCanvasImage(images[index].previewUrl);
    const frameSettings = {
      ...settings,
      frameNumber: getFrameNumberForImage(
        settings.frameNumber,
        images[index],
        index,
        settings.maxRollFrames ?? 36,
      ),
    };

    const imageX = layout.padding + layout.frame.imageX + col * layout.frameStride;

    ctx.save();
    drawImageCoverAutoRotate(ctx, img, imageX, y + layout.frame.imageY, layout.frame.imageW, layout.frame.imageH, images[index].transform);
    if (settings.brandText === FilmType.KODAK_GOLD_200) {
      applyGold200Look(ctx, imageX, y + layout.frame.imageY, layout.frame.imageW, layout.frame.imageH);
    }
    drawRealGrain(ctx, imageX, y + layout.frame.imageY, layout.frame.imageW, layout.frame.imageH, settings.grainIntensity);
    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.lineWidth = Math.max(2, Math.round(layout.frame.filmH * 0.003));
    ctx.strokeRect(imageX, y + layout.frame.imageY, layout.frame.imageW, layout.frame.imageH);
    ctx.restore();

    drawContinuousStripMarkings(ctx, layout, y, index, frameSettings);
  }

  return exportCanvasToObjectUrl(canvas, settings.outputFormat, settings.outputQuality, 'Failed to export film strip blob');
};

/**
 * 模式 A: 处理单张图片
 */
export const processImage = async (
  imageSource: string,
  settings: FilmSettings,
  dateOverride?: string,
  transform?: RenderTransform,
  renderBudgetLimits: RenderBudgetLimits = {},
): Promise<string> => {
  if ((settings.frameRenderMode ?? 'real135') === 'real135') {
    const templatedResult = await processImageWithTemplateOverlay(
      imageSource,
      settings,
      transform,
      renderBudgetLimits,
    );
    if (templatedResult) return templatedResult;

    return processImageReal135(
      imageSource,
      settings,
      dateOverride,
      transform,
      renderBudgetLimits,
    );
  }

  const preset = FILM_PRESETS[settings.brandText] || FILM_PRESETS['KODAK PORTRA 400'];
  if (!preset) throw new Error("Invalid Preset");

  const img = await loadCanvasImage(imageSource);
  const rotated = getRotatedDimensions(img.width, img.height, normalizeRenderTransform(transform).quarterTurns);
  const isPortrait = rotated.height > rotated.width;
  const baseDim = isPortrait ? rotated.height : rotated.width;
  const borderSize = Math.floor(baseDim * (settings.borderSize / 100));
  const canvasWidth = isPortrait ? rotated.width + borderSize * 2 : rotated.width;
  const canvasHeight = isPortrait ? rotated.height : rotated.height + borderSize * 2;
  assertCanvasBudget(canvasWidth, canvasHeight, renderBudgetLimits);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context not found');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. 底色 (边框)
  ctx.fillStyle = settings.borderColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. 绘制图像
  let imgX = 0, imgY = 0, imgW = rotated.width, imgH = rotated.height;
  if (isPortrait) {
    imgX = borderSize;
    imgY = 0;
  } else {
    imgX = 0;
    imgY = borderSize;
  }
  drawImageCoverWithTransform(ctx, img, imgX, imgY, imgW, imgH, transform);

  // 3. 施加颗粒 (使用优化后的叠加算法)
  drawGrain(ctx, imgX, imgY, imgW, imgH, settings.grainIntensity, renderBudgetLimits);

  // === 齿孔计算 ===
  const TARGET_HOLE_COUNT = 8;
  const holePerp = borderSize * 0.60; 
  const holePara = holePerp * 0.74;

  let holeW, holeH; 
  let startPos, step;

  if (isPortrait) {
    // 竖图
    holeW = holePerp; 
    holeH = holePara; 
    
    const totalLen = canvas.height;
    const pitch = totalLen / TARGET_HOLE_COUNT;
    step = pitch;
    const totalSpan = (TARGET_HOLE_COUNT - 1) * pitch + holeH;
    startPos = (totalLen - totalSpan) / 2;

    for (let i = 0; i < TARGET_HOLE_COUNT; i++) {
      const y = startPos + i * step;
      drawHole(ctx, settings, (borderSize - holeW) / 2, y, holeW, holeH, borderSize);
      drawHole(ctx, settings, canvas.width - (borderSize + holeW) / 2, y, holeW, holeH, borderSize);
    }
  } else {
    // 横图
    holeH = holePerp; 
    holeW = holePara; 

    const totalLen = canvas.width;
    const pitch = totalLen / TARGET_HOLE_COUNT;
    step = pitch;
    const totalSpan = (TARGET_HOLE_COUNT - 1) * pitch + holeW;
    startPos = (totalLen - totalSpan) / 2;

    for (let i = 0; i < TARGET_HOLE_COUNT; i++) {
      const x = startPos + i * step;
      drawHole(ctx, settings, x, (borderSize - holeH) / 2, holeW, holeH, borderSize);
      drawHole(ctx, settings, x, canvas.height - (borderSize + holeH) / 2, holeW, holeH, borderSize);
    }
  }

  // === 文字处理 ===
  ctx.fillStyle = settings.textColor;
  const isGC400 = settings.brandText.includes('GC 400');
  
  const marginRatio = (1 - 0.60) / 2; 
  const outerCenterRatio = marginRatio / 2; 
  const innerCenterRatio = 1 - (marginRatio / 2); 

  const maxFontSizeRatio = marginRatio * 0.9; 
  let fontSizeRatio = isGC400 ? 0.25 : 0.22;
  if (fontSizeRatio > maxFontSizeRatio) fontSizeRatio = maxFontSizeRatio;
  
  const fontSize = borderSize * fontSizeRatio;
  ctx.font = `${preset.fontWeight} ${Math.floor(fontSize)}px ${preset.fontFamily}`;
  ctx.textBaseline = 'middle';
  
  const finalDateStr = dateOverride || settings.dateStr;
  const frameNumberColor = getFrameNumberColor(settings, settings.textColor);
  
  const brandText = settings.customText.trim() !== '' ? settings.customText : settings.brandText;

  if (isPortrait) {
      // 竖图文字
      ctx.save();
      ctx.translate(borderSize * outerCenterRatio, canvas.height * 0.05);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(brandText, 0, 0);
      ctx.restore();
      
      if (!isGC400) {
          ctx.save();
          ctx.font = `normal ${Math.floor(fontSize * 0.55)}px ${preset.fontFamily}`;
          ctx.translate(borderSize * innerCenterRatio, canvas.height * 0.95);
          ctx.rotate(Math.PI / 2);
          ctx.fillText('SAFETY FILM', -ctx.measureText('SAFETY FILM').width, 0);
          ctx.restore();
      }
      
      ctx.save();
      ctx.fillStyle = frameNumberColor;
      ctx.translate(canvas.width - borderSize * outerCenterRatio, canvas.height * 0.05);
      ctx.rotate(Math.PI / 2);
      if (isGC400) {
           ctx.fillText(`${settings.frameNumber}A`, 0, 0);
      } else {
           ctx.fillText(`${settings.frameNumber}`, 0, 0);
           ctx.font = `normal ${Math.floor(fontSize * 0.8)}px ${preset.fontFamily}`;
           ctx.fillText(`${settings.frameNumber}A`, fontSize * 2.5, 0);
      }
      ctx.restore();
      
      if (settings.showDate) {
        ctx.save();
        ctx.font = `normal ${Math.floor(fontSize * 0.75)}px ${preset.fontFamily}`;
        ctx.translate(canvas.width - borderSize * innerCenterRatio, canvas.height * 0.95);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(finalDateStr, -ctx.measureText(finalDateStr).width, 0);
        ctx.restore();
      }
  } else {
      // 横图文字
      ctx.fillText(brandText, canvas.width * 0.05, borderSize * outerCenterRatio);
      if (isGC400) {
          const frameStr = `${settings.frameNumber}A`;
          ctx.save();
          ctx.fillStyle = frameNumberColor;
          ctx.fillText(frameStr, canvas.width - ctx.measureText(frameStr).width - canvas.width * 0.05, borderSize * outerCenterRatio);
          ctx.restore();
      } else {
          const frameStr = `${settings.frameNumber}`;
          ctx.save();
          ctx.fillStyle = frameNumberColor;
          ctx.fillText(frameStr, canvas.width - ctx.measureText(frameStr).width - canvas.width * 0.05, borderSize * outerCenterRatio);
          ctx.restore();
      }
      if (!isGC400) {
           ctx.font = `normal ${Math.floor(fontSize * 0.7)}px ${preset.fontFamily}`;
           ctx.fillText('SAFETY FILM', canvas.width * 0.05, (canvas.height - borderSize) + borderSize * outerCenterRatio);
      }
      if (settings.showDate) {
        ctx.font = `normal ${Math.floor(fontSize * 0.75)}px ${preset.fontFamily}`;
        ctx.fillText(finalDateStr, canvas.width - ctx.measureText(finalDateStr).width - canvas.width * 0.05, (canvas.height - borderSize) + borderSize * innerCenterRatio);
      }
  }

  return exportCanvasToObjectUrl(canvas, settings.outputFormat, settings.outputQuality);
};

/**
 * 模式 B: 生成胶片长条 (Film Strip)
 */
export const generateFilmStrip = async (
  images: ImageItem[],
  settings: FilmSettings,
  renderBudgetLimits: RenderBudgetLimits = {},
): Promise<string> => {
  if (images.length === 0) return '';

  if ((settings.frameRenderMode ?? 'real135') === 'real135') {
    const realStrip = await generateReal135FilmStrip(images, settings, renderBudgetLimits);
    if (realStrip) return realStrip;
  }
  
  const preset = FILM_PRESETS[settings.brandText] || FILM_PRESETS['KODAK PORTRA 400'];
  
  // === 1. 物理几何常量 ===
  const MAX_PER_ROW = 6; 
  const STRIP_HEIGHT_PX = 1600; 
  const ROW_GAP = 120; 
  
  const BORDER_RATIO = 0.16;
  const borderSize = Math.floor(STRIP_HEIGHT_PX * BORDER_RATIO); 
  const imageAreaHeight = STRIP_HEIGHT_PX - (borderSize * 2);

  const FRAME_WIDTH = imageAreaHeight * 1.5; 
  const FRAME_GAP = FRAME_WIDTH * 0.055;

  // === 2. 计算画布总尺寸 ===
  const totalImages = images.length;
  const numRows = Math.ceil(totalImages / MAX_PER_ROW);
  const colsInMaxRow = Math.min(totalImages, MAX_PER_ROW);
  
  const START_GAP = FRAME_WIDTH * 0.2;
  const END_GAP = FRAME_WIDTH * 0.2;
  
  const totalWidth = Math.trunc(
    START_GAP
    + FRAME_WIDTH * colsInMaxRow
    + FRAME_GAP * Math.max(0, colsInMaxRow - 1)
    + END_GAP,
  );
  const totalHeight = (numRows * STRIP_HEIGHT_PX) + ((numRows - 1) * ROW_GAP);
  assertCanvasBudget(totalWidth, totalHeight, renderBudgetLimits);

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d', { alpha: true }); 
  if (!ctx) throw new Error("Canvas init failed");

  // === 3. 逐行绘制 (优化：串行加载图片以节省内存) ===
  for (let row = 0; row < numRows; row++) {
    const rowOffsetY = row * (STRIP_HEIGHT_PX + ROW_GAP);
    const startGlobalIdx = row * MAX_PER_ROW;
    const endGlobalIdx = Math.min(startGlobalIdx + MAX_PER_ROW, totalImages);
    
    // 3.1 绘制该行的底色
    ctx.fillStyle = settings.borderColor;
    ctx.fillRect(0, rowOffsetY, totalWidth, STRIP_HEIGHT_PX);

    // 3.2 串行处理该行每一张图片
    for (let i = 0; i < (endGlobalIdx - startGlobalIdx); i++) {
        const globalIdx = startGlobalIdx + i;
        const imgItem = images[globalIdx];
        
        // 关键内存优化：每次只加载一张大图，画完立即释放引用
        // 之前 Promise.all 会同时将所有大图加载进内存
        const img = await loadCanvasImage(imgItem.previewUrl);

        const frameX = START_GAP + i * (FRAME_WIDTH + FRAME_GAP);
        const frameY = rowOffsetY + borderSize;
        drawImageCoverAutoRotate(
          ctx,
          img,
          frameX,
          frameY,
          FRAME_WIDTH,
          imageAreaHeight,
          imgItem.transform,
        );

        // 施加颗粒 (使用优化后的算法)
        drawGrain(
          ctx,
          frameX,
          frameY,
          FRAME_WIDTH,
          imageAreaHeight,
          settings.grainIntensity,
          renderBudgetLimits,
        );
    }

    // 3.3 绘制齿孔 (与图片加载无关，可以批量绘制)
    const holeH = borderSize * 0.60; 
    const holeW = holeH * 0.74; 
    const holePaddingFromImage = borderSize * 0.04; 
    
    const holeYTopLocal = borderSize - holeH - holePaddingFromImage;
    const holeYBottomLocal = (STRIP_HEIGHT_PX - borderSize) + holePaddingFromImage;
    
    const holeYTop = rowOffsetY + holeYTopLocal;
    const holeYBottom = rowOffsetY + holeYBottomLocal;

    const HOLES_PER_FRAME = 6;
    const pitch = (FRAME_WIDTH + FRAME_GAP) / HOLES_PER_FRAME; 
    const holeStartX = START_GAP - (pitch * 0.5);
    const numHoles = Math.ceil((totalWidth - holeStartX) / pitch) + 1;

    for (let k = 0; k < numHoles; k++) {
      const x = holeStartX + k * pitch;
      if (x > -holeW && x < totalWidth) {
        drawHole(ctx, settings, x, holeYTop, holeW, holeH, borderSize);
        drawHole(ctx, settings, x, holeYBottom, holeW, holeH, borderSize);
      }
    }

    // 3.4 绘制文字
    const textYTop = rowOffsetY + (holeYTopLocal / 2);
    const textYBottom = rowOffsetY + (holeYBottomLocal + holeH) + (STRIP_HEIGHT_PX - (holeYBottomLocal + holeH)) / 2;

    const isGC400 = settings.brandText.includes('GC 400');
    const baseFontSize = borderSize * 0.22; 
    const frameNumberColor = getFrameNumberColor(settings, settings.textColor);
    
    ctx.font = `${preset.fontWeight} ${Math.floor(baseFontSize)}px ${preset.fontFamily}`;
    ctx.fillStyle = settings.textColor;
    ctx.textBaseline = 'middle';

    const brandText = settings.customText.trim() !== '' ? settings.customText : settings.brandText;

    // 重新遍历该行的数据绘制文字
    const rowImages = images.slice(startGlobalIdx, endGlobalIdx);
    rowImages.forEach((item, idx) => {
      const frameX = START_GAP + idx * (FRAME_WIDTH + FRAME_GAP);
      const globalIdx = startGlobalIdx + idx;
      const frameNum = getFrameNumberForImage(
        settings.frameNumber,
        item,
        globalIdx,
        settings.maxRollFrames ?? 36,
      );
      const dateStr = item.exifDate || settings.dateStr;

      const paddingX = FRAME_WIDTH * 0.02;

      // 1. 品牌名
      ctx.textAlign = 'left';
      ctx.fillText(brandText, frameX + paddingX, textYTop);

      // 2. 帧编号
      const frameLabel = isGC400 ? `${frameNum}A` : `${frameNum}A`;
      ctx.save();
      ctx.fillStyle = frameNumberColor;
      ctx.textAlign = 'right';
      ctx.fillText(frameLabel, frameX + FRAME_WIDTH - paddingX, textYTop);
      ctx.restore();

      // 3. 日期
      if (settings.showDate) {
        ctx.save();
        ctx.font = `normal ${Math.floor(baseFontSize * 0.8)}px ${preset.fontFamily}`;
        ctx.textAlign = 'right';
        ctx.fillText(dateStr, frameX + FRAME_WIDTH - paddingX, textYBottom);
        ctx.restore();
      }

      // 4. Safety Film
      if (!isGC400) {
        ctx.save();
        ctx.font = `normal ${Math.floor(baseFontSize * 0.8)}px ${preset.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.fillText("SAFETY FILM", frameX + paddingX, textYBottom);
        ctx.restore();
      }
    });
  }

  return exportCanvasToObjectUrl(canvas, settings.outputFormat, settings.outputQuality);
};
