import { describe, expect, it } from 'vitest';
import { FilmType } from '../types';
import type { FilmSettings } from '../types';
import {
  createArtifactFilename,
  createImageRenderKey,
  createOrderedStripKey,
  createRenderSettingsKey,
  extensionForMime,
  isRenderArtifactCurrent,
} from '../services/renderResult';

const settings: FilmSettings = {
  brandText: FilmType.KODAK_GOLD_200,
  customText: '',
  frameNumber: 1,
  showDate: true,
  dateStr: '2026/07/11',
  borderColor: '#111111',
  holeColor: '#eeeeee',
  textColor: '#eab308',
  borderSize: 16,
  grainIntensity: 12,
  holeType: 'rounded',
  outputFormat: 'image/jpeg',
  outputQuality: 0.92,
  processingMode: 'preview',
  frameRenderMode: 'real135',
  scanOutputAspect: 'native',
  autoCropToFilmRatio: true,
  enableRealisticRebate: true,
  maxRollFrames: 36,
  useFilmOverlayTemplate: true,
  filmOverlayUrl: '/film-overlays/kodak-gold-200.png',
};

describe('render result identity', () => {
  it.each([
    ['format', { outputFormat: 'image/png' as const }],
    ['quality', { outputQuality: 0.8 }],
    ['grain', { grainIntensity: 30 }],
    ['frame number', { frameNumber: 12 }],
    ['render mode', { frameRenderMode: 'classic' as const }],
  ])('marks an artifact stale after a %s change', (_name, patch) => {
    const artifact = {
      url: 'blob:result',
      mime: settings.outputFormat,
      settingsKey: createRenderSettingsKey(settings),
    };

    expect(isRenderArtifactCurrent(artifact, { ...settings, ...patch })).toBe(false);
  });

  it('is independent of object property insertion order', () => {
    const reordered = Object.fromEntries(
      Object.entries(settings).reverse()
    ) as unknown as FilmSettings;

    expect(createRenderSettingsKey(reordered)).toBe(createRenderSettingsKey(settings));
  });

  it('ignores settings that are not read by a renderer', () => {
    expect(createRenderSettingsKey({ ...settings, autoCropToFilmRatio: false }))
      .toBe(createRenderSettingsKey(settings));
  });

  it('includes the configured overlay URL', () => {
    expect(createRenderSettingsKey({ ...settings, filmOverlayUrl: '/other-overlay.png' }))
      .not.toBe(createRenderSettingsKey(settings));
  });

  it('uses artifact MIME for filename extensions', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('image/png')).toBe('png');
    expect(createArtifactFilename('scan.source.webp', 'image/jpeg')).toBe('scan_source.jpg');
    expect(createArtifactFilename('scan.source.webp', 'image/png')).toBe('scan_source.png');
  });

  it('changes a strip key when image order changes', () => {
    expect(createOrderedStripKey(settings, ['a', 'b', 'c']))
      .not.toBe(createOrderedStripKey(settings, ['b', 'a', 'c']));
  });

  it('changes an image key when its EXIF date override changes', () => {
    expect(createImageRenderKey(settings, '2026/07/11'))
      .not.toBe(createImageRenderKey(settings, '2026/07/12'));
  });
});
