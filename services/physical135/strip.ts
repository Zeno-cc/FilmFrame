import type { FilmSettings, ImageItem } from '../../types';
import { assertCanvasBudget, type RenderBudgetLimits } from '../renderBudget';
import { getFrameNumberForImage } from '../filmFrameNumber';
import { getReal135StripTargetImageWidth } from '../filmResolution';
import { paintPhysicalFrame, createPhysicalCanvas, createPhysicalImprints, paintPhysicalImprints, type PhysicalContext, type PhysicalImage } from './canvas';
import { physicalPlanForSettings } from './frame';
import { createPhysicalRaster } from './canvas';
import { createFrameVariation } from './seed';
import { createPhysicalSpectralSession, renderPhysicalSpectralCanvas, type PhysicalSpectralSession } from './spectralAdapter';
import type { PhysicalFilmPlan, PhysicalPlanInput } from './plan';
import { canvasToFilm, rollToFilmPoint } from './plan';
import { edgeLightWeights } from './filmLight';
import type { ImprintOp } from './kodakEdge';

export function physicalStripFrameImprints(plan: PhysicalFilmPlan, imprints: readonly ImprintOp[]): ImprintOp[] {
  return imprints.map(op => {
    const start = rollToFilmPoint(plan, { s: op.s, t: op.t });
    const end = op.s1 === undefined || op.t1 === undefined ? undefined : rollToFilmPoint(plan, { s: op.s1, t: op.t1 });
    return { ...op, s: start.s, t: start.t, s1: end?.s, t1: end?.t };
  });
}
export function createPhysicalStripLayout(settings: PhysicalPlanInput['settings'], count: number, pxPerMm: number) {
  if (!Number.isSafeInteger(count) || count <= 0) throw new RangeError('Physical strip requires at least one frame');
  const gateWidth = 36;
  const advance = 38;
  const totalWidthMm = count * advance;
  return {
    pxPerMm,
    totalWidthMm,
    totalWidth: Math.round(totalWidthMm * pxPerMm),
    totalHeight: Math.round(35 * pxPerMm),
    frames: Array.from({ length: count }, (_, index) => ({
      s: index * advance,
      t: 0,
      width: advance,
      height: 35,
    })),
  };
}

export function createPhysicalStripPlan(settings: PhysicalPlanInput['settings'], count: number): PhysicalFilmPlan {
  const pxPerMm = Math.round(getReal135StripTargetImageWidth(settings.processingMode) / 36);
  const plan = physicalPlanForSettings(settings, 'landscape', 36, pxPerMm);
  const layout = createPhysicalStripLayout(settings, count, plan.pxPerMm);
  return {
    ...plan,
    imprintSpanMm: layout.totalWidthMm,
    continuous: true,
    film: { s: 0, t: 0, width: layout.totalWidthMm, height: 35 },
    outputWidth: layout.totalWidth,
    outputHeight: layout.totalHeight,
    perforations: Array.from({ length: count }, (_, frame) => plan.perforations.map(hole => ({
      ...hole,
      center: { s: hole.center.s + frame * 38, t: hole.center.t },
    }))).flat(),
  };
}

export function perforationsForPhysicalStripFrame(plan: PhysicalFilmPlan, index: number) {
  const advance = 38;
  const start = index * advance;
  const softMargin = Math.sqrt(0.017 ** 2 + 0.0961 / plan.pxPerMm ** 2) * 3;
  // A physical hole can cross an advance boundary, so both adjacent canvases
  // must evaluate it. Keep its full-strip index for identical seeded geometry.
  const overlapping = plan.perforations.map((hole, holeIndex) => ({ hole, holeIndex }))
    .filter(({ hole }) => {
      const center = hole.center.s - start;
      return center + hole.width / 2 + 0.04 + softMargin >= 0
        && center - hole.width / 2 - 0.04 - softMargin <= advance;
    });
  return {
    perforations: overlapping.map(({ hole }) => ({
      ...hole,
      center: { s: hole.center.s - start, t: hole.center.t },
    })),
  };
}

export function physicalStripFramePlan(plan: PhysicalFilmPlan, index: number, item: Pick<ImageItem, 'physicalFrameSeed'>, settings: PhysicalPlanInput['settings']): PhysicalFilmPlan {
  const { perforations } = perforationsForPhysicalStripFrame(plan, index);
  const frameSeed = item.physicalFrameSeed ?? settings.physicalFrameSeed ?? 1;
  const frameVariation = createFrameVariation(frameSeed, settings.physicalStraighten ?? 0);
  return {
    ...plan,
    film: { s: 0, t: 0, width: 38, height: 35 },
    gate: { ...plan.gate },
    advanceOriginS: index * 38,
    frame: {
      ...frameVariation,
      // The affine scan window includes this advance. filmToCanvas and
      // canvasToFilm convert it back to local gate/perforation coordinates;
      // filmToRollPoint alone adds the advance for roll-owned material.
      scanOffset: { s: frameVariation.scanOffset.s + index * 38, t: frameVariation.scanOffset.t },
    },
    frameSeed,
    body: { ...plan.body },
    outputWidth: Math.round(38 * plan.pxPerMm),
    outputHeight: plan.outputHeight,
    perforations,
  };
}

export async function renderPhysicalStripCanvas<T extends HTMLCanvasElement | OffscreenCanvas>(
  images: readonly ImageItem[],
  decode: (item: ImageItem) => Promise<PhysicalImage>,
  settings: FilmSettings,
  renderBudgetLimits: RenderBudgetLimits = {},
  preferOffscreen = false,
): Promise<T> {
  const plan = createPhysicalStripPlan(settings, images.length);
  assertCanvasBudget(plan.outputWidth, plan.outputHeight, renderBudgetLimits);
  const canvas = preferOffscreen && typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(plan.outputWidth, plan.outputHeight) as T
    : Object.assign(document.createElement('canvas'), { width: plan.outputWidth, height: plan.outputHeight }) as T;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Physical strip context unavailable');
  await paintPhysicalStrip(ctx, images, decode, plan, settings, renderBudgetLimits);
  return canvas;
}

export async function paintPhysicalStrip(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  images: readonly ImageItem[],
  decode: (item: ImageItem) => Promise<PhysicalImage>,
  plan: PhysicalFilmPlan,
  settings: FilmSettings,
  renderBudgetLimits: RenderBudgetLimits,
): Promise<void> {
  const layout = createPhysicalStripLayout(settings, images.length, Math.round(plan.pxPerMm));
  assertCanvasBudget(plan.outputWidth, plan.outputHeight, renderBudgetLimits);
  const frameWidth = Math.round(38 * plan.pxPerMm);
  assertCanvasBudget(frameWidth, plan.outputHeight, renderBudgetLimits);
  const frameCanvas = createPhysicalCanvas(frameWidth, plan.outputHeight, renderBudgetLimits);
  const frameContext = frameCanvas.getContext('2d', { alpha: false }) as PhysicalContext | null;
  if (!frameContext) throw new Error('Physical strip frame context unavailable');
  const imprintCanvas = createPhysicalCanvas(frameWidth, plan.outputHeight, renderBudgetLimits);
  const imprintCtx = imprintCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!imprintCtx) throw new Error('Physical strip imprint context unavailable');
  // Keep one roll layout, but evaluate it in each frame's local scan window.
  // A full-roll rotation center cannot be cropped into a local frame mask.
  const imprint = createPhysicalImprints(plan, settings);
  let session: PhysicalSpectralSession | undefined;
  if (plan.kind === 'spectral-negative') {
    session = await createPhysicalSpectralSession(settings, renderBudgetLimits, frameWidth, plan.outputHeight);
  }
  try {
  for (let index = 0; index < images.length; index += 1) {
    const item = images[index];
    const image = await decode(item);
    try {
    const framePlan = physicalStripFramePlan(plan, index, item, settings);
    const canvas = frameCanvas;
    const context = frameContext;
    const frameSettings = {
      ...settings,
      frameNumber: getFrameNumberForImage(settings.frameNumber, item, index, settings.maxRollFrames ?? 36),
      physicalFrameSeed: framePlan.frameSeed,
    };
    const localImprint = physicalStripFrameImprints(framePlan, imprint);
    imprintCtx.clearRect(0, 0, imprintCanvas.width, imprintCanvas.height);
    paintPhysicalImprints(imprintCtx, framePlan, frameSettings, localImprint);
    const imprintPixels = imprintCtx.getImageData(0, 0, framePlan.outputWidth, framePlan.outputHeight).data;
    const raster = createPhysicalRaster(framePlan);
    paintPhysicalFrame(context, image, framePlan, frameSettings, raster, item.transform, renderBudgetLimits);
    if (framePlan.kind === 'spectral-negative') {
      await renderPhysicalSpectralCanvas(canvas, framePlan, frameSettings, raster.presence, raster.backing, raster.wall, undefined, imprintPixels, renderBudgetLimits, session);
    } else {
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height);
      const weights = edgeLightWeights(settings.brandText);
      for (let pixel = 0; pixel < raster.presence.length; pixel += 1) {
        const alpha = raster.presence[pixel];
        const x = pixel % canvas.width;
        const y = Math.floor(pixel / canvas.width);
        const point = canvasToFilm(framePlan, x / framePlan.pxPerMm, y / framePlan.pxPerMm);
        const gatePixel = point.s >= framePlan.gate.s && point.s <= framePlan.gate.s + framePlan.gate.width
          && point.t >= framePlan.gate.t && point.t <= framePlan.gate.t + framePlan.gate.height;
        const coverage = imprintPixels[pixel * 4 + 3] / 255;
        for (let channel = 0; channel < 3; channel += 1) {
          const base = gatePixel ? rgba.data[pixel * 4 + channel] : raster.filmBase[pixel * 3 + channel] * 255;
          const printed = base + coverage * 96 * weights.edge[channel];
          rgba.data[pixel * 4 + channel] = Math.round(printed * alpha + raster.backing[pixel * 3 + channel] * 255 + raster.wall[pixel * 3 + channel] * 255);
        }
      }
      context.putImageData(rgba, 0, 0);
    }
    ctx.drawImage(canvas, Math.round(layout.frames[index].s * plan.pxPerMm), 0);
    } finally {
      if ('close' in image && typeof image.close === 'function') image.close();
    }
  }
  } finally {
    session?.backend.dispose();
  }
}
