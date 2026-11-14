import { FilmType } from '../../types';

export type SpectralStockStatus = 'replace-look' | 'add' | 'blocked';

export interface SpectralStockDefinition {
  filmType: FilmType | null;
  profileId: string;
  paperId: string;
  status: SpectralStockStatus;
  reason: string;
}

export const SPECTRAL_STOCKS: readonly SpectralStockDefinition[] = [
  { filmType: FilmType.KODAK_PORTRA_400, profileId: 'kodak_portra_400', paperId: 'kodak_portra_endura', status: 'replace-look', reason: 'Validated Portra 400 / Endura spectral pipeline.' },
  { filmType: FilmType.KODAK_PORTRA_160, profileId: 'kodak_portra_160', paperId: 'kodak_portra_endura', status: 'replace-look', reason: 'Exact negative and declared paper pair.' },
  { filmType: FilmType.KODAK_PORTRA_800, profileId: 'kodak_portra_800', paperId: 'kodak_portra_endura', status: 'replace-look', reason: 'Exact ordinary stock, not a push variant.' },
  { filmType: FilmType.KODAK_PORTRA_800_PUSH1, profileId: 'kodak_portra_800_push1', paperId: 'kodak_portra_endura', status: 'add', reason: 'Exact push-1 profile, filter and independently validated perforation density.' },
  { filmType: FilmType.KODAK_PORTRA_800_PUSH2, profileId: 'kodak_portra_800_push2', paperId: 'kodak_portra_endura', status: 'add', reason: 'Exact push-2 profile, filter and independently validated perforation density.' },
  { filmType: FilmType.KODAK_EKTAR_100, profileId: 'kodak_ektar_100', paperId: 'kodak_portra_endura', status: 'replace-look', reason: 'Exact negative and declared paper pair.' },
  { filmType: FilmType.KODAK_GOLD_200, profileId: 'kodak_gold_200', paperId: 'kodak_portra_endura', status: 'replace-look', reason: 'Replace only Gold aperture approximation; preserve border.' },
  { filmType: FilmType.KODAK_ULTRAMAX_400, profileId: 'kodak_ultramax_400', paperId: 'kodak_portra_endura', status: 'replace-look', reason: 'Exact negative and declared paper pair.' },
  { filmType: FilmType.FUJI_C200, profileId: 'fujifilm_c200', paperId: 'fujifilm_crystal_archive_typeii', status: 'add', reason: 'New Fuji negative with Fuji paper/filter pair.' },
  { filmType: FilmType.FUJI_XTRA_400, profileId: 'fujifilm_xtra_400', paperId: 'fujifilm_crystal_archive_typeii', status: 'add', reason: 'Distinct X-Tra stock; not Superia 400 replacement.' },
  { filmType: FilmType.FUJI_PRO_400H, profileId: 'fujifilm_pro_400h', paperId: 'fujifilm_crystal_archive_typeii', status: 'add', reason: 'New Fuji negative with Fuji paper/filter pair.' },
  { filmType: FilmType.KODAK_VISION3_50D, profileId: 'kodak_vision3_50d', paperId: 'kodak_2383', status: 'add', reason: 'Vision3 negative with Kodak 2383 and K75P viewing.' },
  { filmType: FilmType.KODAK_VISION3_200T, profileId: 'kodak_vision3_200t', paperId: 'kodak_2383', status: 'add', reason: 'Tungsten-reference Vision3 negative with cinema print.' },
  { filmType: FilmType.KODAK_VISION3_250D, profileId: 'kodak_vision3_250d', paperId: 'kodak_2383', status: 'add', reason: 'Vision3 negative with Kodak 2383 and K75P viewing.' },
  { filmType: FilmType.KODAK_VISION3_500T, profileId: 'kodak_vision3_500t', paperId: 'kodak_2383', status: 'add', reason: 'Tungsten-reference Vision3 negative with cinema print.' },
  { filmType: FilmType.KODAK_COLORPLUS_200, profileId: 'kodak_colorplus_200', paperId: '', status: 'blocked', reason: 'No exact pinned camera-negative profile; do not substitute another stock.' },
  { filmType: FilmType.KODAK_PROIMAGE_100, profileId: 'kodak_pro_image_100', paperId: '', status: 'blocked', reason: 'No exact pinned camera-negative profile.' },
  { filmType: FilmType.FUJI_SUPERIA, profileId: 'fujifilm_superia_400', paperId: '', status: 'blocked', reason: 'No exact Superia profile; X-Tra 400 is distinct.' },
  { filmType: FilmType.KODAK_TMAX_400, profileId: 'kodak_tmax_400', paperId: '', status: 'blocked', reason: 'No exact pinned profile; do not substitute T-Max 100 or Tri-X.' },
  { filmType: FilmType.KODAK_P3200, profileId: 'kodak_tmax_p3200', paperId: '', status: 'blocked', reason: 'No exact pinned profile.' },
  { filmType: FilmType.CINESTILL_800T, profileId: 'cinestill_800t', paperId: 'kodak_2383', status: 'add', reason: 'Exact Vision3 500T alias with independent no-rem-jet headroom and bounded signed-Gaussian back-reflection; compatibility edge only.' },
  { filmType: FilmType.FUJI_PROVIA_100F, profileId: 'fujifilm_provia_100f', paperId: '', status: 'add', reason: 'Exact positive develop and direct film scan; no paper or physical-perforation claim.' },
  { filmType: FilmType.FUJI_VELVIA_100, profileId: 'fujifilm_velvia_100', paperId: '', status: 'add', reason: 'Exact positive develop and direct film scan; no paper or physical-perforation claim.' },
  { filmType: FilmType.KODAK_EKTACHROME_E100, profileId: 'kodak_ektachrome_100', paperId: '', status: 'replace-look', reason: 'Exact positive develop and direct film scan replaces legacy aperture; edge remains compatibility.' },
  { filmType: FilmType.KODAK_KODACHROME_64, profileId: 'kodak_kodachrome_64', paperId: '', status: 'add', reason: 'Exact positive develop and direct film scan; no paper or physical-perforation claim.' },
  { filmType: FilmType.FUJI_ACROS_II, profileId: 'fujifilm_neopan_acros_100_ii', paperId: 'ilford_multigrade_iv_rc', status: 'add', reason: 'Exact product monochrome profile with Multigrade grade 2; fitted paper, not a color-negative preset.' },
  { filmType: FilmType.KODAK_TRI_X_400, profileId: 'kodak_tri_x_400', paperId: 'ilford_multigrade_iv_rc', status: 'replace-look', reason: 'Exact product monochrome profile with Multigrade grade 2; preserve the Ilford/Kodak edge identity.' },
  { filmType: FilmType.KODAK_TMAX_100, profileId: 'kodak_tmax_100', paperId: 'ilford_multigrade_iv_rc', status: 'replace-look', reason: 'Exact product monochrome profile with Multigrade grade 2; not T-Max 400.' },
  { filmType: FilmType.ILFORD_HP5, profileId: 'ilford_hp5_plus_400', paperId: 'ilford_multigrade_iv_rc', status: 'replace-look', reason: 'Exact product monochrome profile with Multigrade grade 2 and Ilford edge identity.' },
];

export function spectralStockForFilm(filmType: FilmType): SpectralStockDefinition | undefined {
  return SPECTRAL_STOCKS.find(stock => stock.filmType === filmType);
}

export function supportsSpectralStock(filmType: FilmType): boolean {
  const stock = spectralStockForFilm(filmType);
  return stock !== undefined && stock.status !== 'blocked';
}
