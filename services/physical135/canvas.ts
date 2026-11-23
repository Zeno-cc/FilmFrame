import type { FilmSettings, RenderTransform } from '../../types';
import { drawImageCoverAutoRotate, drawImageCoverWithTransform } from '../filmGeometry';
import { normalizeRenderTransform } from '../renderTransform';
import { assertCanvasBudget, type RenderBudgetLimits } from '../renderBudget';
import { seedUnit } from './seed';
import type { PhysicalFilmPlan, FilmPoint } from './plan';
import { canvasToFilm, filmToCanvas, filmToRollPoint } from './plan';
import { createKodakImprints, type ImprintOp } from './kodakEdge';
import { physicalEdgeForFilm } from './edgeRegistry';
import { createCinestillImprints, createFujiImprints, createIlfordImprints, createVisionImprints } from './edgeLayouts';

export type PhysicalCanvas = HTMLCanvasElement | OffscreenCanvas;
export type PhysicalContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type PhysicalImage = HTMLImageElement | ImageBitmap;

export function physicalRectangleCoverage(
  plan: PhysicalFilmPlan,
  x: number,
  y: number,
  start: FilmPoint,
  end: FilmPoint,
): number {
  const center = canvasToFilm(plan, (x + 0.5) / plan.pxPerMm, (y + 0.5) / plan.pxPerMm);
  const footprint = 1 / plan.pxPerMm;
  const width = Math.max(0, Math.min(end.s, center.s + footprint / 2) - Math.max(start.s, center.s - footprint / 2));
  const height = Math.max(0, Math.min(end.t, center.t + footprint / 2) - Math.max(start.t, center.t - footprint / 2));
  return width * height * plan.pxPerMm * plan.pxPerMm;
}

export interface PhysicalRaster {
  width: number;
  height: number;
  presence: Float32Array;
  backing: Float32Array;
  filmBase: Float32Array;
  wall: Float32Array;
}

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function erf(value: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(value));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-value * value));
  return value < 0 ? -y : y;
}

function hash(index: number, seed: number): number {
  let value = (Math.imul(index, 0x9e3779b9) ^ seed) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function noise(position: number, seed: number): number {
  const floor = Math.floor(position);
  const fraction = position - floor;
  const blend = fraction * fraction * (3 - 2 * fraction);
  const a = (hash(floor, seed) / 0xffffffff);
  const b = (hash(floor + 1, seed) / 0xffffffff);
  return a + (b - a) * blend;
}

function perforationDistance(s: number, t: number, materialS: number, hole: PhysicalFilmPlan['perforations'][number], seed: number): number {
  const dx = s - hole.center.s;
  const dy = t - hole.center.t;
  const qx = Math.abs(dx) - hole.width / 2 + hole.radius;
  const qy = Math.abs(dy) - hole.height / 2 + hole.radius;
  const distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - hole.radius;
  const rough = 0.001 + 0.003 * (hash(0, seed) / 0xffffffff);
  let result = distance + rough * (noise(materialS / 0.05, seed ^ 0x77) + noise(t / 0.05, seed ^ 0x99) - 1) * 2;
  if (hash(0, seed ^ 0x07) / 0xffffffff < 0.25) {
    const angle = Math.PI * 2 * hash(0, seed ^ 0x08) / 0xffffffff;
    const bx = hole.center.s + Math.cos(angle) * hole.width / 2;
    const by = hole.center.t + Math.sin(angle) * hole.height / 2;
    const sigma = 0.020 + 0.030 * hash(0, seed ^ 0x09) / 0xffffffff;
    const amplitude = (hash(0, seed ^ 0x0a) < 0x80000000 ? -1 : 1) * (0.006 + 0.010 * hash(0, seed ^ 0x0b) / 0xffffffff);
    result += amplitude * Math.exp(-((s - bx) ** 2 + (t - by) ** 2) / (sigma * sigma));
  }
  return result;
}

export function createPhysicalCanvas(
  width: number,
  height: number,
  renderBudgetLimits: RenderBudgetLimits = {},
): PhysicalCanvas {
  assertCanvasBudget(width, height, renderBudgetLimits);
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function createPhysicalRaster(plan: PhysicalFilmPlan): PhysicalRaster {
  const width = plan.outputWidth;
  const height = plan.outputHeight;
  const presence = new Float32Array(width * height);
  const backing = new Float32Array(width * height * 3);
  const filmBase = new Float32Array(width * height * 3);
  const wall = new Float32Array(width * height * 3);
  const holes = plan.perforations;
  const materialSeed = plan.continuous ? plan.bodySeed : plan.frameSeed;
  const holeDetails = holes.map(hole => {
    const rollCenter = plan.continuous
      ? filmToRollPoint(plan, canvasToFilm(plan, hole.center.s, hole.center.t))
      : hole.center;
    const pitchIndex = Math.round((rollCenter.s - plan.body.perforationPhase - 2.375) / 4.75);
    const globalHoleIndex = (pitchIndex + 10000) * 2 + (hole.center.t > plan.film.height / 2 ? 1 : 0);
    const centerS = hole.center.s + (seedUnit(materialSeed, 'frame', globalHoleIndex * 2) - 0.5) * 0.040;
    const centerT = hole.center.t + (seedUnit(materialSeed, 'frame', globalHoleIndex * 2 + 1) - 0.5) * 0.048;
    const holeWidth = hole.width * (0.996 + seedUnit(materialSeed, 'frame', globalHoleIndex + 20) * 0.008);
    const holeHeight = hole.height * (0.996 + seedUnit(materialSeed, 'frame', globalHoleIndex + 21) * 0.008);
    const radius = Math.max(0.3, Math.min(0.6, hole.radius + (seedUnit(materialSeed, 'frame', globalHoleIndex + 22) - 0.5) * 0.08));
    return { hole: { ...hole, center: { s: centerS, t: centerT }, width: holeWidth, height: holeHeight, radius }, seed: hash(globalHoleIndex, materialSeed) };
  });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const local = canvasToFilm(plan, (x + 0.5) / plan.pxPerMm, (y + 0.5) / plan.pxPerMm);
      const { s, t } = filmToRollPoint(plan, local);
      let alpha = plan.continuous || (local.s >= 0 && local.s <= plan.film.width && local.t >= 0 && local.t <= plan.film.height) ? 1 : 0;
      let cutWall = 0;
      for (const { hole, seed } of holeDetails) {
        if (Math.abs(local.s - hole.center.s) > hole.width / 2 + 0.2
          || Math.abs(local.t - hole.center.t) > hole.height / 2 + 0.2) continue;
        const materialS = s;
        const distance = perforationDistance(local.s, local.t, materialS, hole, seed);
        const sigma = Math.sqrt(0.017 ** 2 + 0.0961 / plan.pxPerMm ** 2);
        alpha = Math.min(alpha, 0.5 + 0.5 * erf(distance / (Math.SQRT2 * sigma)));
        if (distance > -0.03 && distance < 0.15) {
          const patch = smoothstep((noise(materialS / 0.35, seed) + noise(local.t / 0.35, seed ^ 0x3c) - 0.5) / 0.5);
          const glow = plan.backing === 'open' ? 0.04 : 0.02;
          cutWall = Math.max(cutWall, glow * (0.4 + 0.6 * (seed / 0xffffffff)) * patch * Math.exp(-Math.max(0, distance) / 0.0275));
        }
      }
      const index = y * width + x;
      presence[index] = alpha;
      const edgeDistance = Math.min(local.t, plan.film.height - local.t);
      const fog = plan.fog * Math.exp(-Math.max(0, edgeDistance) / 1.8);
      const along = s / (plan.imprintSpanMm ?? plan.film.width);
      const leakCenter = 0.15 + seedUnit(materialSeed, 'leaks', 0) * 0.7;
      const leak = plan.leaks * Math.exp(-((along - leakCenter) ** 2) / 0.004)
        * Math.exp(-Math.max(0, edgeDistance) / 2.8);
      const variation = 0.975 + 0.025 * Math.sin(s * 2.1 + t * 1.7 + plan.body.registration * 12)
        + 0.008 * Math.sin(s * 17.3 - t * 11.1);
      for (let channel = 0; channel < 3; channel += 1) {
        backing[index * 3 + channel] = (1 - alpha) * (plan.backing === 'open' ? 1 : 0);
        const base = (0.065 + (channel === 2 ? 0.018 : 0)) * variation;
        filmBase[index * 3 + channel] = Math.min(0.42, base + fog * 0.025 + leak * (channel === 2 ? 0.035 : 0.15));
        wall[index * 3 + channel] = cutWall * (channel === 0 ? 0.15 : channel === 1 ? 0.105 : 0.048);
      }
    }
  }
  return { width, height, presence, backing, filmBase, wall };
}

export function createPhysicalImprints(plan: PhysicalFilmPlan, settings: Pick<FilmSettings, 'brandText' | 'frameNumber'>): ImprintOp[] {
  const definition = physicalEdgeForFilm(settings.brandText);
  if (!definition) return [];
  const gateOrigin = (plan.imprintSpanMm === undefined ? plan.gateOriginS : 0) + plan.advanceOriginS;
  const span = plan.imprintSpanMm ?? 38;
  switch (definition.kind) {
    case 'fuji-negative':
      return createFujiImprints(settings.brandText, settings.frameNumber, plan.body.perforationPhase, gateOrigin, plan.advanceOriginS, plan.film.height);
    case 'vision3':
      return createVisionImprints(settings.brandText, plan.body.perforationPhase, gateOrigin, plan.advanceOriginS, plan.film.height);
    case 'ilford':
      return createIlfordImprints(settings.brandText, settings.frameNumber, plan.body.perforationPhase, gateOrigin, plan.advanceOriginS, plan.film.height);
    case 'cinestill':
      return createCinestillImprints(settings.brandText, settings.frameNumber, plan.body.perforationPhase, gateOrigin, plan.advanceOriginS, plan.film.height);
    default:
      return createKodakImprints(settings.brandText, settings.frameNumber, plan.body.perforationPhase, plan.film.height, plan.advanceOriginS, gateOrigin, span);
  }
}

export function paintPhysicalImprints(
  ctx: PhysicalContext,
  plan: PhysicalFilmPlan,
  settings: Pick<FilmSettings, 'brandText' | 'frameNumber'>,
  imprintOverride?: readonly ImprintOp[],
): void {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  const imprints = imprintOverride ?? createPhysicalImprints(plan, settings);
  const rectangles = imprints.filter(op => op.kind === 'rect');
  if (rectangles.length) {
    const mask = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const op of rectangles) {
      const corners = [
        filmToCanvas(plan, op.s, op.t),
        filmToCanvas(plan, op.s1!, op.t),
        filmToCanvas(plan, op.s, op.t1!),
        filmToCanvas(plan, op.s1!, op.t1!),
      ];
      const xs = corners.map(point => point.s * plan.pxPerMm);
      const ys = corners.map(point => point.t * plan.pxPerMm);
      const left = Math.max(0, Math.floor(Math.min(...xs)));
      const right = Math.min(ctx.canvas.width - 1, Math.ceil(Math.max(...xs)));
      const top = Math.max(0, Math.floor(Math.min(...ys)));
      const bottom = Math.min(ctx.canvas.height - 1, Math.ceil(Math.max(...ys)));
      const from = { s: Math.min(op.s, op.s1!), t: Math.min(op.t, op.t1!) };
      const to = { s: Math.max(op.s, op.s1!), t: Math.max(op.t, op.t1!) };
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const pixel = (y * ctx.canvas.width + x) * 4;
          const coverage = physicalRectangleCoverage(plan, x, y, from, to);
          const alpha = Math.round(coverage * 255);
          mask.data[pixel + 3] = Math.max(mask.data[pixel + 3], alpha);
          mask.data[pixel] = 255;
          mask.data[pixel + 1] = 255;
          mask.data[pixel + 2] = 255;
        }
      }
    }
    ctx.putImageData(mask, 0, 0);
  }
  for (const op of imprints) {
    if (op.kind === 'rect') continue;
    const start = filmToCanvas(plan, op.s, op.t);
    if (op.kind === 'dot') {
      ctx.beginPath();
      ctx.arc(start.s * plan.pxPerMm, start.t * plan.pxPerMm, op.radius! * plan.pxPerMm, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (op.kind === 'arrow') {
      const end = filmToCanvas(plan, op.s1!, op.t1!);
      const x = start.s * plan.pxPerMm;
      const y = start.t * plan.pxPerMm;
      const endX = end.s * plan.pxPerMm;
      const endY = end.t * plan.pxPerMm;
      const dx = endX - x;
      const dy = endY - y;
      const length = Math.hypot(dx, dy);
      const ux = dx / length;
      const uy = dy / length;
      const head = op.head! * plan.pxPerMm;
      const half = op.halfHeight! * plan.pxPerMm;
      const thickness = 0.09 * plan.pxPerMm;
      ctx.beginPath();
      ctx.moveTo(x - uy * thickness, y + ux * thickness);
      ctx.lineTo(endX - ux * head * 0.75 - uy * thickness, endY - uy * head * 0.75 + ux * thickness);
      ctx.lineTo(endX - ux * head * 0.75 + uy * thickness, endY - uy * head * 0.75 - ux * thickness);
      ctx.lineTo(x + uy * thickness, y - ux * thickness);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(endX - ux * head - uy * half, endY - uy * head + ux * half);
      ctx.lineTo(endX, endY);
      ctx.lineTo(endX - ux * head + uy * half, endY - uy * head - ux * half);
      ctx.closePath();
      ctx.fill();
      continue;
    }
    const cap = op.cap! * plan.pxPerMm;
    ctx.save();
    ctx.translate(start.s * plan.pxPerMm, start.t * plan.pxPerMm);
    const glyphRotation = (plan.orientation === 'portrait' ? Math.PI / 2 : 0)
      + plan.frame.straightenDegrees * Math.PI / 180;
    if (glyphRotation !== 0) ctx.rotate(glyphRotation);
    ctx.scale(op.xScale ?? 1, 1);
    ctx.font = `${op.bold ? 'bold ' : ''}${cap / 0.714}px ${op.fontFamily === 'mono' ? 'Menlo, monospace' : '"Helvetica Neue", Arial, sans-serif'}`;
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(op.tracking ?? 0) * plan.pxPerMm}px`;
    ctx.fillText(op.text!, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export function restorePhysicalFrameOrientation(
  ctx: PhysicalContext,
  source: PhysicalCanvas,
  _plan: PhysicalFilmPlan,
  _transform?: RenderTransform,
  _renderBudgetLimits: RenderBudgetLimits = {},
): void {
  ctx.drawImage(source, 0, 0);
}

export function paintPhysicalFrame(
  ctx: PhysicalContext,
  image: PhysicalImage,
  plan: PhysicalFilmPlan,
  settings: Pick<FilmSettings, 'brandText' | 'frameNumber' | 'physicalFog' | 'physicalLeaks'>,
  raster: PhysicalRaster,
  transform?: RenderTransform,
  renderBudgetLimits: RenderBudgetLimits = {},
): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  if (raster.width !== width || raster.height !== height) {
    throw new RangeError('Physical raster and canvas dimensions must match');
  }
  assertCanvasBudget(width, height, renderBudgetLimits);
  ctx.save();
  ctx.globalCompositeOperation = 'copy';
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  const portrait = plan.orientation === 'portrait';
  // Start from the top-left corner in the oriented gate before applying scan rotation.
  const gateTopLeft = filmToCanvas(plan, plan.gate.s, plan.gate.t + (portrait ? plan.gate.height : 0));
  const radians = plan.frame.straightenDegrees * Math.PI / 180;
  const gateX = gateTopLeft.s * plan.pxPerMm;
  const gateY = gateTopLeft.t * plan.pxPerMm;
  const gateW = (portrait ? plan.gate.height : plan.gate.width) * plan.pxPerMm;
  const gateH = (portrait ? plan.gate.width : plan.gate.height) * plan.pxPerMm;
  const radius = Math.max(1, Math.min(...plan.body.gateRadii) * plan.pxPerMm);
  const penumbra = Math.max(0.5, 0.29 / (2 * plan.aperture) * plan.pxPerMm);
  ctx.filter = `blur(${penumbra}px)`;
  ctx.translate(radians ? gateX : Math.round(gateX), radians ? gateY : Math.round(gateY));
  if (radians) ctx.rotate(radians);
  const widthPx = radians ? gateW : Math.round(gateW);
  const heightPx = radians ? gateH : Math.round(gateH);
  ctx.beginPath();
  ctx.roundRect(0, 0, widthPx, heightPx, radius);
  ctx.clip();
  const normalized = normalizeRenderTransform(transform);
  if (portrait) {
    drawImageCoverWithTransform(ctx, image, 0, 0, widthPx, heightPx, normalized);
  } else {
    drawImageCoverAutoRotate(ctx, image, 0, 0, widthPx, heightPx, normalized);
  }
  ctx.restore();
}
