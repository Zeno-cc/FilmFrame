import { srgbByteToLinearProPhoto } from './inputColor';
import { developFilm, exposeFilm } from './film';
import { developPaper, exposePaper, preparePortraPrint, type PortraPrintSetup } from './print';
import { scanPaper } from './scan';
import { createPortraSetup, type PortraSetup } from './setup';
import type { PortraSetupResource, RenderLimits, RgbaImage, RgbImage, SpectralStages } from './types';

export const DEFAULT_SPECTRAL_LIMITS: Readonly<RenderLimits> = {
  maxPixels: 2_073_600,
  // Source plus five returned stages, print output and the scan receiver; excludes fixed setup tables.
  maxWorkingSetBytes: 2_073_600 * 7 * 3 * 4 + 81 * 3 * 8,
};

export interface PortraPipeline {
  setup: PortraSetup;
  print: PortraPrintSetup;
}

export function createPortraPipeline(resource: PortraSetupResource): PortraPipeline {
  const setup = createPortraSetup(resource);
  return { setup, print: preparePortraPrint(setup, setup.arrays.filmRawCurves) };
}

function validateRgb(image: RgbImage, limits: RenderLimits): number {
  const { width, height, pixels } = image;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || width > Math.floor(Number.MAX_SAFE_INTEGER / height)) {
    throw new RangeError('Spectral image dimensions must be positive safe integers');
  }
  const pixelCount = width * height;
  if (pixelCount > limits.maxPixels) throw new RangeError('Spectral image exceeds the pixel budget');
  if (!(pixels instanceof Float32Array) || pixels.length !== pixelCount * 3) {
    throw new RangeError('Spectral RGB input must be packed Float32Array RGB');
  }
  for (let index = 0; index < pixels.length; index += 1) {
    if (!Number.isFinite(pixels[index])) throw new RangeError(`Non-finite spectral input at ${index}`);
  }
  return pixelCount;
}

function validateStage(stage: Float32Array, name: string): void {
  for (let index = 0; index < stage.length; index += 1) {
    if (!Number.isFinite(stage[index])) throw new Error(`Non-finite ${name} output at ${index}`);
  }
}

/** Validate the existing CPU working-set contract before allocating stage planes. */
export function validateSpectralRenderInput(
  image: RgbImage,
  limits: RenderLimits = DEFAULT_SPECTRAL_LIMITS,
  stagePlanes = 6,
): Pick<SpectralStages['allocation'], 'inputBytes' | 'stageBytes' | 'workingArrayBytes'> {
  if (!Number.isSafeInteger(limits.maxPixels) || limits.maxPixels <= 0
    || !Number.isSafeInteger(limits.maxWorkingSetBytes) || limits.maxWorkingSetBytes <= 0) {
    throw new RangeError('Spectral limits must be positive safe integers');
  }
  const pixels = validateRgb(image, limits);
  const inputBytes = image.pixels.byteLength;
  const stageBytes = pixels * 3 * 4;
  const scanReceiverBytes = 81 * 3 * 8;
  const workingArrayBytes = inputBytes + stageBytes * stagePlanes + scanReceiverBytes;
  if (workingArrayBytes > limits.maxWorkingSetBytes) {
    throw new RangeError(`Spectral working set ${workingArrayBytes} exceeds ${limits.maxWorkingSetBytes} bytes`);
  }
  return { inputBytes, stageBytes, workingArrayBytes };
}

export function renderPortraStages(
  image: RgbImage,
  pipeline: PortraPipeline,
  limits: RenderLimits = DEFAULT_SPECTRAL_LIMITS,
): SpectralStages {
  const allocation = validateSpectralRenderInput(image, limits);
  const pixels = image.width * image.height;
  const filmRaw = exposeFilm(pipeline.setup, image);
  validateStage(filmRaw, 'film raw');
  const negativeDensity = developFilm(pipeline.setup, filmRaw);
  validateStage(negativeDensity, 'negative density');
  const paperLogExposure = exposePaper(pipeline.setup, pipeline.print, negativeDensity);
  validateStage(paperLogExposure, 'paper log exposure');
  const paperDensity = developPaper(pipeline.setup, paperLogExposure);
  validateStage(paperDensity, 'paper density');
  const printRgb = scanPaper(pipeline.setup, paperDensity);
  validateStage(printRgb, 'print RGB');
  return {
    width: image.width,
    height: image.height,
    filmRaw,
    negativeDensity,
    paperLogExposure,
    paperDensity,
    printRgb,
    allocation: {
      ...allocation,
      spectralIntegrals: pixels * 2,
      wavelengthIterations: pixels * 2 * 81,
    },
  };
}

export function renderLinearProPhotoRgba(
  image: RgbaImage,
  pipeline: PortraPipeline,
  limits?: RenderLimits,
): RgbaImage {
  if (!(image.pixels instanceof Uint8ClampedArray)
    || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width <= 0 || image.height <= 0
    || image.width > Math.floor(Number.MAX_SAFE_INTEGER / image.height)
    || image.pixels.length !== image.width * image.height * 4) {
    throw new RangeError('RGBA input must have valid dimensions and packed Uint8ClampedArray RGBA');
  }
  const pixels = image.width * image.height;
  const effectiveLimits = limits ?? DEFAULT_SPECTRAL_LIMITS;
  if (!Number.isSafeInteger(effectiveLimits.maxPixels) || effectiveLimits.maxPixels <= 0
    || !Number.isSafeInteger(effectiveLimits.maxWorkingSetBytes) || effectiveLimits.maxWorkingSetBytes <= 0) {
    throw new RangeError('Spectral limits must be positive safe integers');
  }
  if (pixels > effectiveLimits.maxPixels) throw new RangeError('Spectral image exceeds the pixel budget');
  const adapterBytes = image.pixels.byteLength + pixels * 4 + pixels * 7 * 3 * 4 + 81 * 3 * 8;
  if (adapterBytes > effectiveLimits.maxWorkingSetBytes) {
    throw new RangeError(`Spectral RGBA working set ${adapterBytes} exceeds ${effectiveLimits.maxWorkingSetBytes} bytes`);
  }
  const activePipeline = pipeline;
  const rgb = new Float32Array(pixels * 3);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    rgb.set(srgbByteToLinearProPhoto(
      activePipeline.setup,
      image.pixels[pixel * 4],
      image.pixels[pixel * 4 + 1],
      image.pixels[pixel * 4 + 2],
    ), pixel * 3);
  }
  const result = renderPortraStages({ width: image.width, height: image.height, pixels: rgb }, activePipeline, limits);
  const output = new Uint8ClampedArray(pixels * 4);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      output[pixel * 4 + channel] = Math.round(result.printRgb[pixel * 3 + channel] * 255);
    }
    output[pixel * 4 + 3] = image.pixels[pixel * 4 + 3];
  }
  return { width: image.width, height: image.height, pixels: output };
}
