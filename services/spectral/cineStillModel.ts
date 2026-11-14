import model from './resources/cineStillModel.json';
import type { RgbImage } from './types';
import type { Vec3 } from './math';

export const CINESTILL_SIGMA_OVER_BASE = model.configuration.sigmaOverBase as unknown as readonly (readonly [number, number, number])[];
export const CINESTILL_WEIGHTS = model.configuration.weights as unknown as readonly (readonly [number, number, number])[];
const REQUIRED_SOURCE = {
  url: 'https://github.com/JamesQiu2005/SpektraLab',
  revision: '02d82b56cf65f0f8e802a708612edc4e9a4790af',
  aliasSha256: '4b5c5771a1d4755cf2f2994bbc0529387d579cc8d9fb6e23fe5d3d856fc13161',
  psfSha256: 'ee2902b67a10b1dce04ae5ac835529668cc8ae28579278fb36d90ea56aab6b3d',
  baseSetupSha256: '11413d5f577a4ddcfbbb7cb215d88100b103b60d2870e9d1076529841d0d76d0',
};

export interface CineStillGaussianComponent {
  sigma: Vec3;
  weights: Vec3;
}

export interface CineStillSpatialPlan {
  baseThicknessPx: number;
  components: readonly CineStillGaussianComponent[];
}

export interface CineStillSpatial {
  baseProfileId: 'kodak_vision3_500t';
  baseThicknessUm: number;
  filmFormatMm: number;
  amount: number;
  spatialScale: number;
  headroomEv: number;
  headroomFromEv: number;
  headroomToEv: number;
  clipFromEv: number;
  clipToEv: number;
  midGray: number;
  strength: Vec3;
  plan(width: number, height: number): CineStillSpatialPlan;
}

export interface CineStillHeadroomResult extends RgbImage {
  clip: number;
}

function triple(value: readonly number[], name: string): Vec3 {
  if (value.length !== 3 || !value.every(item => Number.isFinite(item) && item >= 0)) throw new Error(`Invalid CineStill ${name}`);
  return [value[0], value[1], value[2]];
}

function smoothstep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export function applyCineStillHeadroom(image: RgbImage, headroomEv = model.configuration.headroomEv): CineStillHeadroomResult {
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0
    || image.width > Math.floor(Number.MAX_SAFE_INTEGER / image.height) || image.pixels.length !== image.width * image.height * 3) {
    throw new RangeError('CineStill input must be packed RGB with positive safe dimensions');
  }
  let clip = 0;
  for (let index = 0; index < image.pixels.length; index += 1) {
    if (!Number.isFinite(image.pixels[index])) throw new RangeError(`Non-finite CineStill input at ${index}`);
    clip = Math.max(clip, image.pixels[index]);
  }
  if (!(headroomEv > 0) || !(clip > 0)) return { ...image, clip };
  const pixels = new Float32Array(image.pixels.length);
  for (let offset = 0; offset < image.pixels.length; offset += 3) {
    const maximum = Math.max(image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2]);
    let gain = 1;
    if (maximum > 0) {
      const logMaximum = Math.log2(maximum);
      const nearClip = smoothstep((logMaximum - Math.log2(clip) - model.configuration.clipFromEv)
        / (model.configuration.clipToEv - model.configuration.clipFromEv));
      const overFloor = smoothstep((logMaximum - Math.log2(model.configuration.midGray) - model.configuration.headroomFromEv)
        / (model.configuration.headroomToEv - model.configuration.headroomFromEv));
      gain = 2 ** (headroomEv * nearClip * overFloor);
    }
    for (let channel = 0; channel < 3; channel += 1) pixels[offset + channel] = image.pixels[offset + channel] * gain;
  }
  return { width: image.width, height: image.height, pixels, clip };
}

function gaussianKernel(sigma: number): Float64Array {
  if (!(sigma > 0) || !Number.isFinite(sigma)) throw new RangeError('CineStill Gaussian sigma must be positive and finite');
  const radius = Math.floor(3 * sigma + 0.5);
  const kernel = new Float64Array(radius * 2 + 1);
  let sum = 0;
  for (let index = -radius; index <= radius; index += 1) {
    const value = Math.exp(-0.5 * (index / sigma) ** 2);
    kernel[index + radius] = value;
    sum += value;
  }
  for (let index = 0; index < kernel.length; index += 1) kernel[index] /= sum;
  return kernel;
}

function reflectedIndex(index: number, size: number): number {
  if (size <= 1) return 0;
  const period = 2 * size - 2;
  const wrapped = ((index % period) + period) % period;
  return wrapped < size ? wrapped : period - wrapped;
}

function convolve(image: RgbImage, component: CineStillGaussianComponent): Float32Array {
  const { width, height } = image;
  const kernels = component.sigma.map(gaussianKernel);
  const radii = kernels.map(kernel => (kernel.length - 1) / 2);
  const horizontal = new Float64Array(image.pixels.length);
  const output = new Float32Array(image.pixels.length);
  for (let channel = 0; channel < 3; channel += 1) {
    const kernel = kernels[channel];
    const radius = radii[channel];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        for (let tap = -radius; tap <= radius; tap += 1) {
          sum += image.pixels[(y * width + reflectedIndex(x + tap, width)) * 3 + channel] * kernel[tap + radius];
        }
        horizontal[(y * width + x) * 3 + channel] = sum;
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        for (let tap = -radius; tap <= radius; tap += 1) {
          sum += horizontal[(reflectedIndex(y + tap, height) * width + x) * 3 + channel] * kernel[tap + radius];
        }
        output[(y * width + x) * 3 + channel] = sum;
      }
    }
  }
  return output;
}

export function createCineStillSpatial(overrides: { amount?: number; spatialScale?: number; headroomEv?: number; filmFormatMm?: number } = {}): CineStillSpatial {
  if (model.schema !== 1 || model.resourceKind !== 'spectral-cinestill-spatial'
    || JSON.stringify(model.source) !== JSON.stringify(REQUIRED_SOURCE)
    || model.configuration.filmId !== 'cinestill_800t' || model.configuration.antihalation !== 'no'
    || model.configuration.backReflection !== true || model.configuration.boundary !== 'reflect'
    || model.configuration.baseProfileId !== 'kodak_vision3_500t' || model.configuration.paperId !== 'kodak_2383') {
    throw new Error('Invalid CineStill spatial resource identity');
  }
  if (CINESTILL_SIGMA_OVER_BASE.length !== 4 || CINESTILL_WEIGHTS.length !== 4) throw new Error('CineStill requires four Gaussian components');
  for (let component = 0; component < 4; component += 1) {
    const sigma = triple(CINESTILL_SIGMA_OVER_BASE[component], 'sigma');
    if (sigma.some(value => value <= 0)) throw new Error('CineStill sigma must be positive');
    const weights = CINESTILL_WEIGHTS[component];
    if (weights.length !== 3 || !weights.every(Number.isFinite)) throw new Error('Invalid signed CineStill weights');
  }
  const strength = triple(model.configuration.strength, 'strength');
  const amount = overrides.amount ?? model.configuration.amount;
  const spatialScale = overrides.spatialScale ?? model.configuration.spatialScale;
  const headroomEv = overrides.headroomEv ?? model.configuration.headroomEv;
  const filmFormatMm = overrides.filmFormatMm ?? model.configuration.filmFormatMm;
  if (!(filmFormatMm > 0) || !Number.isFinite(filmFormatMm)) throw new Error('CineStill film format must be positive and finite');
  if (!(amount > 0) || !(spatialScale > 0) || !Number.isFinite(amount) || !Number.isFinite(spatialScale)) throw new Error('CineStill amount and spatial scale must be positive');
  if (!Number.isFinite(headroomEv) || headroomEv < 0 || headroomEv > 8) throw new Error('CineStill headroom must be in [0, 8]');
  return {
    baseProfileId: 'kodak_vision3_500t',
    baseThicknessUm: model.configuration.baseThicknessUm,
    filmFormatMm,
    amount,
    spatialScale,
    headroomEv,
    headroomFromEv: model.configuration.headroomFromEv,
    headroomToEv: model.configuration.headroomToEv,
    clipFromEv: model.configuration.clipFromEv,
    clipToEv: model.configuration.clipToEv,
    midGray: model.configuration.midGray,
    strength,
    plan(width, height) {
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw new RangeError('CineStill frame dimensions must be positive');
      const baseThicknessPx = model.configuration.baseThicknessUm * spatialScale * Math.sqrt(amount)
        / (filmFormatMm * 1000 / Math.max(width, height));
      return {
        baseThicknessPx,
        components: CINESTILL_SIGMA_OVER_BASE.map((sigma, index) => ({
          sigma: sigma.map(value => value * baseThicknessPx) as unknown as Vec3,
          weights: [...CINESTILL_WEIGHTS[index]] as Vec3,
        })),
      };
    },
  };
}

export function applyCineStillBackReflection(
  image: RgbImage,
  spatial: CineStillSpatial,
): RgbImage {
  const { components } = spatial.plan(image.width, image.height);
  const halo = new Float64Array(image.pixels.length);
  for (const component of components) {
    const blurred = convolve(image, component);
    for (let offset = 0; offset < image.pixels.length; offset += 3) {
      for (let channel = 0; channel < 3; channel += 1) halo[offset + channel] += blurred[offset + channel] * component.weights[channel];
    }
  }
  const output = new Float32Array(image.pixels.length);
  for (let offset = 0; offset < image.pixels.length; offset += 3) {
    for (let channel = 0; channel < 3; channel += 1) {
      const strength = Math.fround(spatial.strength[channel]) * Math.fround(spatial.amount);
      output[offset + channel] = (image.pixels[offset + channel] + strength * halo[offset + channel]) / (1 + strength);
    }
  }
  if (!output.every(Number.isFinite)) throw new Error('CineStill spatial processing produced non-finite exposure');
  return { width: image.width, height: image.height, pixels: output };
}

export function applyCineStillHalation(
  image: RgbImage,
  spatial: CineStillSpatial,
  options: { headroomEv?: number } = {},
): RgbImage {
  const { pixels, clip } = applyCineStillHeadroom(image, options.headroomEv ?? spatial.headroomEv);
  if (clip === 0) return { width: image.width, height: image.height, pixels };
  return applyCineStillBackReflection({ width: image.width, height: image.height, pixels }, spatial);
}
