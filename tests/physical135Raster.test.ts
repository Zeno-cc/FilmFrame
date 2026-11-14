import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import { FilmType, type FilmSettings } from '../types';
import { canvasToFilm, createPhysicalFilmPlan, filmToCanvas, filmToRollPoint, type PhysicalFilmPlan } from '../services/physical135/plan';
import { createPhysicalRaster, paintPhysicalFrame, paintPhysicalImprints, physicalRectangleCoverage } from '../services/physical135/canvas';
import { nextPhysicalSeed } from '../services/physical135/seed';
import { createPhysicalStripLayout, createPhysicalStripPlan, perforationsForPhysicalStripFrame, physicalStripFrameImprints, physicalStripFramePlan } from '../services/physical135/strip';

const base: Pick<FilmSettings, 'brandText'> & Partial<Pick<FilmSettings,
  'frameRenderMode' | 'imagingMode' | 'edgeRenderMode' | 'physicalBacking'
  | 'physicalBodySeed' | 'physicalFrameSeed' | 'physicalFog' | 'physicalLeaks' | 'physicalStraighten' | 'physicalAperture'
>> = {
  brandText: FilmType.KODAK_PORTRA_400,
  frameRenderMode: 'real135' as const,
  imagingMode: 'spectral' as const,
  edgeRenderMode: 'physical135' as const,
  physicalBodySeed: 1,
  physicalFrameSeed: 1,
  physicalFog: 1,
  physicalLeaks: 0,
  physicalStraighten: 0,
  physicalAperture: 5.6,
  physicalBacking: 'open' as const,
};

function plan(patch: Partial<typeof base> = {}) {
  return createPhysicalFilmPlan({
    settings: { ...base, ...patch },
    orientation: 'landscape',
    gateWidth: 36,
    gateHeight: 24,
    pxPerMm: 20,
  });
}

function createImprintContext(width = 32, height = 24) {
  const canvas = { width, height };
  const context = {
    canvas,
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    fillText: vi.fn(),
    font: '',
  } as unknown as CanvasRenderingContext2D;
  return { context, canvas: canvas as HTMLCanvasElement };
}

function createPhotoContext(width: number, height: number) {
  const canvas = { width, height };
  const context = {
    canvas,
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    fillText: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return { context, canvas: canvas as HTMLCanvasElement };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('physical imprint rasterization', () => {
  it('leaves compatibility imprint coverage to the exposure pass', () => {
    const physicalPlan = {
      ...plan({ imagingMode: 'legacy' }),
      outputWidth: 32,
      outputHeight: 24,
      perforations: [],
    };
    const { context } = createPhotoContext(32, 24);
    paintPhysicalFrame(
      context,
      { width: 32, height: 24 } as HTMLImageElement,
      physicalPlan,
      { brandText: FilmType.KODAK_PORTRA_400, frameNumber: 1, physicalFog: 1, physicalLeaks: 0 },
      createPhysicalRaster(physicalPlan),
    );
    expect(context.fillText).not.toHaveBeenCalled();
  });

  it('rasterizes the same physical rectangle identically in adjacent windows', () => {
    const first = plan();
    const second = { ...plan(), advanceOriginS: 38 };
    const rectangle = { s: 37.8, t: 34.1 };
    const end = { s: 38.12, t: 35.1 };
    expect(physicalRectangleCoverage(first, 759, 699, rectangle, end)).toBeCloseTo(1, 10);
    expect(physicalRectangleCoverage(second, 0, 699, { s: rectangle.s - 38, t: 34.1 }, { s: end.s - 38, t: 35.1 })).toBeCloseTo(1, 10);
    const partialStart = { s: 37.96, t: 34.1 };
    expect(physicalRectangleCoverage(first, 759, 699, partialStart, end)).toBeCloseTo(0.8, 10);
    expect(physicalRectangleCoverage(second, 0, 699, { s: partialStart.s - 38, t: 34.1 }, { s: end.s - 38, t: 35.1 })).toBeCloseTo(1, 10);
    const shifted = { ...plan(), advanceOriginS: 37 };
    expect(physicalRectangleCoverage(shifted, 19, 699, { s: partialStart.s - 37, t: 34.1 }, { s: end.s - 37, t: 35.1 })).toBeCloseTo(0.8, 10);
  });

  it('keeps DX imprint coverage aligned across straightened strip windows', () => {
    const settings = { ...base, brandText: FilmType.KODAK_GOLD_200, frameNumber: 1, physicalStraighten: 1.5, processingMode: 'preview' as const };
    const strip = createPhysicalStripPlan(settings, 2);
    const first = physicalStripFramePlan(strip, 0, { physicalFrameSeed: 1 }, settings);
    const second = physicalStripFramePlan(strip, 1, { physicalFrameSeed: 1 }, settings);
    const rectangle = { kind: 'rect' as const, s: 38 - 0.2, s1: 38 + 0.1, t: 34.1, t1: 34.3, layer: 'all' as const };
    const firstRectangle = physicalStripFrameImprints(first, [rectangle])[0];
    const secondRectangle = physicalStripFrameImprints(second, [rectangle])[0];
    const firstCanvas = filmToCanvas(first, (firstRectangle.s + firstRectangle.s1!) / 2, (firstRectangle.t + firstRectangle.t1!) / 2);
    const secondCanvas = filmToCanvas(second, (secondRectangle.s + secondRectangle.s1!) / 2, (secondRectangle.t + secondRectangle.t1!) / 2);
    const firstPoint = canvasToFilm(first, firstCanvas.s, firstCanvas.t);
    const secondPoint = canvasToFilm(second, secondCanvas.s, secondCanvas.t);
    const firstCoverage = physicalRectangleCoverage(first, Math.floor(firstCanvas.s * first.pxPerMm), Math.floor(firstCanvas.t * first.pxPerMm), { s: firstRectangle.s, t: firstRectangle.t }, { s: firstRectangle.s1!, t: firstRectangle.t1! });
    const secondCoverage = physicalRectangleCoverage(second, Math.floor(secondCanvas.s * second.pxPerMm), Math.floor(secondCanvas.t * second.pxPerMm), { s: secondRectangle.s, t: secondRectangle.t }, { s: secondRectangle.s1!, t: secondRectangle.t1! });
    expect(secondCoverage).toBeCloseTo(firstCoverage, 8);
    expect(Math.abs(secondPoint.t - firstPoint.t)).toBeLessThan(0.000001);
  });

  it.each([
    { orientation: 'landscape' as const, straighten: -1.5 },
    { orientation: 'landscape' as const, straighten: 1.5 },
    { orientation: 'portrait' as const, straighten: -1.5 },
    { orientation: 'portrait' as const, straighten: 1.5 },
  ])('rotates $orientation imprint glyphs by $straighten degrees without moving their baseline', ({ orientation, straighten }) => {
    const physicalPlan = createPhysicalFilmPlan({
      settings: { ...base, physicalStraighten: straighten },
      orientation,
      gateWidth: 36,
      gateHeight: 24,
      pxPerMm: 20,
    });
    const { context } = createImprintContext();
    const text = { kind: 'text' as const, s: 8, t: 3, text: '400', cap: 1 };
    const baseline = filmToCanvas(physicalPlan, text.s, text.t);

    paintPhysicalImprints(context, physicalPlan, { brandText: FilmType.KODAK_PORTRA_400, frameNumber: 1 }, [text]);

    expect(context.translate).toHaveBeenCalledWith(baseline.s * physicalPlan.pxPerMm, baseline.t * physicalPlan.pxPerMm);
    expect(context.rotate).toHaveBeenCalledWith((orientation === 'portrait' ? Math.PI / 2 : 0) + straighten * Math.PI / 180);
    expect(context.fillText).toHaveBeenCalledWith('400', 0, 0);
  });

  it('uses the optional mono family without changing the default imprint font', () => {
    const physicalPlan: PhysicalFilmPlan = { ...plan(), outputWidth: 32, outputHeight: 24 };
    const { context } = createImprintContext();
    const text = {
      kind: 'text', s: 0, t: 1, text: '800T', cap: 1, bold: true, fontFamily: 'mono',
    } as const;
    paintPhysicalImprints(context, physicalPlan, { brandText: FilmType.CINESTILL_800T, frameNumber: 1 }, [text]);
    expect(context.font).toContain('Menlo');
    expect(context.font).toContain('monospace');
    paintPhysicalImprints(context, physicalPlan, { brandText: FilmType.KODAK_PORTRA_400, frameNumber: 1 }, [{ ...text, fontFamily: undefined }]);
    expect(context.font).toContain('Helvetica Neue');
    expect(context.font).not.toContain('Menlo');
  });
});

describe('physical raster geometry and scan controls', () => {
  it('renders both perforation rails with clear backing and transparent film centers', () => {
    const physicalPlan = plan();
    const result = createPhysicalRaster(physicalPlan);
    const { width, height } = { width: 760, height: 700 };
    const topHole = physicalPlan.perforations[1];
    const bottomHole = physicalPlan.perforations[9];
    const sample = (hole: typeof topHole) => ({
      x: Math.floor(hole.center.s * physicalPlan.pxPerMm),
      y: Math.floor(hole.center.t * physicalPlan.pxPerMm),
    });
    const topPoint = sample(topHole);
    const bottomPoint = sample(bottomHole);
    const topX = topPoint.x;
    const bottomX = bottomPoint.x;
    const topY = topPoint.y;
    const bottomY = bottomPoint.y;
    const top = result.presence[topY * width + topX];
    const bottom = result.presence[bottomY * width + bottomX];
    expect(top).toBe(0);
    expect(bottom).toBe(0);
    expect(result.backing[(topY * width + topX) * 3]).toBe(1);
    expect(result.presence[Math.floor(height / 2) * width + Math.floor(width / 2)]).toBe(1);
  });

  it('supports zero fog/leaks and a deterministic backing change', () => {
    const withoutFog = createPhysicalRaster(plan({ physicalFog: 0 }));
    const withFog = createPhysicalRaster(plan({ physicalFog: 2 }));
    expect(withFog.filmBase.some((value, index) => value !== withoutFog.filmBase[index])).toBe(true);
    const black = createPhysicalRaster(plan({ physicalBacking: 'black' }));
    expect(black.backing.every(value => value === 0)).toBe(true);
  });

  it('keeps the body seed while changing frame scan registration', () => {
    const first = createPhysicalRaster(plan());
    const next = createPhysicalRaster(plan({ physicalFrameSeed: nextPhysicalSeed(1) }));
    expect(next.presence).not.toEqual(first.presence);
    // Native typed-array comparison checks every byte without expanding millions
    // of float entries through the assertion library's object traversal.
    expect(isDeepStrictEqual(createPhysicalRaster(plan()), first)).toBe(true);
  });

  it('keeps a shared perforation phase across continuous strips', () => {
    const one = createPhysicalStripPlan({ ...base, frameNumber: 1 }, 1);
    const five = createPhysicalStripPlan({ ...base, frameNumber: 1 }, 5);
    expect(one.perforations).toHaveLength(16);
    expect(five.perforations).toHaveLength(80);
    for (let index = 0; index < 16; index += 1) {
      expect(five.perforations[index].center).toEqual(one.perforations[index].center);
      expect(five.perforations[index + 16].center.s - five.perforations[index].center.s).toBeCloseTo(38, 10);
    }
    expect(createPhysicalStripLayout({ ...base, processingMode: 'preview' }, 4, 20).totalWidthMm).toBe(152);
    expect(five.body).toEqual(one.body);
    expect(five.frame).toEqual(one.frame);
  });

  it('keeps a photograph frame seed independent in its strip plan', () => {
    const settings = { ...base, processingMode: 'preview' as const };
    const plan = createPhysicalStripPlan(settings, 2);
    const first = physicalStripFramePlan(plan, 0, { physicalFrameSeed: 1 }, settings);
    const second = physicalStripFramePlan(plan, 1, { physicalFrameSeed: 7 }, settings);
    expect(first.frameSeed).toBe(1);
    expect(second.frameSeed).toBe(7);
    expect(second.frame.scanOffset.s - first.frame.scanOffset.s).not.toBeCloseTo(38, 10);
    expect(second.body).toEqual(first.body);
    expect(physicalStripFramePlan(plan, 1, {}, settings).frameSeed).toBe(1);
  });

  it.each([0, 1.5])('keeps identical cross-boundary perforation samples in adjacent windows at %s degrees', straighten => {
    const settings = { ...base, physicalStraighten: straighten, processingMode: 'preview' as const };
    const strip = createPhysicalStripPlan(settings, 2);
    const first = physicalStripFramePlan(strip, 0, { physicalFrameSeed: 1 }, settings);
    const second = physicalStripFramePlan(strip, 1, { physicalFrameSeed: 1 }, settings);
    const crossing = strip.perforations.find(hole => hole.center.s < 38 && hole.center.s + hole.width / 2 > 38)!;
    expect(crossing).toBeDefined();
    const leftPlan = { ...first, outputWidth: first.outputWidth + 1 };
    const firstRaster = createPhysicalRaster(leftPlan);
    const secondRaster = createPhysicalRaster(second);
    const sample = (raster: ReturnType<typeof createPhysicalRaster>, x: number, y: number) => {
      const index = y * raster.width + x;
      return {
        presence: raster.presence[index],
        backing: Array.from(raster.backing.subarray(index * 3, index * 3 + 3)),
        wall: Array.from(raster.wall.subarray(index * 3, index * 3 + 3)),
      };
    };
    const boundaryS = (leftPlan.outputWidth - 0.5) / leftPlan.pxPerMm;
    const firstY = Math.floor(filmToCanvas(leftPlan, boundaryS, crossing.center.t - crossing.height / 2 - 0.2).t * leftPlan.pxPerMm);
    const lastY = Math.ceil(filmToCanvas(leftPlan, boundaryS, crossing.center.t + crossing.height / 2 + 0.2).t * leftPlan.pxPerMm);
    let sawClearHole = false;
    let sawSoftEdge = false;
    let sawCutWall = false;
    for (let y = Math.max(0, firstY); y <= Math.min(leftPlan.outputHeight - 1, lastY); y += 1) {
      const leftPoint = filmToRollPoint(leftPlan, canvasToFilm(leftPlan, boundaryS, (y + 0.5) / leftPlan.pxPerMm));
      const rightPoint = filmToRollPoint(second, canvasToFilm(second, 0.5 / second.pxPerMm, (y + 0.5) / second.pxPerMm));
      expect(rightPoint.s).toBeCloseTo(leftPoint.s, 8);
      expect(rightPoint.t).toBeCloseTo(leftPoint.t, 8);
      const left = sample(firstRaster, leftPlan.outputWidth - 1, y);
      const right = sample(secondRaster, 0, y);
      expect(right.presence).toBe(left.presence);
      for (let channel = 0; channel < 3; channel += 1) {
        expect(right.backing[channel]).toBe(left.backing[channel]);
        expect(right.wall[channel]).toBe(left.wall[channel]);
      }
      sawClearHole ||= left.presence === 0 && left.backing.every(value => value === 1);
      sawSoftEdge ||= left.presence > 0 && left.presence < 1;
      sawCutWall ||= left.wall[0] > 0;
    }
    expect(sawClearHole).toBe(true);
    expect(sawSoftEdge).toBe(true);
    expect(sawCutWall).toBe(true);
  });

  it('keeps a shared physical hole in both adjacent production frame plans', () => {
    const strip = createPhysicalStripPlan({ ...base, processingMode: 'preview' }, 2);
    const crossing = strip.perforations.find(hole => hole.center.s < 38 && hole.center.s + hole.width / 2 > 38)!;
    expect(crossing).toBeDefined();
    const first = physicalStripFramePlan(strip, 0, {}, { ...base, processingMode: 'preview' });
    const second = physicalStripFramePlan(strip, 1, {}, { ...base, processingMode: 'preview' });
    const left = first.perforations.find(hole => hole.center.s === crossing.center.s)!;
    const right = second.perforations.find(hole => hole.center.s === crossing.center.s - 38)!;
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    expect(left.width).toBe(right.width);
    expect(left.height).toBe(right.height);
    expect(left.center.t).toBe(right.center.t);
    expect(first.body).toEqual(second.body);
    expect(first.frameSeed).toBe(second.frameSeed);
  });

  it('keeps adjacent strip frame material continuous in film coordinates', () => {
    const strip = createPhysicalStripPlan({ ...base, processingMode: 'preview' }, 4);
    const frameDimensions = {
      film: { s: 0, t: 0, width: 38, height: 35 },
      outputWidth: Math.round(38 * strip.pxPerMm),
      outputHeight: strip.outputHeight,
    };
    const first = createPhysicalRaster({ ...strip, ...frameDimensions, perforations: strip.perforations.slice(0, 16) });
    const second = createPhysicalRaster(physicalStripFramePlan(strip, 1, {}, { ...base, processingMode: 'preview' }));
    const firstSeamX = first.width;
    for (let y = 0; y < strip.outputHeight; y += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const firstIndex = (y * first.width + firstSeamX - 1) * 3 + channel;
        const boundaryIndex = (y * second.width) * 3 + channel;
        // Adjacent pixel centers remain one pixel apart at the boundary. Their
        // difference must retain the smooth material gradient rather than reset
        // to a new per-frame texture or introduce a visible rebate seam.
        expect(Math.abs(second.filmBase[boundaryIndex] - first.filmBase[firstIndex])).toBeLessThan(1 / 255);
      }
    }
    const sameFirst = createPhysicalRaster({
      ...strip,
      ...frameDimensions,
      film: { ...frameDimensions.film, width: 38 + 1 / strip.pxPerMm },
      outputWidth: frameDimensions.outputWidth + 1,
      advanceOriginS: 0,
      perforations: perforationsForPhysicalStripFrame(strip, 0).perforations,
    });
    const sameSecond = createPhysicalRaster({ ...physicalStripFramePlan(strip, 1, {}, { ...base, processingMode: 'preview' }), outputWidth: first.width + 1 });
    for (let y = 0; y < strip.outputHeight; y += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const left = (y * sameFirst.width + sameFirst.width - 1) * 3 + channel;
        const right = (y * sameSecond.width) * 3 + channel;
        expect(sameSecond.filmBase[right]).toBeCloseTo(sameFirst.filmBase[left], 8);
      }
    }
  });

  it('keeps roll material continuous under nonzero scan straightening', () => {
    const settings = { ...base, physicalLeaks: 1, physicalStraighten: 1.5, processingMode: 'preview' as const };
    const strip = createPhysicalStripPlan(settings, 2);
    const first = physicalStripFramePlan(strip, 0, { physicalFrameSeed: 1 }, settings);
    const second = physicalStripFramePlan(strip, 1, { physicalFrameSeed: 1 }, settings);
    const leftPlan = { ...first, outputWidth: first.outputWidth + 1 };
    const left = createPhysicalRaster(leftPlan);
    const right = createPhysicalRaster(second);
    for (let y = 0; y < strip.outputHeight; y += 1) {
      const leftPixel = y * left.width + left.width - 1;
      const rightPixel = y * right.width;
      const leftPoint = filmToRollPoint(leftPlan, canvasToFilm(leftPlan, (left.width - 0.5) / leftPlan.pxPerMm, (y + 0.5) / leftPlan.pxPerMm));
      const rightPoint = filmToRollPoint(second, canvasToFilm(second, 0.5 / second.pxPerMm, (y + 0.5) / second.pxPerMm));
      expect(Math.abs(rightPoint.s - leftPoint.s)).toBeLessThan(0.00001);
      expect(Math.abs(rightPoint.t - leftPoint.t)).toBeLessThan(0.001);
      expect(Math.abs(right.presence[rightPixel] - left.presence[leftPixel])).toBeLessThan(0.0001);
      for (let channel = 0; channel < 3; channel += 1) {
        expect(Math.abs(right.filmBase[rightPixel * 3 + channel] - left.filmBase[leftPixel * 3 + channel])).toBeLessThan(0.0001);
        expect(Math.abs(right.backing[rightPixel * 3 + channel] - left.backing[leftPixel * 3 + channel])).toBeLessThan(0.0001);
        expect(Math.abs(right.wall[rightPixel * 3 + channel] - left.wall[leftPixel * 3 + channel])).toBeLessThan(0.0001);
      }
    }
    expect(first.frameSeed).toBe(1);
    expect(second.frameSeed).toBe(1);
  });

  it('keeps portrait raster rows aligned with the canvas and gate', () => {
    const portrait = createPhysicalFilmPlan({
      settings: base,
      orientation: 'portrait',
      gateWidth: 36,
      gateHeight: 24,
      pxPerMm: 20,
    });
    const result = createPhysicalRaster(portrait);
    expect(result.width).toBe(portrait.outputWidth);
    expect(result.height).toBe(portrait.outputHeight);
    expect(result.presence).toHaveLength(portrait.outputWidth * portrait.outputHeight);
    const x = Math.round(portrait.outputWidth / 2);
    const y = Math.round(portrait.outputHeight / 2);
    expect(result.presence[y * result.width + x]).toBe(1);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(result.backing[(y * result.width + x) * 3 + channel]).toBe(0);
    }
  });

  it('uses actual straightening in the scan coordinate transform', () => {
    const straight = createPhysicalRaster(plan({ physicalStraighten: 1 }));
    const rotated = createPhysicalRaster(plan({ physicalStraighten: 2 }));
    expect(rotated.filmBase).not.toEqual(straight.filmBase);
  });
});
