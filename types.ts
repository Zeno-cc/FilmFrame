
export enum FilmType {
  // 柯达 专业彩色负片
  KODAK_PORTRA_160 = 'KODAK PORTRA 160',
  KODAK_PORTRA_400 = 'KODAK PORTRA 400',
  KODAK_PORTRA_800 = 'KODAK PORTRA 800',
  KODAK_EKTAR_100 = 'KODAK EKTAR 100',
  // 柯达 消费级彩色负片
  KODAK_GOLD_200 = 'KODAK GOLD 200',
  KODAK_ULTRAMAX_400 = 'GC 400 KODAK', // 修正为真实胶片代码
  KODAK_COLORPLUS_200 = 'KODAK COLORPLUS 200',
  KODAK_PROIMAGE_100 = 'KODAK PRO IMAGE 100',
  // 柯达 反转片 (正片)
  KODAK_EKTACHROME_E100 = 'KODAK EKTACHROME E100',
  // 柯达 黑白负片
  KODAK_TRI_X_400 = 'KODAK TRI-X 400',
  KODAK_TMAX_100 = 'KODAK T-MAX 100',
  KODAK_TMAX_400 = 'KODAK T-MAX 400',
  KODAK_P3200 = 'KODAK T-MAX P3200',
  // 其他经典型号
  FUJI_SUPERIA = 'FUJI SUPERIA 400',
  CINESTILL_800T = 'CINESTILL 800T',
  ILFORD_HP5 = 'ILFORD HP5 PLUS'
}

export type HoleType = 'square' | 'rounded';
export type OutputFormat = 'image/png' | 'image/jpeg';
export type FrameRenderMode = 'classic' | 'real135';
export type ScanOutputAspect = 'native' | '4:3';
export type ProcessingMode = 'preview' | 'high';
export type OutputMode = 'single' | 'strip';

export interface FilmSettings {
  brandText: FilmType;
  customText: string; // 新增：自定义文字
  frameNumber: number;
  showDate: boolean;
  dateStr: string;
  borderColor: string;
  holeColor: string;
  textColor: string;
  borderSize: number;
  grainIntensity: number;
  holeType: HoleType;
  outputFormat: OutputFormat; // 新增：输出格式
  outputQuality: number;      // 新增：输出质量 (0.1 - 1.0)
  processingMode?: ProcessingMode;
  frameRenderMode?: FrameRenderMode;
  scanOutputAspect?: ScanOutputAspect;
  autoCropToFilmRatio?: boolean;
  enableRealisticRebate?: boolean;
  maxRollFrames?: 24 | 36;
  useFilmOverlayTemplate?: boolean;
  filmOverlayUrl?: string;
}

export interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
  processedUrl?: string;
  exifDate?: string;
  processingError?: string;
}

export interface FilmPreset {
  holeWidthRatio: number;   // 齿孔宽度比例
  holeHeightRatio: number;  // 齿孔高度比例
  holeRounding: number;     // 齿孔圆角 (0-1)
  spacingRatio: number;     // 齿孔间距比例
  fontFamily: string;
  fontWeight: string;
  brandColor: string;       // 品牌默认主色调
}

// 基础预设 - 柯达标准 (Portra 系列使用等宽字体)
const BASE_KODAK: FilmPreset = {
  holeWidthRatio: 0.38,
  holeHeightRatio: 0.042,
  holeRounding: 0.15, // 默认为较方的孔
  spacingRatio: 0.088,
  fontFamily: '"JetBrains Mono", monospace',
  fontWeight: 'bold',
  brandColor: '#f59e0b'
};

// 基础预设 - 富士 (齿孔略圆，间距略大)
const BASE_FUJI: FilmPreset = {
  holeWidthRatio: 0.36,
  holeHeightRatio: 0.040,
  holeRounding: 0.5, // 默认为全圆角
  spacingRatio: 0.090,
  fontFamily: 'sans-serif',
  fontWeight: 'normal',
  brandColor: '#10b981'
};

// 基础预设 - 黑白 (字体锐利)
const BASE_BW: FilmPreset = {
  holeWidthRatio: 0.38,
  holeHeightRatio: 0.042,
  holeRounding: 0.15,
  spacingRatio: 0.088,
  fontFamily: '"JetBrains Mono", monospace',
  fontWeight: 'bold',
  brandColor: '#d4d4d4'
};

export const FILM_PRESETS: Record<string, FilmPreset> = {
  [FilmType.KODAK_PORTRA_160]: { ...BASE_KODAK, brandColor: '#d97706' },
  [FilmType.KODAK_PORTRA_400]: { ...BASE_KODAK, brandColor: '#f59e0b' },
  [FilmType.KODAK_PORTRA_800]: { ...BASE_KODAK, brandColor: '#b45309' },
  [FilmType.KODAK_EKTAR_100]:   { ...BASE_KODAK, brandColor: '#ef4444' },

  [FilmType.KODAK_GOLD_200]:      { ...BASE_KODAK, brandColor: '#eab308' },
  
  // GC 400 KODAK (Ultramax) 定制: 
  // 1. 颜色是明亮的金黄色 (#ffcc00)
  // 2. 字体是粗无衬线体 (Arial Black / Helvetica Bold)
  // 3. 齿孔稍微方一点
  [FilmType.KODAK_ULTRAMAX_400]:  { 
    ...BASE_KODAK, 
    brandColor: '#ffcc00', 
    fontFamily: 'Arial, "Helvetica Neue", sans-serif',
    fontWeight: '900', // 特粗
    holeRounding: 0.15 
  }, 
  
  [FilmType.KODAK_COLORPLUS_200]: { ...BASE_KODAK, brandColor: '#a855f7' },
  [FilmType.KODAK_PROIMAGE_100]:  { ...BASE_KODAK, brandColor: '#6366f1' },

  [FilmType.KODAK_EKTACHROME_E100]: { ...BASE_KODAK, holeRounding: 0.1, brandColor: '#ffffff' },

  [FilmType.KODAK_TRI_X_400]: { ...BASE_BW, brandColor: '#fbbf24' },
  [FilmType.KODAK_TMAX_100]:  { ...BASE_BW, brandColor: '#a3a3a3' },
  [FilmType.KODAK_TMAX_400]:  { ...BASE_BW, brandColor: '#a3a3a3' },
  [FilmType.KODAK_P3200]:     { ...BASE_BW, brandColor: '#525252' },

  [FilmType.FUJI_SUPERIA]:    { ...BASE_FUJI },
  
  [FilmType.CINESTILL_800T]: { 
    holeWidthRatio: 0.39,
    holeHeightRatio: 0.043,
    holeRounding: 0.2, // CineStill 也是类似 Kodak 的齿孔
    spacingRatio: 0.089,
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 'bold',
    brandColor: '#ef4444'
  },
  
  [FilmType.ILFORD_HP5]: {
    holeWidthRatio: 0.37,
    holeHeightRatio: 0.041,
    holeRounding: 0.15,
    spacingRatio: 0.087,
    fontFamily: 'sans-serif',
    fontWeight: 'bold',
    brandColor: '#16a34a'
  }
};
