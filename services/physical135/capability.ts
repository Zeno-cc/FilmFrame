import { FilmType } from '../../types';
import { supportsSpectralStock } from '../spectral/stockRegistry';

const PHYSICAL_SPECTRAL_UNSUPPORTED = new Set<FilmType>([
  FilmType.CINESTILL_800T,
  FilmType.FUJI_PROVIA_100F,
  FilmType.FUJI_VELVIA_100,
  FilmType.KODAK_EKTACHROME_E100,
  FilmType.KODAK_KODACHROME_64,
  FilmType.FUJI_ACROS_II,
  FilmType.ILFORD_HP5,
  FilmType.KODAK_TRI_X_400,
  FilmType.KODAK_TMAX_100,
]);

export function supportsPhysicalSpectralStock(filmType: FilmType): boolean {
  return supportsSpectralStock(filmType) && !PHYSICAL_SPECTRAL_UNSUPPORTED.has(filmType);
}

export function defaultEdgeForStock(filmType: FilmType): 'legacy-template' | 'physical135' {
  return supportsPhysicalSpectralStock(filmType) ? 'physical135' : 'legacy-template';
}
