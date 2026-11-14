import type { FilmSettings, RenderTransform } from '../../types';
import { solveBaseCancelingHoleDensity } from './density';
import { createPhysicalCanvas, createPhysicalRaster, paintPhysicalFrame, paintPhysicalImprints, type PhysicalContext, type PhysicalImage } from './canvas';
import type { ImprintOp } from './kodakEdge';
import type { PhysicalFilmPlan } from './plan';
import { canvasToFilm, filmToRollPoint } from './plan';
import { edgeLightWeights, EDGE_IMPRINT_EV, MID_GREY } from './filmLight';
import { assertCanvasBudget, type RenderBudgetLimits } from '../renderBudget';
import { physicalEdgeForFilm } from './edgeRegistry';
import { seedUnit } from './seed';

function noise(position: number, seed: number): number {
  const floor = Math.floor(position);
  const fraction = position - floor;
  const blend = fraction * fraction * (3 - 2 * fraction);
  const a = seedUnit(seed, 'fog', floor >>> 0);
  const b = seedUnit(seed, 'fog', (floor + 1) >>> 0);
  return a + (b - a) * blend;
}

export function physicalImprintExposure(stock: FilmSettings['brandText']): number {
  return MID_GREY * 2 ** (EDGE_IMPRINT_EV + (physicalEdgeForFilm(stock)?.ev ?? 5.3) - 5.3);
}

export function physicalEdgeExposureAtPoint(plan: PhysicalFilmPlan, s: number, t: number) {
  const along = filmToRollPoint(plan, { s, t }).s;
  const edgeDistance = Math.min(t, plan.film.height - t);
  const materialSeed = plan.continuous ? plan.bodySeed : plan.frameSeed;
  const fog = plan.fog * 0.018 * Math.exp(-edgeDistance / 1.3)
    * (0.3 + 0.7 * (0.6 * noise(along / 8.3, materialSeed) + 0.4 * noise(along / 3.07, (materialSeed ^ 0xa5a5a5a5) >>> 0)));
  const leakCenter = (plan.imprintSpanMm ?? plan.film.width) * (0.15 + seedUnit(materialSeed, 'leaks', 0) * 0.7);
  const leak = plan.leaks * 0.025 * Math.exp(-((along - leakCenter) ** 2) / 8) * Math.exp(-edgeDistance / 2.8);
  return { fog, leak };
}

export async function renderPhysicalSpectralCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  plan: PhysicalFilmPlan,
  settings: FilmSettings,
  presence: Float32Array,
  backing: Float32Array,
  wall: Float32Array,
  imprintOverride?: readonly ImprintOp[],
  imprintPixels?: Uint8ClampedArray,
  renderBudgetLimits: RenderBudgetLimits = {},
): Promise<void> {
  assertCanvasBudget(canvas.width, canvas.height, renderBudgetLimits);
  const resource = await loadSpectralStockResourceForPhysical(settings);
  const pipeline = await createPipelineForPhysical(resource);
  const hole = solveBaseCancelingHoleDensity(
    pipeline.setup.arrays.filmChannelDensity,
    pipeline.setup.arrays.filmBaseDensity,
    pipeline.setup.arrays.filmSpectralValidMask,
  );
  // Upstream overscan.cpp uses this same least-squares CMY with no residual
  // acceptance gate. A residual reflects the stock's own dye/base physics,
  // not a solver failure; rendering proceeds with the solved CMY as upstream does.
  if (!Number.isFinite(hole.maxBaseResidual)) {
    throw new Error(`${settings.brandText} 的片基抵消残差无效，不能使用完整光谱片边。`);
  }
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Physical spectral canvas context unavailable');
  const rgba = ctx.getImageData(0, 0, width, height);
  const imprintCanvas = imprintPixels ? null : createPhysicalCanvas(width, height, renderBudgetLimits);
  const imprintCtx = imprintCanvas?.getContext('2d') as PhysicalContext | null;
  if (!imprintPixels && !imprintCtx) throw new Error('Physical imprint context unavailable');
  if (imprintCtx) paintPhysicalImprints(imprintCtx, plan, settings, imprintOverride);
  const imprint = imprintPixels ?? imprintCtx!.getImageData(0, 0, width, height).data;
  const weights = edgeLightWeights(settings.brandText);
  const pixels = new Float32Array(width * height * 3);
  const { srgbByteToLinearProPhoto } = await import('../spectral/inputColor');
  const imprintGain = physicalImprintExposure(settings.brandText);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const point = canvasToFilm(plan, (x + 0.5) / plan.pxPerMm, (y + 0.5) / plan.pxPerMm);
    const insideGate = point.s >= plan.gate.s && point.s <= plan.gate.s + plan.gate.width
      && point.t >= plan.gate.t && point.t <= plan.gate.t + plan.gate.height;
    const photoCoverage = insideGate ? 1 : 0;
    const color = insideGate ? srgbByteToLinearProPhoto(
      pipeline.setup,
      rgba.data[pixel * 4],
      rgba.data[pixel * 4 + 1],
      rgba.data[pixel * 4 + 2],
    ) : [0, 0, 0] as const;
    const imprintCoverage = imprint[pixel * 4 + 3] / 255;
    const { fog, leak } = physicalEdgeExposureAtPoint(plan, point.s, point.t);
    const edgeBase = MID_GREY * (1 - photoCoverage) * 0.00002;
    for (let channel = 0; channel < 3; channel += 1) {
      pixels[pixel * 3 + channel] = color[channel] * photoCoverage
        + edgeBase
        + imprintCoverage * imprintGain * weights.edge[channel]
        + (fog + leak) * weights.fog[channel];
    }
  }
  const { createSpectralBackend } = await import('../spectral/backend');
  const backend = createSpectralBackend({
    pipeline,
    prefer: settings.spectralBackend ?? 'auto',
    canvas: createPhysicalCanvas(width, height, renderBudgetLimits),
    limits: { maxPixels: width * height, maxWorkingSetBytes: width * height * 7 * 3 * 4 + 81 * 3 * 8 },
  });
  try {
    const frame = await backend.render({ width, height, pixels }, presence, hole.cmy);
    try {
      const rgb = backend.readRgb(frame);
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        const alpha = presence[pixel];
        for (let channel = 0; channel < 3; channel += 1) {
          rgba.data[pixel * 4 + channel] = Math.round(
            alpha * rgb[pixel * 3 + channel] * 255 + backing[pixel * 3 + channel] * 255 + wall[pixel * 3 + channel] * 255,
          );
        }
      }
      ctx.putImageData(rgba, 0, 0);
    } finally {
      backend.release(frame);
    }
  } finally {
    backend.dispose();
  }
}

async function loadSpectralStockResourceForPhysical(settings: FilmSettings) {
  const { loadSpectralStockResource } = await import('../spectral/stockResourceLoader');
  return loadSpectralStockResource(settings.brandText);
}

async function createPipelineForPhysical(resource: Awaited<ReturnType<typeof loadSpectralStockResourceForPhysical>>) {
  const { createPortraPipeline } = await import('../spectral/portraPipeline');
  return createPortraPipeline(resource);
}

export async function renderPhysicalFrame(
  ctx: PhysicalContext,
  image: PhysicalImage,
  plan: PhysicalFilmPlan,
  settings: FilmSettings,
  transform?: RenderTransform,
  renderBudgetLimits: RenderBudgetLimits = {},
): Promise<void> {
  assertCanvasBudget(ctx.canvas.width, ctx.canvas.height, renderBudgetLimits);
  const raster = createPhysicalRaster(plan);
  paintPhysicalFrame(ctx, image, plan, settings, raster, transform);
  if (plan.kind !== 'spectral-negative') {
    const rgba = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const imprintCanvas = createPhysicalCanvas(ctx.canvas.width, ctx.canvas.height, renderBudgetLimits);
    const imprintCtx = imprintCanvas.getContext('2d') as PhysicalContext | null;
    if (!imprintCtx) throw new Error('Physical compatibility imprint context unavailable');
    paintPhysicalImprints(imprintCtx, plan, settings);
    const imprint = imprintCtx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
    const weights = edgeLightWeights(settings.brandText);
    for (let pixel = 0; pixel < raster.presence.length; pixel += 1) {
      const alpha = raster.presence[pixel];
      const x = pixel % raster.width;
      const y = Math.floor(pixel / raster.width);
      const point = canvasToFilm(plan, (x + 0.5) / plan.pxPerMm, (y + 0.5) / plan.pxPerMm);
      const gatePixel = point.s >= plan.gate.s && point.s <= plan.gate.s + plan.gate.width
        && point.t >= plan.gate.t && point.t <= plan.gate.t + plan.gate.height;
      const coverage = imprint[pixel * 4 + 3] / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        const base = gatePixel ? rgba.data[pixel * 4 + channel] : raster.filmBase[pixel * 3 + channel] * 255;
        const printed = base + coverage * 96 * weights.edge[channel];
        rgba.data[pixel * 4 + channel] = Math.round(
          printed * alpha + raster.backing[pixel * 3 + channel] * 255 + raster.wall[pixel * 3 + channel] * 255,
        );
      }
    }
    ctx.putImageData(rgba, 0, 0);
    return;
  }

  await renderPhysicalSpectralCanvas(ctx.canvas, plan, settings, raster.presence, raster.backing, raster.wall, undefined, undefined, renderBudgetLimits);
}
