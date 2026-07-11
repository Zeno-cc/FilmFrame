import type { FilmSettings, OutputFormat } from '../types';

export interface RenderArtifact {
  url: string;
  mime: OutputFormat;
  settingsKey: string;
}

export function createRenderSettingsKey(settings: FilmSettings): string {
  return JSON.stringify([
    settings.brandText,
    settings.customText,
    settings.frameNumber,
    settings.showDate,
    settings.dateStr,
    settings.borderColor,
    settings.holeColor,
    settings.textColor,
    settings.borderSize,
    settings.grainIntensity,
    settings.holeType,
    settings.outputFormat,
    settings.outputQuality,
    settings.processingMode,
    settings.frameRenderMode,
    settings.scanOutputAspect,
    settings.enableRealisticRebate,
    settings.maxRollFrames,
    settings.useFilmOverlayTemplate,
    settings.filmOverlayUrl,
  ]);
}

export function createOrderedStripKey(
  settings: FilmSettings,
  orderedImageIds: readonly string[]
): string {
  return JSON.stringify([
    createRenderSettingsKey(settings),
    orderedImageIds,
  ]);
}

export function createImageRenderKey(
  settings: FilmSettings,
  dateOverride?: string,
): string {
  return JSON.stringify([
    createRenderSettingsKey(settings),
    dateOverride ?? '',
  ]);
}

export function isRenderArtifactCurrent(
  artifact: RenderArtifact | null | undefined,
  settings: FilmSettings
): boolean {
  return Boolean(
    artifact &&
    artifact.mime === settings.outputFormat &&
    artifact.settingsKey === createRenderSettingsKey(settings)
  );
}

export function extensionForMime(mime: OutputFormat): 'jpg' | 'png' {
  return mime === 'image/jpeg' ? 'jpg' : 'png';
}

export function createArtifactFilename(filename: string, mime: OutputFormat): string {
  const baseName = filename.replace(/\.[^/.]+$/, '');
  const safeBaseName = baseName.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_') || 'image';
  return `${safeBaseName}.${extensionForMime(mime)}`;
}
