
export enum FilmType {
  KODAK_PORTRA = 'KODAK PORTRA 400',
  KODAK_GOLD = 'KODAK GOLD 200',
  FUJI_SUPERIA = 'FUJI SUPERIA 400',
  TRI_X_400 = 'KODAK TRI-X 400',
  CINESTILL_800T = 'CINESTILL 800T',
  ILFORD_HP5 = 'ILFORD HP5 PLUS'
}

export interface FilmPreset {
  holeWidthRatio: number;   // 齿孔宽度比例
  holeHeightRatio: number;  // 齿孔高度比例
  holeRounding: number;     // 齿孔圆角 (0-1)
  spacingRatio: number;      // 齿孔间距比例
  fontFamily: string;
  fontWeight: string;
  brandColor: string;       // 品牌默认主色调
}

export const FILM_PRESETS: Record<string, FilmPreset> = {
  [FilmType.KODAK_PORTRA]: {
    holeWidthRatio: 0.38,
    holeHeightRatio: 0.042,
    holeRounding: 0.28,
    spacingRatio: 0.088,
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 'bold',
    brandColor: '#f59e0b'
  },
  [FilmType.KODAK_GOLD]: {
    holeWidthRatio: 0.42,
    holeHeightRatio: 0.045,
    holeRounding: 0.15,
    spacingRatio: 0.095,
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: '900',
    brandColor: '#fbbf24'
  },
  [FilmType.FUJI_SUPERIA]: {
    holeWidthRatio: 0.35,
    holeHeightRatio: 0.04,
    holeRounding: 0.4,
    spacingRatio: 0.08,
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 'bold',
    brandColor: '#22c55e'
  },
  [FilmType.CINESTILL_800T]: {
    holeWidthRatio: 0.45, // 电影胶片 KS 齿孔较宽
    holeHeightRatio: 0.038,
    holeRounding: 0.1,
    spacingRatio: 0.09,
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 'normal',
    brandColor: '#ef4444'
  },
  [FilmType.TRI_X_400]: {
    holeWidthRatio: 0.38,
    holeHeightRatio: 0.042,
    holeRounding: 0.05, // 较硬的直角感
    spacingRatio: 0.088,
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 'bold',
    brandColor: '#ffffff'
  },
  [FilmType.ILFORD_HP5]: {
    holeWidthRatio: 0.36,
    holeHeightRatio: 0.042,
    holeRounding: 0.5, // 极圆润
    spacingRatio: 0.088,
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 'bold',
    brandColor: '#d4d4d8'
  }
};

export interface FilmSettings {
  brandText: string;
  frameNumber: number;
  showDate: boolean;
  dateStr: string;
  borderColor: string;
  holeColor: string;
  textColor: string;
  borderSize: number;
  grainIntensity: number;
}

export interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
  processedUrl?: string;
  exifDate?: string;
}
