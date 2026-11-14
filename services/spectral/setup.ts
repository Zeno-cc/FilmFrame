import type { PackedArray, PortraArrayName, PortraSetupResource, SpectralArrayName } from './types';

const REVISIONS = new Set(['3bb2c2d2801ff68b92019cf1dbcbb133d60832bc', '02d82b56cf65f0f8e802a708612edc4e9a4790af']);
export const SPECTRAL_ARRAY_SHAPES: Record<SpectralArrayName, readonly number[]> = {
  filmTcLut: [192, 192, 3],
  filmLogExposure: [256],
  filmNormalizedCurves: [256, 3],
  filmRawCurves: [256, 3],
  filmDirCurves: [256, 3],
  filmDirMatrix: [3, 3],
  filmLogSensitivity: [81, 3],
  filmChannelDensity: [81, 3],
  filmBaseDensity: [81],
  filmSpectralValidMask: [81],
  paperSpectralValidMask: [81],
  paperLogExposure: [256],
  paperFittedCurves: [256, 3],
  paperLogSensitivity: [81, 3],
  paperChannelDensity: [81, 3],
  paperBaseDensity: [81],
  filteredEnlarger: [81],
  d50: [81],
  cmfs: [81, 3],
  proPhotoToXyzD55Cat16: [3, 3],
  midGrayToXyzReferenceCat16: [3, 3],
  xyzD50ToSrgbCat02: [3, 3],
  srgbToXyz: [3, 3],
  srgbToProPhoto: [3, 3],
  xyzToSrgb: [3, 3],
  xyzWhiteSrgb: [3],
  oklabXyzToLms: [3, 3],
  oklabLmsToXyz: [3, 3],
  oklabLmsToLab: [3, 3],
  oklabLabToLms: [3, 3],
  cam16LGrid: [64],
  cam16HGrid: [720],
  cam16Cmax: [64, 720],
};

export type PortraArrays = Record<PortraArrayName, Float64Array>;

export interface PortraSetup {
  resource: PortraSetupResource;
  arrays: PortraArrays;
  staticBytes: number;
}

const MASKS = new Set<PortraArrayName>(['filmSpectralValidMask', 'paperSpectralValidMask']);
const CURVE_AXES = new Set<PortraArrayName>(['filmLogExposure', 'paperLogExposure']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function digestValues(values: readonly number[]): Promise<string> {
  const bytes = Float64Array.from(values);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function decodeArray(name: SpectralArrayName, value: unknown): PackedArray {
  if (!isRecord(value) || value.dtype !== 'float64' || value.order !== 'C'
    || !Array.isArray(value.shape) || !Array.isArray(value.values)
    || typeof value.payloadSha256 !== 'string') {
    throw new Error(`Invalid spectral setup encoding: ${name}`);
  }
  const expectedShape = SPECTRAL_ARRAY_SHAPES[name];
  if (value.shape.length !== expectedShape.length
    || value.shape.some((dimension, index) => dimension !== expectedShape[index])) {
    throw new Error(`Invalid spectral setup shape: ${name}`);
  }
  const length = expectedShape.reduce((total, dimension) => total * dimension, 1);
  if (value.values.length !== length || !value.values.every(item => typeof item === 'number' && Number.isFinite(item))) {
    throw new Error(`Invalid spectral setup values: ${name}`);
  }
  if (!/^[0-9a-f]{64}$/.test(value.payloadSha256)) {
    throw new Error(`Invalid spectral setup digest: ${name}`);
  }
  if (MASKS.has(name) && !value.values.every(item => item === 0 || item === 1)) {
    throw new Error(`Invalid spectral wavelength mask: ${name}`);
  }
  if (CURVE_AXES.has(name) && !value.values.every((item, index, values) => index === 0 || item > values[index - 1])) {
    throw new Error(`Spectral curve axis must be strictly increasing: ${name}`);
  }
  const packed: PackedArray = {
    shape: value.shape,
    dtype: 'float64',
    order: 'C',
    values: value.values,
    payloadSha256: value.payloadSha256,
  };
  return packed;
}

export function decodeSpectralResource(value: unknown, requiredArrays: readonly SpectralArrayName[]): PortraSetupResource {
  if (!isRecord(value) || value.schema !== 1 || !isRecord(value.source)
    || !REVISIONS.has(String(value.source.revision)) || typeof value.source.redistribution !== 'string'
    || !isRecord(value.configuration)
    || (value.configuration.inputColorSpace !== 'ProPhoto RGB' && value.configuration.inputColorSpace !== 'sRGB')
    || value.configuration.outputColorSpace !== 'sRGB'
    || value.configuration.wavelengthCount !== 81
    || value.configuration.outputGamutAlgorithm !== 'oklch'
    || !isRecord(value.arrays)) {
    throw new Error('Unsupported spectral setup configuration');
  }
  const arrays = {} as PortraSetupResource['arrays'];
  for (const name of requiredArrays) {
    if (name === 'midGrayToXyzReferenceCat16' && value.arrays[name] === undefined) {
      if (value.resourceKind === 'spectral-stock-setup') {
        throw new Error('Declared mid-gray calibration requires its exact transform');
      }
      arrays[name] = decodeArray('proPhotoToXyzD55Cat16', value.arrays.proPhotoToXyzD55Cat16);
    } else {
      arrays[name] = decodeArray(name, value.arrays[name]);
    }
  }
  const configuration: PortraSetupResource['configuration'] = {
    inputColorSpace: value.configuration.inputColorSpace,
    outputColorSpace: 'sRGB' as const,
    wavelengthCount: 81 as const,
    outputGamutAlgorithm: 'oklch' as const,
  };
  for (const key of ['filmId', 'paperId', 'referenceIlluminant', 'viewingIlluminant', 'midGrayInputColorSpace', 'filmType', 'channelModel', 'paperGrade'] as const) {
    const metadata = value.configuration[key];
    if (metadata !== undefined && typeof metadata !== 'string') throw new Error(`Invalid spectral setup metadata: ${key}`);
    if (typeof metadata === 'string') Object.assign(configuration, { [key]: metadata });
  }
  for (const key of ['midGrayNormalization', 'printExposure'] as const) {
    const metadata = value.configuration[key];
    if (metadata !== undefined && (typeof metadata !== 'number' || !Number.isFinite(metadata))) throw new Error(`Invalid spectral calibration: ${key}`);
    if (typeof metadata === 'number') configuration[key] = metadata;
  }
  if (value.configuration.directFilmScan !== undefined) {
    if (typeof value.configuration.directFilmScan !== 'boolean') throw new Error('Invalid direct-film-scan metadata');
    configuration.directFilmScan = value.configuration.directFilmScan;
  }
  if (value.configuration.filmDensityMax !== undefined) {
    const density = value.configuration.filmDensityMax;
    if (!Array.isArray(density) || density.length !== 3 || !density.every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0)) {
      throw new Error('Invalid positive density maximum');
    }
    configuration.filmDensityMax = [...density] as [number, number, number];
  }
  if (value.configuration.enlargerCcmY !== undefined) {
    const filter = value.configuration.enlargerCcmY;
    if (!Array.isArray(filter) || filter.length !== 3 || !filter.every(item => typeof item === 'number' && Number.isFinite(item))) {
      throw new Error('Invalid spectral enlarger filter');
    }
    configuration.enlargerCcmY = [...filter];
  }
  const filmId = configuration.filmId ?? 'kodak_portra_400';
  const paperId = configuration.paperId ?? 'kodak_portra_endura';
  const referenceIlluminant = configuration.referenceIlluminant ?? 'D55';
  const viewingIlluminant = configuration.viewingIlluminant ?? 'D50';
  const supportedIlluminants = new Set(['D55', 'D50', 'T', 'K75P']);
  if (!supportedIlluminants.has(referenceIlluminant) || !supportedIlluminants.has(viewingIlluminant)) {
    throw new Error('Unsupported spectral illuminant');
  }
  Object.assign(configuration, { filmId, paperId, referenceIlluminant, viewingIlluminant });
  return { schema: 1, ...(typeof value.resourceKind === 'string' ? { resourceKind: value.resourceKind as PortraSetupResource['resourceKind'] } : {}), source: { revision: String(value.source.revision), redistribution: value.source.redistribution }, configuration, arrays };
}

export function decodePortraSetupResource(value: unknown): PortraSetupResource {
  return decodeSpectralResource(value, Object.keys(SPECTRAL_ARRAY_SHAPES) as PortraArrayName[]);
}

export function createPortraArrays(resource: PortraSetupResource): PortraArrays {
  const arrays = {} as PortraArrays;
  for (const name of Object.keys(resource.arrays) as PortraArrayName[]) {
    arrays[name] = Float64Array.from(resource.arrays[name].values);
  }
  return arrays;
}

export function createPortraSetup(value: unknown): PortraSetup {
  return createPortraSetupFromResource(decodePortraSetupResource(value));
}

export function createPortraSetupFromResource(resource: PortraSetupResource): PortraSetup {
  const arrays = createPortraArrays(resource);
  const staticBytes = Object.values(arrays).reduce((total, array) => total + array.byteLength, 0);
  return { resource, arrays, staticBytes };
}

/** Verify payload hashes when a caller supplies an async crypto implementation. */
export async function verifyPortraResourceDigests(value: unknown): Promise<void> {
  const resource = decodePortraSetupResource(value);
  await verifySpectralResourceDigests(resource);
}

export async function verifySpectralResourceDigests(resource: PortraSetupResource): Promise<void> {
  for (const name of Object.keys(resource.arrays) as SpectralArrayName[]) {
    const packed = resource.arrays[name];
    if (await digestValues(packed.values) !== packed.payloadSha256) {
      throw new Error(`Spectral setup payload digest mismatch: ${name}`);
    }
  }
}
