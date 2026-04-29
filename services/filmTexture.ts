import { FilmSettings } from '../types';
import { Film135SideLayout } from './filmGeometry';

let cachedNoiseCanvas: HTMLCanvasElement | null = null;

function getNoisePatternCanvas(): HTMLCanvasElement {
  if (cachedNoiseCanvas) return cachedNoiseCanvas;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not found');

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();

    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const value = Math.max(0, Math.min(255, 128 + z * 30));

    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  cachedNoiseCanvas = canvas;
  return canvas;
}

// Overlay grain is applied only to bounded regions to keep large exports responsive.
export function drawGrain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  intensity: number
) {
  if (intensity <= 0 || width <= 0 || height <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  const pattern = ctx.createPattern(getNoisePatternCanvas(), 'repeat');
  if (pattern) {
    const offsetX = Math.random() * 256;
    const offsetY = Math.random() * 256;

    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = Math.min(1, (intensity / 100) * 2);
    ctx.fillStyle = pattern;
    ctx.translate(offsetX, offsetY);
    ctx.fillRect(-offsetX, -offsetY, width + offsetX, height + offsetY);
  }

  ctx.restore();
}

export function drawDust(ctx: CanvasRenderingContext2D, width: number, height: number, count = 80) {
  ctx.save();

  for (let i = 0; i < count; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = 0.3 + Math.random() * 1.4;

    ctx.globalAlpha = 0.03 + Math.random() * 0.11;
    ctx.fillStyle = Math.random() > 0.45 ? '#ffffff' : '#000000';

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawFineScratches(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  count = 8
) {
  ctx.save();
  ctx.lineCap = 'round';

  for (let i = 0; i < count; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const len = height * (0.08 + Math.random() * 0.28);

    ctx.globalAlpha = 0.025 + Math.random() * 0.05;
    ctx.strokeStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
    ctx.lineWidth = 0.4 + Math.random() * 0.8;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 8, y + len);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawFilmBaseTexture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: FilmSettings
) {
  if (settings.enableRealisticRebate === false) return;

  ctx.save();
  for (let y = 0; y < height; y += 3) {
    ctx.globalAlpha = 0.015 + Math.random() * 0.018;
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(0, y, width, 1);
  }
  ctx.restore();

  drawFineScratches(ctx, width, height, 6);
}

export function drawRealFilmStockTexture(
  ctx: CanvasRenderingContext2D,
  layout: Film135SideLayout,
  settings: FilmSettings
) {
  if (settings.enableRealisticRebate === false) return;

  ctx.save();

  // Fine resin grain in the black film stock. Kept subtle so it does not look like noise pasted on top.
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * layout.filmW;
    const y = Math.random() * layout.filmH;
    const railBias = x < layout.sideRailW || x > layout.imageX + layout.imageW ? 1 : 0.45;

    ctx.globalAlpha = (0.012 + Math.random() * 0.035) * railBias;
    ctx.fillStyle = Math.random() > 0.42 ? '#31261a' : '#000000';
    ctx.fillRect(x, y, 1, 1);
  }

  // Slight horizontal scan bands and uneven processing marks.
  for (let y = 0; y < layout.filmH; y += 5) {
    ctx.globalAlpha = 0.012 + Math.random() * 0.012;
    ctx.fillStyle = Math.random() > 0.55 ? '#ffffff' : '#000000';
    ctx.fillRect(0, y, layout.filmW, 1);
  }

  ctx.restore();
}
