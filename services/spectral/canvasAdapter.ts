import type { FilmSettings } from '../../types';
import { supportsSpectralStock } from './stockRegistry';
import { positiveProfileForFilm } from './positive';
import { isMonochromeFilm, monochromeLinearSrgbToInput } from './monochrome';
import { isCineStillFilm } from './cineStill';

export type SpectralCanvas = HTMLCanvasElement | OffscreenCanvas;
type SpectralContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function supportsSpectral(settings: Pick<FilmSettings, 'imagingMode' | 'brandText' | 'frameRenderMode' | 'useFilmOverlayTemplate'>): boolean {
  return settings.imagingMode === 'spectral'
    && supportsSpectralStock(settings.brandText)
    && (settings.frameRenderMode ?? 'real135') === 'real135'
    && settings.useFilmOverlayTemplate !== false;
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
  if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new RangeError('Spectral aperture dimensions must be positive safe integers');
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
  const rgba = ctx.getImageData(x, y, width, height);
  const pipeline = positiveProfileForFilm(settings.brandText)
    ? await positive.loadPositiveStockResource(settings.brandText)
    : isMonochromeFilm(settings.brandText)
      ? await monochrome.loadMonochromeStockResource(settings.brandText)
      : isCineStillFilm(settings.brandText)
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
        + (isCineStillFilm(settings.brandText) ? width * height * 10 * 3 * 4 : 0),
    },
    ...(isCineStillFilm(settings.brandText)
      ? { maxTextureBytes: 1_500_000 + width * height * 17 * 16 }
      : {}),
  });
  try {
    const image = new Float32Array(width * height * 3);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      image.set(isMonochromeFilm(settings.brandText)
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
  } finally {
    backend.dispose();
  }
}
