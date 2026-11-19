import type { FilmSettings } from '../../types';
import { supportsSpectralStock } from './stockRegistry';
import { positiveProfileForFilm } from './positive';
import { isMonochromeFilm } from './monochrome';
import { isCineStillFilm } from './cineStill';

export type SpectralCanvas = HTMLCanvasElement | OffscreenCanvas;
type SpectralContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function supportsSpectral(settings: Pick<FilmSettings, 'imagingMode' | 'brandText' | 'frameRenderMode' | 'useFilmOverlayTemplate'>): boolean {
  return settings.imagingMode === 'spectral'
    && supportsSpectralStock(settings.brandText)
    && (settings.frameRenderMode ?? 'real135') === 'real135'
    && settings.useFilmOverlayTemplate !== false;
}

/**
 * Task-scoped spectral aperture session. It loads the stock pipeline and creates
 * the backend exactly once, then reuses one pixel buffer across frames. One strip
 * owns one session; the frame size is fixed for the lifetime of the session.
 */
export interface SpectralApertureSession {
  process(ctx: SpectralContext, x: number, y: number, width: number, height: number): Promise<void>;
  dispose(): void;
}

function assertApertureRect(x: number, y: number, width: number, height: number): void {
  if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new RangeError('Spectral aperture dimensions must be positive safe integers');
  }
}

export async function createSpectralApertureSession(
  settings: FilmSettings,
  width: number,
  height: number,
): Promise<SpectralApertureSession | null> {
  if (!supportsSpectral(settings)) return null;
  if (![width, height].every(Number.isSafeInteger) || width <= 0 || height <= 0) {
    throw new RangeError('Spectral aperture session dimensions must be positive safe integers');
  }
  const [{ createSpectralBackend }, { decodeSrgbChannel, srgbByteToLinearProPhoto }, { createPortraPipeline }, { loadSpectralStockResource }, positive, monochrome, cineStill] = await Promise.all([
    import('./backend'),
    import('./inputColor'),
    import('./portraPipeline'),
    import('./stockResourceLoader'),
    import('./positive'),
    import('./monochrome'),
    import('./cineStill'),
  ]);
  const monochromeStock = isMonochromeFilm(settings.brandText);
  const cineStillStock = isCineStillFilm(settings.brandText);
  const pipeline = positiveProfileForFilm(settings.brandText)
    ? await positive.loadPositiveStockResource(settings.brandText)
    : monochromeStock
      ? await monochrome.loadMonochromeStockResource(settings.brandText)
      : cineStillStock
        ? await cineStill.loadCineStillStockResource()
        : createPortraPipeline(await loadSpectralStockResource(settings.brandText));
  const backend = createSpectralBackend({
    pipeline,
    prefer: settings.spectralBackend ?? 'auto',
    canvas: typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height }),
    limits: {
      maxPixels: width * height,
      maxWorkingSetBytes: width * height * 7 * 3 * 4 + 81 * 3 * 8
        + (cineStillStock ? width * height * 10 * 3 * 4 : 0),
    },
    ...(cineStillStock
      ? { maxTextureBytes: 1_500_000 + width * height * 17 * 16 }
      : {}),
  });
  const image = new Float32Array(width * height * 3);
  let disposed = false;

  return {
    async process(ctx, x, y, apertureWidth, apertureHeight) {
      if (disposed) throw new Error('Spectral aperture session is disposed');
      assertApertureRect(x, y, apertureWidth, apertureHeight);
      if (apertureWidth !== width || apertureHeight !== height) {
        throw new RangeError(
          `Spectral aperture session is fixed at ${width}x${height}; received ${apertureWidth}x${apertureHeight}`,
        );
      }
      const rgba = ctx.getImageData(x, y, apertureWidth, apertureHeight);
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        image.set(monochromeStock
          ? [
            decodeSrgbChannel(rgba.data[pixel * 4] / 255), decodeSrgbChannel(rgba.data[pixel * 4 + 1] / 255), decodeSrgbChannel(rgba.data[pixel * 4 + 2] / 255),
          ]
          : srgbByteToLinearProPhoto(
            pipeline.setup,
            rgba.data[pixel * 4],
            rgba.data[pixel * 4 + 1],
            rgba.data[pixel * 4 + 2],
          ), pixel * 3);
      }
      const frame = await backend.render({ width, height, pixels: image });
      try {
        const rgb = backend.readRgb(frame);
        for (let pixel = 0; pixel < width * height; pixel += 1) {
          rgba.data[pixel * 4] = Math.round(rgb[pixel * 3] * 255);
          rgba.data[pixel * 4 + 1] = Math.round(rgb[pixel * 3 + 1] * 255);
          rgba.data[pixel * 4 + 2] = Math.round(rgb[pixel * 3 + 2] * 255);
        }
        ctx.putImageData(rgba, x, y);
      } finally {
        backend.release(frame);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      backend.dispose();
    },
  };
}

/** Apply spectral processing only to aperture pixels, after cover/rotation and before grain/template. */
export async function applySpectralToAperture(
  ctx: SpectralContext,
  x: number,
  y: number,
  width: number,
  height: number,
  settings: FilmSettings,
): Promise<void> {
  if (!supportsSpectral(settings)) return;
  assertApertureRect(x, y, width, height);
  const session = await createSpectralApertureSession(settings, width, height);
  if (!session) return;
  try {
    await session.process(ctx, x, y, width, height);
  } finally {
    session.dispose();
  }
}
