import { FilmType } from '../../types';
import { decodeSpectralResource, verifySpectralResourceDigests, type PortraArrays, type PortraSetup } from './setup';
import { exposeFilm } from './film';
import { interpolateCurve, multiply3, type Vec3 } from './math';
import { createScanReceiver, spectralIntegral } from './print';
import { compressOklch, encodeSrgb } from './scan';
import type { PortraSetupResource, RenderLimits, RgbImage, SpectralArrayName } from './types';
import { validateSpectralRenderInput } from './portraPipeline';

export type PositiveStock = FilmType.FUJI_PROVIA_100F | FilmType.FUJI_VELVIA_100 | FilmType.KODAK_EKTACHROME_E100 | FilmType.KODAK_KODACHROME_64;

const POSITIVE_ARRAYS: readonly SpectralArrayName[] = [
  'filmTcLut', 'filmLogExposure', 'filmNormalizedCurves', 'filmDirCurves', 'filmDirMatrix',
  'filmChannelDensity', 'filmBaseDensity', 'filmSpectralValidMask', 'd50', 'cmfs',
  'proPhotoToXyzD55Cat16', 'xyzD50ToSrgbCat02', 'srgbToXyz', 'xyzToSrgb', 'srgbToProPhoto',
  'oklabXyzToLms', 'oklabLmsToXyz', 'oklabLmsToLab', 'oklabLabToLms',
  'cam16LGrid', 'cam16HGrid', 'cam16Cmax', 'xyzWhiteSrgb',
];

type PositiveArrays = Pick<PortraArrays, (typeof POSITIVE_ARRAYS)[number]>;
export type PositiveSetup = Omit<PortraSetup, 'arrays'> & { arrays: PositiveArrays };

export interface PositivePipeline {
  setup: PositiveSetup;
  densityMax: readonly [number, number, number];
}

export function decodePositiveSetupResource(value: unknown): PortraSetupResource {
  const resource = decodeSpectralResource(value, POSITIVE_ARRAYS);
  const configuration = resource.configuration;
  if (resource.resourceKind !== 'spectral-positive-setup'
    || configuration.filmType !== 'positive' || configuration.directFilmScan !== true
    || !Array.isArray(configuration.filmDensityMax) || configuration.filmDensityMax.length !== 3
    || !configuration.filmDensityMax.every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0)) {
    throw new Error('Invalid positive direct-film-scan resource configuration');
  }
  return resource;
}

export function createPositivePipeline(value: unknown): PositivePipeline {
  const resource = decodePositiveSetupResource(value);
  const densityMax = resource.configuration.filmDensityMax!;
  const arrays = Object.fromEntries(Object.entries(resource.arrays).map(([name, packed]) => [name, Float64Array.from(packed.values)])) as unknown as PositiveArrays;
  return { setup: { resource, arrays, staticBytes: Object.values(arrays).reduce((total, array) => total + array.byteLength, 0) }, densityMax };
}

export async function verifyPositiveResourceDigests(value: unknown): Promise<void> {
  decodePositiveSetupResource(value);
  await verifySpectralResourceDigests(decodePositiveSetupResource(value));
}

export function developPositiveFilm(setup: PositiveSetup, densityMax: Vec3, filmRaw: Float32Array): Float32Array {
  const { filmLogExposure, filmNormalizedCurves, filmDirCurves, filmDirMatrix } = setup.arrays;
  const output = new Float32Array(filmRaw.length);
  for (let offset = 0; offset < filmRaw.length; offset += 3) {
    const silver: Vec3 = [
      densityMax[0] - interpolateCurve(filmRaw[offset], filmLogExposure, filmNormalizedCurves, 0),
      densityMax[1] - interpolateCurve(filmRaw[offset + 1], filmLogExposure, filmNormalizedCurves, 1),
      densityMax[2] - interpolateCurve(filmRaw[offset + 2], filmLogExposure, filmNormalizedCurves, 2),
    ];
    for (let receiver = 0; receiver < 3; receiver += 1) {
      let correction = 0;
      for (let donor = 0; donor < 3; donor += 1) correction += silver[donor] * filmDirMatrix[donor * 3 + receiver];
      output[offset + receiver] = interpolateCurve(filmRaw[offset + receiver] - correction, filmLogExposure, filmDirCurves, receiver);
    }
  }
  return output;
}

export function scanPositiveFilm(setup: PositiveSetup, density: Float32Array): Float32Array {
  const receiver = createScanReceiver(setup);
  const output = new Float32Array(density.length);
  for (let offset = 0; offset < density.length; offset += 3) {
    const xyz = spectralIntegral(
      [density[offset], density[offset + 1], density[offset + 2]],
      setup.arrays.filmChannelDensity, setup.arrays.filmBaseDensity, receiver, setup.arrays.filmSpectralValidMask,
    );
    const compressed = compressOklch(setup, multiply3(setup.arrays.xyzD50ToSrgbCat02, xyz));
    for (let channel = 0; channel < 3; channel += 1) output[offset + channel] = encodeSrgb(compressed[channel]);
  }
  return output;
}

export function renderPositiveStages(image: RgbImage, pipeline: PositivePipeline, limits?: RenderLimits) {
  // Source, three stage planes and the existing 81x3 float64 scan receiver.
  validateSpectralRenderInput(image, limits, 3);
  const filmRaw = exposeFilm(pipeline.setup, image);
  const positiveDensity = developPositiveFilm(pipeline.setup, pipeline.densityMax, filmRaw);
  const scanRgb = scanPositiveFilm(pipeline.setup, positiveDensity);
  return { width: image.width, height: image.height, filmRaw, positiveDensity, scanRgb };
}

export function positiveProfileForFilm(filmType: FilmType): PositiveStock | undefined {
  return [FilmType.FUJI_PROVIA_100F, FilmType.FUJI_VELVIA_100, FilmType.KODAK_EKTACHROME_E100, FilmType.KODAK_KODACHROME_64].includes(filmType as PositiveStock)
    ? filmType as PositiveStock : undefined;
}

export async function loadPositiveStockResource(filmType: FilmType): Promise<PositivePipeline> {
  let pending: Promise<{ default: unknown }>;
  switch (filmType) {
    case FilmType.FUJI_PROVIA_100F: pending = import('./resources/fujifilm_provia_100f-setup.json'); break;
    case FilmType.FUJI_VELVIA_100: pending = import('./resources/fujifilm_velvia_100-setup.json'); break;
    case FilmType.KODAK_EKTACHROME_E100: pending = import('./resources/kodak_ektachrome_100-setup.json'); break;
    case FilmType.KODAK_KODACHROME_64: pending = import('./resources/kodak_kodachrome_64-setup.json'); break;
    default: throw new Error(`No validated positive resource registered for ${filmType}`);
  }
  const pipeline = createPositivePipeline((await pending).default);
  await verifyPositiveResourceDigests(pipeline.setup.resource);
  return pipeline;
}
