import { FilmType } from '../../types';
import { decodePortraSetupResource, verifyPortraResourceDigests } from './setup';
import { spectralStockForFilm } from './stockRegistry';
import type { PortraSetupResource } from './types';

function decode(resource: unknown): PortraSetupResource {
  return decodePortraSetupResource(resource);
}

export async function loadSpectralStockResource(filmType: FilmType): Promise<PortraSetupResource> {
  const stock = spectralStockForFilm(filmType);
  let pending: Promise<PortraSetupResource>;
  switch (filmType) {
    case FilmType.KODAK_PORTRA_400:
      pending = import('./resources/portraResource').then(module => module.portraResource);
      break;
    case FilmType.KODAK_PORTRA_160:
      pending = import('./resources/kodak_portra_160-setup.json').then(module => decode(module.default));
      break;
    case FilmType.KODAK_PORTRA_800:
      pending = import('./resources/kodak_portra_800-setup.json').then(module => decode(module.default));
      break;
    case FilmType.KODAK_PORTRA_800_PUSH1:
      pending = import('./resources/kodak_portra_800_push1-setup.json').then(module => decode(module.default));
      break;
    case FilmType.KODAK_PORTRA_800_PUSH2:
      pending = import('./resources/kodak_portra_800_push2-setup.json').then(module => decode(module.default));
      break;
    case FilmType.KODAK_EKTAR_100:
      pending = import('./resources/kodak_ektar_100-setup.json').then(module => decode(module.default));
      break;
    case FilmType.KODAK_GOLD_200:
      pending = import('./resources/kodak_gold_200-setup.json').then(module => decode(module.default));
      break;
    case FilmType.KODAK_ULTRAMAX_400:
      pending = import('./resources/kodak_ultramax_400-setup.json').then(module => decode(module.default));
      break;
    case FilmType.FUJI_C200:
      pending = import('./resources/fujifilm_c200-setup.json').then(module => decode(module.default));
      break;
    case FilmType.FUJI_XTRA_400:
      pending = import('./resources/fujifilm_xtra_400-setup.json').then(module => decode(module.default));
      break;
    case FilmType.FUJI_PRO_400H:
      pending = import('./resources/fujifilm_pro_400h-setup.json').then(module => decode(module.default));
      break;
    case FilmType.KODAK_VISION3_50D:
      pending = import('./resources/kodak_vision3_50d-setup.json').then(module => decode(module.default));
      break;
    case FilmType.KODAK_VISION3_200T:
      pending = import('./resources/kodak_vision3_200t-setup.json').then(module => decode(module.default));
      break;
    case FilmType.KODAK_VISION3_250D:
      pending = import('./resources/kodak_vision3_250d-setup.json').then(module => decode(module.default));
      break;
    case FilmType.KODAK_VISION3_500T:
      pending = import('./resources/kodak_vision3_500t-setup.json').then(module => decode(module.default));
      break;
    default:
      throw new Error(`No validated spectral resource registered for ${filmType}`);
  }
  const resource = await pending;
  if (!stock || stock.status === 'blocked'
    || resource.configuration.filmId !== stock.profileId
    || resource.configuration.paperId !== stock.paperId) {
    throw new Error(`Spectral resource identity mismatch for ${filmType}`);
  }
  await verifyPortraResourceDigests(resource);
  return resource;
}
