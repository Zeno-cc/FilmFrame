import { beforeAll, describe, expect, it } from 'vitest';
import { FilmType } from '../types';
import type { FilmSettings } from '../types';
import {
  loadPreferences,
  mergeSettings,
  normalizeOutputMode,
  normalizeSettingsPatch,
  savePreferences,
} from '../services/settingsStorage';

const defaults: FilmSettings = {
  brandText: FilmType.KODAK_GOLD_200,
  customText: '',
  frameNumber: 1,
  showDate: true,
  dateStr: '2026/04/28',
  borderColor: '#111111',
  holeColor: '#222222',
  textColor: '#333333',
  borderSize: 12,
  grainIntensity: 15,
  holeType: 'rounded',
  outputFormat: 'image/jpeg',
  outputQuality: 0.95,
  processingMode: 'preview',
  frameRenderMode: 'real135',
  scanOutputAspect: '4:3',
  autoCropToFilmRatio: true,
  enableRealisticRebate: true,
  maxRollFrames: 36,
  useFilmOverlayTemplate: true,
  filmOverlayUrl: '/film-overlays/kodak-gold-200.png',
};

describe('settings normalization', () => {
  it('persists valid fields, clamps numbers, and excludes the runtime overlay URL', () => {
    const patch = normalizeSettingsPatch({
      brandText: FilmType.ILFORD_HP5,
      customText: 'SHOT BY ZENO',
      frameNumber: -10,
      frameNumberColor: '#12ABEF',
      showDate: false,
      dateStr: '2024/02/03',
      borderColor: '#abcdef',
      holeColor: '#123456',
      textColor: '#fedcba',
      borderSize: 99,
      grainIntensity: -5,
      holeType: 'square',
      outputFormat: 'image/png',
      outputQuality: 5,
      processingMode: 'high',
      frameRenderMode: 'classic',
      scanOutputAspect: 'native',
      scanBackgroundColor: '#ABCDEF',
      autoCropToFilmRatio: false,
      enableRealisticRebate: false,
      maxRollFrames: 24,
      useFilmOverlayTemplate: false,
      filmOverlayUrl: '/should-not-persist.png',
    });

    expect(patch.brandText).toBe(FilmType.ILFORD_HP5);
    expect(patch.frameNumber).toBe(1);
    expect(patch.frameNumberColor).toBe('#12abef');
    expect(patch.borderSize).toBe(25);
    expect(patch.grainIntensity).toBe(0);
    expect(patch.outputQuality).toBe(1);
    expect(patch.maxRollFrames).toBe(24);
    expect(patch.textColor).toBe('#fedcba');
    expect(patch.holeType).toBe('square');
    expect(patch.scanBackgroundColor).toBe('#abcdef');
    expect('filmOverlayUrl' in patch).toBe(false);
  });

  it('merges normalized values over defaults', () => {
    const merged = mergeSettings(defaults, {
      brandText: 'not a film',
      borderSize: 1,
      outputQuality: 0.1,
      maxRollFrames: 99,
      frameNumberColor: 'amber',
      scanBackgroundColor: 'blue',
      filmOverlayUrl: '/should-not-override.png',
    });

    expect(merged.brandText).toBe(defaults.brandText);
    expect(merged.borderSize).toBe(5);
    expect(merged.outputQuality).toBe(0.5);
    expect(merged.maxRollFrames).toBe(defaults.maxRollFrames);
    expect(merged.frameNumberColor).toBe(defaults.frameNumberColor);
    expect(merged.scanBackgroundColor).toBe(defaults.scanBackgroundColor);
    expect(merged.filmOverlayUrl).toBe(defaults.filmOverlayUrl);
  });

  it('normalizes output modes', () => {
    expect(normalizeOutputMode('strip', 'single')).toBe('strip');
    expect(normalizeOutputMode('grid', 'single')).toBe('single');
  });
});

describe('settings storage', () => {
  const savedValues = new Map<string, string>();

  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => savedValues.get(key) ?? null,
        setItem: (key: string, value: string) => {
          savedValues.set(key, value);
        },
      },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    });
    savePreferences({
      ...defaults,
      filmOverlayUrl: '/runtime-overlay.png',
      frameNumber: 42,
      frameNumberColor: '#44cc88',
      scanBackgroundColor: '#aabbcc',
    }, 'strip');
  });

  it('saves supported settings and excludes the runtime overlay URL', () => {
    const rawSaved = Array.from(savedValues.values()).join('\n');
    expect(rawSaved).toContain('"outputMode":"strip"');
    expect(rawSaved).toContain('"frameNumber":42');
    expect(rawSaved).toContain('"frameNumberColor":"#44cc88"');
    expect(rawSaved).toContain('"scanBackgroundColor":"#aabbcc"');
    expect(rawSaved).not.toContain('runtime-overlay');
  });

  it('loads saved preferences while retaining the default overlay URL', () => {
    const loaded = loadPreferences(defaults, 'single');
    expect(loaded.outputMode).toBe('strip');
    expect(loaded.settings.frameNumber).toBe(42);
    expect(loaded.settings.frameNumberColor).toBe('#44cc88');
    expect(loaded.settings.scanBackgroundColor).toBe('#aabbcc');
    expect(loaded.settings.filmOverlayUrl).toBe(defaults.filmOverlayUrl);
  });
});
