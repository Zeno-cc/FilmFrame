import { FilmType, type FilmSettings } from '../types';

export const REAL135_SPROCKET_MASK_WIDTH = 1307;
export const REAL135_SPROCKET_MASK_HEIGHT = 1203;

export const REAL135_SPROCKET_MASK_URLS: Partial<Record<FilmType, string>> = {
  [FilmType.KODAK_GOLD_200]: '/film-sprocket-masks/kodak-gold-200.png',
  [FilmType.KODAK_PORTRA_160]: '/film-sprocket-masks/kodak-portra-160.png',
  [FilmType.KODAK_PORTRA_400]: '/film-sprocket-masks/kodak-portra-400.png',
  [FilmType.KODAK_PORTRA_800]: '/film-sprocket-masks/kodak-portra-800.png',
  [FilmType.KODAK_EKTAR_100]: '/film-sprocket-masks/kodak-ektar-100.png',
  [FilmType.KODAK_ULTRAMAX_400]: '/film-sprocket-masks/kodak-ultramax-400.png',
  [FilmType.KODAK_COLORPLUS_200]: '/film-sprocket-masks/kodak-colorplus-200.png',
  [FilmType.KODAK_PROIMAGE_100]: '/film-sprocket-masks/kodak-pro-image-100.png',
  [FilmType.KODAK_EKTACHROME_E100]: '/film-sprocket-masks/kodak-ektachrome-e100.png',
  [FilmType.KODAK_TRI_X_400]: '/film-sprocket-masks/kodak-tri-x-400.png',
  [FilmType.KODAK_TMAX_100]: '/film-sprocket-masks/kodak-tmax-100.png',
  [FilmType.KODAK_TMAX_400]: '/film-sprocket-masks/kodak-tmax-400.png',
  [FilmType.KODAK_P3200]: '/film-sprocket-masks/kodak-tmax-p3200.png',
  [FilmType.FUJI_SUPERIA]: '/film-sprocket-masks/fuji-superia-400.png',
  [FilmType.CINESTILL_800T]: '/film-sprocket-masks/cinestill-800t.png',
  [FilmType.ILFORD_HP5]: '/film-sprocket-masks/ilford-hp5-plus.png',
};

export function getReal135SprocketMaskUrl(brand: FilmType): string | undefined {
  return REAL135_SPROCKET_MASK_URLS[brand];
}

export function getReal135SprocketColor(
  settings: Pick<FilmSettings, 'real135SprocketColor'>,
): string | null {
  return settings.real135SprocketColor ?? null;
}

export function paintTintedSprocketMask(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  mask: CanvasImageSource,
  color: string,
  width: number,
  height: number,
) {
  context.save();
  context.clearRect(0, 0, width, height);
  context.drawImage(mask, 0, 0, width, height);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  context.restore();
}
