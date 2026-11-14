export interface PackedArray {
  shape: readonly number[];
  dtype: 'float64';
  order: 'C';
  values: readonly number[];
  payloadSha256: string;
}

export type SpectralArrayName =
  | 'filmTcLut'
  | 'filmLogExposure'
  | 'filmNormalizedCurves'
  | 'filmRawCurves'
  | 'filmDirCurves'
  | 'filmDirMatrix'
  | 'filmLogSensitivity'
  | 'filmChannelDensity'
  | 'filmBaseDensity'
  | 'filmSpectralValidMask'
  | 'paperSpectralValidMask'
  | 'paperLogExposure'
  | 'paperFittedCurves'
  | 'paperLogSensitivity'
  | 'paperChannelDensity'
  | 'paperBaseDensity'
  | 'filteredEnlarger'
  | 'd50'
  | 'cmfs'
  | 'proPhotoToXyzD55Cat16'
  | 'midGrayToXyzReferenceCat16'
  | 'xyzD50ToSrgbCat02'
  | 'srgbToXyz'
  | 'srgbToProPhoto'
  | 'xyzToSrgb'
  | 'oklabXyzToLms'
  | 'oklabLmsToXyz'
  | 'oklabLmsToLab'
  | 'oklabLabToLms'
  | 'cam16LGrid'
  | 'cam16HGrid'
  | 'cam16Cmax'
  | 'xyzWhiteSrgb';

export type PortraArrayName = Exclude<SpectralArrayName, 'midGrayToXyzReferenceCat16'> | 'midGrayToXyzReferenceCat16';

export interface PortraSetupResource {
  schema: 1;
  resourceKind?: 'spectral-stock-setup' | 'spectral-positive-setup' | 'spectral-monochrome-setup' | 'spectral-cinestill-setup';
  source: {
    revision: string;
    redistribution: string;
  };
  configuration: {
    inputColorSpace: 'ProPhoto RGB' | 'sRGB';
    outputColorSpace: 'sRGB';
    wavelengthCount: 81;
    outputGamutAlgorithm: 'oklch';
    filmId?: string;
    paperId?: string;
    referenceIlluminant?: string;
    viewingIlluminant?: string;
    midGrayInputColorSpace?: 'sRGB';
    enlargerCcmY?: readonly number[];
    filmType?: 'positive';
    directFilmScan?: boolean;
    filmDensityMax?: readonly [number, number, number];
    channelModel?: 'bw';
    paperGrade?: string;
    midGrayNormalization?: number;
    printExposure?: number;
  };
  arrays: Record<PortraArrayName, PackedArray>;
}

export interface RgbImage {
  width: number;
  height: number;
  /** Scene-linear RGB in the selected resource's declared input space, packed RGB, finite float32 values. */
  pixels: Float32Array;
}

export interface SpectralStages {
  width: number;
  height: number;
  /** Log10 film exposure, before development. */
  filmRaw: Float32Array;
  /** Three-channel negative density after normalized curves and pointwise DIR. */
  negativeDensity: Float32Array;
  /** Log10 paper exposure after the exact 81-wavelength enlarger integral. */
  paperLogExposure: Float32Array;
  /** Three-channel paper density after fitted characteristic curves. */
  paperDensity: Float32Array;
  /** D50 scan, XYZ -> OkLch/sRGB -> sRGB transfer encoded output. */
  printRgb: Float32Array;
  allocation: {
    inputBytes: number;
    stageBytes: number;
    /** Source plus five returned stage planes, print output and scan receiver; excludes fixed setup. */
    workingArrayBytes: number;
    spectralIntegrals: number;
    wavelengthIterations: number;
  };
}

export interface RenderLimits {
  maxPixels: number;
  maxWorkingSetBytes: number;
}

export interface RgbaImage {
  width: number;
  height: number;
  /** Unpremultiplied sRGB-encoded RGBA bytes; alpha is never processed. */
  pixels: Uint8ClampedArray;
}
