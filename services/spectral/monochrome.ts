import { FilmType } from '../../types';
import { createPortraSetupFromResource, decodeSpectralResource, verifySpectralResourceDigests, type PortraSetup } from './setup';
import { multiply3, type Vec3 } from './math';
import { preparePortraPrint, type PortraPrintSetup } from './print';
import type { PortraSetupResource } from './types';

export interface MonochromePipeline extends PortraPipeline {
  setup: PortraSetup & { resource: PortraSetupResource & { resourceKind: 'spectral-monochrome-setup' } };
  filmTcLut: Float64Array;
  inputColorMatrix: Float64Array;
  filmKind: 'monochrome';
}

import { validateSpectralRenderInput, type PortraPipeline } from './portraPipeline';
import { developPaper, exposePaper } from './print';
import { scanPaper } from './scan';
import { exposeFilm } from './film';
import { interpolateCurve } from './math';
import type { RgbImage, RenderLimits } from './types';

export function isMonochromeFilm(filmType: FilmType): boolean {
  return [FilmType.FUJI_ACROS_II, FilmType.ILFORD_HP5, FilmType.KODAK_TRI_X_400, FilmType.KODAK_TMAX_100].includes(filmType);
}

export function decodeMonochromeSetupResource(value: unknown): PortraSetupResource {
  const resource = decodeSpectralResource(value, [
    'filmTcLut', 'filmLogExposure', 'filmNormalizedCurves', 'filmRawCurves', 'filmDirCurves', 'filmDirMatrix',
    'filmChannelDensity', 'filmBaseDensity', 'filmSpectralValidMask',
    'paperSpectralValidMask', 'paperLogExposure', 'paperFittedCurves', 'paperLogSensitivity', 'paperChannelDensity', 'paperBaseDensity',
    'filteredEnlarger', 'd50', 'cmfs', 'proPhotoToXyzD55Cat16', 'xyzD50ToSrgbCat02', 'srgbToXyz', 'srgbToProPhoto', 'xyzToSrgb',
    'oklabXyzToLms', 'oklabLmsToXyz', 'oklabLmsToLab', 'oklabLabToLms', 'cam16LGrid', 'cam16HGrid', 'cam16Cmax', 'xyzWhiteSrgb',
  ]);
  const configuration = resource.configuration as PortraSetupResource['configuration'] & { channelModel?: string; paperGrade?: string; printExposure?: number; midGrayNormalization?: number };
  if (resource.resourceKind !== 'spectral-monochrome-setup' || configuration.channelModel !== 'bw'
    || resource.configuration.paperId !== 'ilford_multigrade_iv_rc' || configuration.paperGrade !== '2'
    || typeof configuration.midGrayNormalization !== 'number' || !Number.isFinite(configuration.midGrayNormalization) || configuration.midGrayNormalization <= 0) {
    throw new Error('Invalid monochrome Multigrade resource configuration');
  }
  if (!Array.isArray(resource.configuration.enlargerCcmY) || resource.configuration.enlargerCcmY.length !== 3) {
    throw new Error('Missing exact Multigrade filter pack');
  }
  return resource;
}

export function monochromeLinearSrgbToInput(pipeline: MonochromePipeline, rgb: Vec3): Vec3 {
  return multiply3(pipeline.setup.arrays.srgbToProPhoto, rgb);
}

export function developMonochromeFilm(pipeline: MonochromePipeline, filmRaw: Float32Array): Float32Array {
  const output = new Float32Array(filmRaw.length);
  for (let offset = 0; offset < filmRaw.length; offset += 3) {
    for (let channel = 0; channel < 3; channel += 1) {
      output[offset + channel] = interpolateCurve(filmRaw[offset + channel], pipeline.setup.arrays.filmLogExposure, pipeline.setup.arrays.filmNormalizedCurves, channel);
    }
  }
  return output;
}

export function renderMonochromeStages(image: RgbImage, pipeline: MonochromePipeline, limits?: RenderLimits) {
  validateSpectralRenderInput(image, limits);
  const filmRaw = exposeFilm(pipeline.setup, image);
  const negativeDensity = developMonochromeFilm(pipeline, filmRaw);
  const paperLogExposure = exposePaper(pipeline.setup, pipeline.print, negativeDensity);
  const paperDensity = developPaper(pipeline.setup, paperLogExposure);
  const printRgb = scanPaper(pipeline.setup, paperDensity);
  return { width: image.width, height: image.height, filmRaw, negativeDensity, paperLogExposure, paperDensity, printRgb };
}

export function createMonochromePipeline(value: unknown): MonochromePipeline {
  const resource = decodeMonochromeSetupResource(value);
  const setup = createPortraSetupFromResource(resource);
  const print: PortraPrintSetup = {
    enlargerReceiver: Float64Array.from({ length: 81 * 3 }, (_, index) => setup.arrays.filteredEnlarger[Math.floor(index / 3)] * 10 ** setup.arrays.paperLogSensitivity[index]),
    normalization: new Float64Array(3).fill((resource.configuration as PortraSetupResource['configuration'] & { midGrayNormalization: number }).midGrayNormalization),
  };
  return { setup: setup as MonochromePipeline['setup'], print, filmTcLut: setup.arrays.filmTcLut, inputColorMatrix: setup.arrays.proPhotoToXyzD55Cat16, filmKind: 'monochrome' };
}

export async function loadMonochromeStockResource(filmType: FilmType): Promise<MonochromePipeline> {
  let pending: Promise<{ default: unknown }>;
  switch (filmType) {
    case FilmType.FUJI_ACROS_II: pending = import('./resources/fujifilm_neopan_acros_100_ii-setup.json'); break;
    case FilmType.ILFORD_HP5: pending = import('./resources/ilford_hp5_plus_400-setup.json'); break;
    case FilmType.KODAK_TRI_X_400: pending = import('./resources/kodak_tri_x_400-setup.json'); break;
    case FilmType.KODAK_TMAX_100: pending = import('./resources/kodak_tmax_100-setup.json'); break;
    default: throw new Error(`No validated monochrome resource registered for ${filmType}`);
  }
  const pipeline = createMonochromePipeline((await pending).default);
  await verifySpectralResourceDigests(pipeline.setup.resource);
  return pipeline;
}
