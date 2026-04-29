import { FilmType } from '../types';
import type { FilmSettings, OutputMode } from '../types';

const STORAGE_KEY = 'filmFrame.preferences.v1';

const FILM_TYPES = new Set<string>(Object.values(FilmType));
const OUTPUT_FORMATS = new Set(['image/png', 'image/jpeg']);
const HOLE_TYPES = new Set(['square', 'rounded']);
const PROCESSING_MODES = new Set(['preview', 'high']);
const FRAME_RENDER_MODES = new Set(['classic', 'real135']);
const SCAN_OUTPUT_ASPECTS = new Set(['native', '4:3']);

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

  if (typeof value.frameRenderMode === 'string' && FRAME_RENDER_MODES.has(value.frameRenderMode)) {
    patch.frameRenderMode = value.frameRenderMode as FilmSettings['frameRenderMode'];
  }

  if (typeof value.scanOutputAspect === 'string' && SCAN_OUTPUT_ASPECTS.has(value.scanOutputAspect)) {
    patch.scanOutputAspect = value.scanOutputAspect as FilmSettings['scanOutputAspect'];
  }

  if (value.maxRollFrames === 24 || value.maxRollFrames === 36) {
    patch.maxRollFrames = value.maxRollFrames;
  }

  return patch;
}

export function mergeSettings(defaults: FilmSettings, patch: unknown): FilmSettings {
  return {
    ...defaults,
    ...normalizeSettingsPatch(patch),
    filmOverlayUrl: defaults.filmOverlayUrl,
  };
}

export function normalizeOutputMode(value: unknown, fallback: OutputMode): OutputMode {
  return value === 'single' || value === 'strip' ? value : fallback;
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function loadPreferences(
  defaults: FilmSettings,
  fallbackMode: OutputMode
): { settings: FilmSettings; outputMode: OutputMode } {
  if (!canUseLocalStorage()) {
    return { settings: defaults, outputMode: fallbackMode };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { settings: defaults, outputMode: fallbackMode };
    }

    const parsed: unknown = JSON.parse(raw);
    const savedSettings = isRecord(parsed) ? parsed.settings : undefined;
    const savedOutputMode = isRecord(parsed) ? parsed.outputMode : undefined;

    return {
      settings: mergeSettings(defaults, savedSettings),
      outputMode: normalizeOutputMode(savedOutputMode, fallbackMode),
    };
  } catch {
    return { settings: defaults, outputMode: fallbackMode };
  }
}

export function savePreferences(settings: FilmSettings, outputMode: OutputMode): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: normalizeSettingsPatch(settings),
        outputMode: normalizeOutputMode(outputMode, 'single'),
      })
    );
  } catch {
    // Ignore storage failures from quota, privacy mode, or unavailable APIs.
  }
}
