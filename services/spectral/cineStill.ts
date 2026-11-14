import { FilmType } from '../../types';
import { createPortraPipeline, renderPortraStages, type PortraPipeline, DEFAULT_SPECTRAL_LIMITS } from './portraPipeline';
import { decodePortraSetupResource, verifyPortraResourceDigests } from './setup';
import type { PortraSetupResource, RenderLimits, RgbImage, SpectralStages } from './types';
import { applyCineStillHalation, createCineStillSpatial, type CineStillSpatial } from './cineStillModel';
import model from './resources/cineStillModel.json';

export { applyCineStillHalation, applyCineStillHeadroom, applyCineStillBackReflection } from './cineStillModel';
export { CINESTILL_SIGMA_OVER_BASE, CINESTILL_WEIGHTS } from './cineStillModel';

export interface CineStillPipeline extends PortraPipeline {
  filmKind: 'cineStill';
  spatial: CineStillSpatial;
  render(image: RgbImage, limits?: RenderLimits): SpectralStages;
}

export function isCineStillFilm(filmType: FilmType): boolean {
  return filmType === FilmType.CINESTILL_800T;
}

export function renderCineStillStages(
  image: RgbImage,
  pipeline: CineStillPipeline,
  limits?: RenderLimits,
): SpectralStages {
  const activeLimits = limits ?? DEFAULT_SPECTRAL_LIMITS;
  const spatialBytes = image.width * image.height * 10 * 3 * 4;
  if (spatialBytes > activeLimits.maxWorkingSetBytes) throw new RangeError('CineStill spatial working set exceeds the render budget');
  return renderPortraStages(applyCineStillHalation(image, pipeline.spatial), pipeline, limits);
}

export function createCineStillPipeline(value: unknown): CineStillPipeline {
  const resource = decodePortraSetupResource(value);
  if (resource.configuration.filmId !== 'kodak_vision3_500t' && resource.configuration.filmId !== 'cinestill_800t') {
    throw new Error('CineStill must derive from the exact Vision3 500T resource');
  }
  if (resource.configuration.paperId !== 'kodak_2383') throw new Error('CineStill requires the declared Kodak 2383 print');
  const base = createPortraPipeline({
    ...resource,
    configuration: { ...resource.configuration, filmId: 'cinestill_800t' },
  });
  const configuration = (value as { configuration?: { spatialScale?: number; amount?: number; headroomEv?: number; filmFormatMm?: number } }).configuration;
  const pipeline: CineStillPipeline = {
    ...base,
    filmKind: 'cineStill',
    spatial: createCineStillSpatial({
      spatialScale: configuration?.spatialScale ?? model.configuration.spatialScale,
      amount: configuration?.amount ?? model.configuration.amount,
      filmFormatMm: configuration?.filmFormatMm ?? model.configuration.filmFormatMm,
      ...(configuration?.headroomEv === undefined ? {} : { headroomEv: configuration.headroomEv }),
    }),
    render(image, limits) { return renderCineStillStages(image, pipeline, limits); },
  };
  return pipeline;
}

export async function loadCineStillStockResource(): Promise<CineStillPipeline> {
  const { default: source } = await import('./resources/kodak_vision3_500t-setup.json');
  const resource = decodePortraSetupResource({
    ...source,
    resourceKind: 'spectral-cinestill-setup',
    configuration: { ...source.configuration, filmId: 'cinestill_800t' },
  }) as PortraSetupResource;
  const pipeline = createCineStillPipeline(resource);
  await verifyPortraResourceDigests(resource);
  return pipeline;
}
