import { FILM_PRESETS, FilmType } from '../types';
import type { FilmSettings, OutputMode } from '../types';
import { defaultEdgeForStock, supportsPhysicalSpectralStock } from './physical135/capability';
import { supportsReal135Template } from './filmOverlay';

const STORAGE_KEY = 'filmFrame.preferences.v1';
export const CURRENT_RENDER_PREFERENCE_VERSION = 1;

const FILM_TYPES = new Set<string>(Object.values(FilmType));
const OUTPUT_FORMATS = new Set(['image/png', 'image/jpeg']);
const HOLE_TYPES = new Set(['square', 'rounded']);
const PROCESSING_MODES = new Set(['preview', 'high']);
const IMAGING_MODES = new Set(['legacy', 'spectral']);
const SPECTRAL_BACKENDS = new Set(['auto', 'webgl2', 'cpu']);
const EDGE_RENDER_MODES = new Set(['legacy-template', 'physical135']);
const PHYSICAL_BACKINGS = new Set(['black', 'open']);
const FRAME_RENDER_MODES = new Set(['classic', 'real135']);
const SCAN_OUTPUT_ASPECTS = new Set(['native', '4:3']);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: unknown, min: number, max: number): number | undefined {
  const clamped = clampNumber(value, min, max);
  return clamped === undefined ? undefined : Math.floor(clamped);
}

function setString<T extends keyof FilmSettings>(
  patch: Partial<FilmSettings>,
  source: Record<string, unknown>,
  key: T
) {
  if (typeof source[key] === 'string') {
    patch[key] = source[key] as FilmSettings[T];
  }
}

function setBoolean<T extends keyof FilmSettings>(
  patch: Partial<FilmSettings>,
  source: Record<string, unknown>,
  key: T
) {
  if (typeof source[key] === 'boolean') {
    patch[key] = source[key] as FilmSettings[T];
  }
}

function setHexColor<T extends keyof FilmSettings>(
  patch: Partial<FilmSettings>,
  source: Record<string, unknown>,
  key: T,
) {
  const value = source[key];
  if (typeof value === 'string' && HEX_COLOR.test(value)) {
    patch[key] = value.toLowerCase() as FilmSettings[T];
  }
}

export function normalizeSettingsPatch(value: unknown): Partial<FilmSettings> {
  if (!isRecord(value)) {
    return {};
  }

  const patch: Partial<FilmSettings> = {};

  if (typeof value.brandText === 'string' && FILM_TYPES.has(value.brandText)) {
    patch.brandText = value.brandText as FilmType;
  }

  setString(patch, value, 'customText');
  setString(patch, value, 'dateStr');
  setString(patch, value, 'borderColor');
  setString(patch, value, 'holeColor');
  setString(patch, value, 'textColor');
  setBoolean(patch, value, 'showDate');
  setBoolean(patch, value, 'autoCropToFilmRatio');
  setBoolean(patch, value, 'enableRealisticRebate');
  setBoolean(patch, value, 'useFilmOverlayTemplate');
  if (value.frameNumberColor === undefined && Object.hasOwn(value, 'frameNumberColor')) {
    patch.frameNumberColor = undefined;
  } else {
    setHexColor(patch, value, 'frameNumberColor');
  }
  if (value.real135SprocketColor === undefined && Object.hasOwn(value, 'real135SprocketColor')) {
    patch.real135SprocketColor = undefined;
  } else {
    setHexColor(patch, value, 'real135SprocketColor');
  }
  setHexColor(patch, value, 'scanBackgroundColor');

  const frameNumber = clampInteger(value.frameNumber, 1, Number.MAX_SAFE_INTEGER);
  if (frameNumber !== undefined) {
    patch.frameNumber = frameNumber;
  }

  const borderSize = clampInteger(value.borderSize, 5, 25);
  if (borderSize !== undefined) {
    patch.borderSize = borderSize;
  }

  const grainIntensity = clampInteger(value.grainIntensity, 0, 60);
  if (grainIntensity !== undefined) {
    patch.grainIntensity = grainIntensity;
  }

  const outputQuality = clampNumber(value.outputQuality, 0.5, 1);
  if (outputQuality !== undefined) {
    patch.outputQuality = outputQuality;
  }

  if (typeof value.outputFormat === 'string' && OUTPUT_FORMATS.has(value.outputFormat)) {
    patch.outputFormat = value.outputFormat as FilmSettings['outputFormat'];
  }

  if (typeof value.holeType === 'string' && HOLE_TYPES.has(value.holeType)) {
    patch.holeType = value.holeType as FilmSettings['holeType'];
  }

  if (typeof value.processingMode === 'string' && PROCESSING_MODES.has(value.processingMode)) {
    patch.processingMode = value.processingMode as FilmSettings['processingMode'];
  }

  if (typeof value.imagingMode === 'string' && IMAGING_MODES.has(value.imagingMode)) {
    patch.imagingMode = value.imagingMode as FilmSettings['imagingMode'];
  }

  if (typeof value.spectralBackend === 'string' && SPECTRAL_BACKENDS.has(value.spectralBackend)) {
    patch.spectralBackend = value.spectralBackend as FilmSettings['spectralBackend'];
  }

  if (typeof value.frameRenderMode === 'string' && FRAME_RENDER_MODES.has(value.frameRenderMode)) {
    patch.frameRenderMode = value.frameRenderMode as FilmSettings['frameRenderMode'];
  }

  if (typeof value.scanOutputAspect === 'string' && SCAN_OUTPUT_ASPECTS.has(value.scanOutputAspect)) {
    patch.scanOutputAspect = value.scanOutputAspect as FilmSettings['scanOutputAspect'];
  }

  if (value.maxRollFrames === 24 || value.maxRollFrames === 36) {
    patch.maxRollFrames = value.maxRollFrames;
  }

  if (typeof value.edgeRenderMode === 'string' && EDGE_RENDER_MODES.has(value.edgeRenderMode)) {
    patch.edgeRenderMode = value.edgeRenderMode as FilmSettings['edgeRenderMode'];
  }
  if (typeof value.physicalBacking === 'string' && PHYSICAL_BACKINGS.has(value.physicalBacking)) {
    patch.physicalBacking = value.physicalBacking as FilmSettings['physicalBacking'];
  }
  for (const key of ['physicalBodySeed', 'physicalFrameSeed'] as const) {
    const seed = clampInteger(value[key], 0, 0xffffffff);
    if (seed !== undefined) patch[key] = seed;
  }
  const fog = clampNumber(value.physicalFog, 0, 2);
  if (fog !== undefined) patch.physicalFog = fog;
  const leaks = clampNumber(value.physicalLeaks, 0, 1);
  if (leaks !== undefined) patch.physicalLeaks = leaks;
  const straighten = clampNumber(value.physicalStraighten, -5, 5);
  if (straighten !== undefined) patch.physicalStraighten = straighten;
  const aperture = clampNumber(value.physicalAperture, 1, 22);
  if (aperture !== undefined) patch.physicalAperture = aperture;

  return patch;
}

export function mergeSettings(defaults: FilmSettings, patch: unknown, renderPreferenceVersion = CURRENT_RENDER_PREFERENCE_VERSION): FilmSettings {
  const normalized = normalizeSettingsPatch(patch);
  const brandText = normalized.brandText ?? defaults.brandText;
  const imagingMode = normalized.imagingMode ?? defaults.imagingMode;
  const compatibleEdge = imagingMode === 'spectral' && !supportsPhysicalSpectralStock(brandText)
    ? { edgeRenderMode: 'legacy-template' as const } : {};
  return {
    ...defaults,
    ...(renderPreferenceVersion < CURRENT_RENDER_PREFERENCE_VERSION && normalized.edgeRenderMode === undefined
      ? { edgeRenderMode: 'legacy-template' as const }
      : {}),
    ...(renderPreferenceVersion < CURRENT_RENDER_PREFERENCE_VERSION && normalized.imagingMode === undefined
      ? { imagingMode: 'legacy' as const }
      : {}),
    ...normalized,
    ...compatibleEdge,
    filmOverlayUrl: defaults.filmOverlayUrl,
  };
}

export function normalizeOutputMode(value: unknown, fallback: OutputMode): OutputMode {
  return value === 'single' || value === 'strip' ? value : fallback;
}

/** Apply stock defaults only for an explicit stock selection, never on restore. */
export function settingsForFilmStock(settings: FilmSettings, brandText: FilmType): FilmSettings {
  if (brandText === settings.brandText) return settings;
  const preset = FILM_PRESETS[brandText];
  return mergeSettings(settings, {
    brandText,
    textColor: preset.brandColor,
    holeType: preset.holeRounding > 0.4 ? 'rounded' : 'square',
    frameRenderMode: supportsReal135Template(brandText) ? settings.frameRenderMode : 'classic',
    ...(!supportsPhysicalSpectralStock(brandText) ? { edgeRenderMode: defaultEdgeForStock(brandText) } : {}),
  });
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function loadPreferences(
  defaults: FilmSettings,
  fallbackMode: OutputMode
): { settings: FilmSettings; outputMode: OutputMode } {
  try {
    if (!canUseLocalStorage()) {
      return { settings: defaults, outputMode: fallbackMode };
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { settings: defaults, outputMode: fallbackMode };
    }

    const parsed: unknown = JSON.parse(raw);
    const savedSettings = isRecord(parsed) ? parsed.settings : undefined;
    const savedOutputMode = isRecord(parsed) ? parsed.outputMode : undefined;
    const renderPreferenceVersion = isRecord(parsed) && typeof parsed.renderPreferenceVersion === 'number'
      ? parsed.renderPreferenceVersion
      : 0;

    return {
      settings: mergeSettings(defaults, savedSettings, renderPreferenceVersion),
      outputMode: normalizeOutputMode(savedOutputMode, fallbackMode),
    };
  } catch {
    return { settings: defaults, outputMode: fallbackMode };
  }
}

export function savePreferences(settings: FilmSettings, outputMode: OutputMode): void {
  try {
    if (!canUseLocalStorage()) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: normalizeSettingsPatch(settings),
        outputMode: normalizeOutputMode(outputMode, 'single'),
        renderPreferenceVersion: CURRENT_RENDER_PREFERENCE_VERSION,
      })
    );
  } catch {
    // Ignore storage failures from quota, privacy mode, or unavailable APIs.
  }
}
