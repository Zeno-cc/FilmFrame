import { beforeAll, describe, expect, it } from 'vitest';
import { FILM_PRESETS, FilmType } from '../types';
import { defaultEdgeForStock, supportsPhysicalSpectralStock } from '../services/physical135/capability';
import { hasPhysicalEdgeLayout } from '../services/physical135/edgeRegistry';
import type { FilmSettings } from '../types';
import {
  loadPreferences,
  mergeSettings,
  normalizeOutputMode,
  normalizeSettingsPatch,
  normalizeSpectralRenderMode,
  savePreferences,
  settingsForFilmStock,
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
      real135SprocketColor: '#22CC88',
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
      imagingMode: 'spectral',
      spectralBackend: 'cpu',
      frameRenderMode: 'classic',
      scanOutputAspect: 'native',
      scanBackgroundColor: '#ABCDEF',
      autoCropToFilmRatio: false,
      enableRealisticRebate: false,
      maxRollFrames: 24,
      useFilmOverlayTemplate: false,
      filmOverlayUrl: '/should-not-persist.png',
      edgeRenderMode: 'physical135',
      physicalBacking: 'black',
      physicalBodySeed: 0xdeadbeef,
      physicalFrameSeed: 0xffffffff,
      physicalFog: 3,
      physicalLeaks: -1,
      physicalStraighten: 8,
      physicalAperture: 0.5,
    });

    expect(patch.brandText).toBe(FilmType.ILFORD_HP5);
    expect(patch.frameNumber).toBe(1);
    expect(patch.frameNumberColor).toBe('#12abef');
    expect(patch.real135SprocketColor).toBe('#22cc88');
    expect(patch.borderSize).toBe(25);
    expect(patch.grainIntensity).toBe(0);
    expect(patch.outputQuality).toBe(1);
    expect(patch.maxRollFrames).toBe(24);
    expect(patch.imagingMode).toBe('spectral');
    expect(patch.spectralBackend).toBe('cpu');
    expect(patch.textColor).toBe('#fedcba');
    expect(patch.holeType).toBe('square');
    expect(patch.scanBackgroundColor).toBe('#abcdef');
    expect('filmOverlayUrl' in patch).toBe(false);
    expect(patch.edgeRenderMode).toBe('physical135');
    expect(patch.physicalBacking).toBe('black');
    expect(patch.physicalBodySeed).toBe(0xdeadbeef);
    expect(patch.physicalFrameSeed).toBe(0xffffffff);
    expect(patch.physicalFog).toBe(2);
    expect(patch.physicalLeaks).toBe(0);
    expect(patch.physicalStraighten).toBe(5);
    expect(patch.physicalAperture).toBe(1);
  });

  it('merges normalized values over defaults', () => {
    const merged = mergeSettings(defaults, {
      brandText: 'not a film',
      borderSize: 1,
      outputQuality: 0.1,
      maxRollFrames: 99,
      frameNumberColor: 'amber',
      real135SprocketColor: 'black',
      scanBackgroundColor: 'blue',
      filmOverlayUrl: '/should-not-override.png',
    });

    expect(merged.brandText).toBe(defaults.brandText);
    expect(merged.borderSize).toBe(5);
    expect(merged.outputQuality).toBe(0.5);
    expect(merged.maxRollFrames).toBe(defaults.maxRollFrames);
    expect(merged.frameNumberColor).toBe(defaults.frameNumberColor);
    expect(merged.real135SprocketColor).toBe(defaults.real135SprocketColor);
    expect(merged.scanBackgroundColor).toBe(defaults.scanBackgroundColor);
    expect(merged.filmOverlayUrl).toBe(defaults.filmOverlayUrl);
  });

  it('preserves an explicit reset for the original sprocket color', () => {
    const reset = normalizeSettingsPatch({ real135SprocketColor: undefined });
    expect(reset).toEqual({ real135SprocketColor: undefined });
    expect(Object.hasOwn(reset, 'real135SprocketColor')).toBe(true);
    expect(mergeSettings(
      { ...defaults, real135SprocketColor: '#cc3344' },
      { real135SprocketColor: undefined },
    ).real135SprocketColor).toBeUndefined();
  });

  it('clears both optional color overrides when restoring an uncolored recipe', () => {
    const reset = mergeSettings({
      ...defaults,
      frameNumberColor: '#112233',
      real135SprocketColor: '#445566',
    }, {
      frameNumberColor: undefined,
      real135SprocketColor: undefined,
      ...normalizeSettingsPatch(defaults),
    }, 0);

    expect(reset.frameNumberColor).toBeUndefined();
    expect(reset.real135SprocketColor).toBeUndefined();
    expect(reset.textColor).toBe(defaults.textColor);
    expect(reset.holeType).toBe(defaults.holeType);
  });

  it('applies stock defaults only on explicit selection and preserves color overrides', () => {
    const custom = {
      ...defaults,
      textColor: '#aabbcc',
      holeType: 'square' as const,
      frameNumberColor: '#112233',
      real135SprocketColor: '#445566',
      imagingMode: 'spectral' as const,
      edgeRenderMode: 'physical135' as const,
    };
    expect(settingsForFilmStock(custom, custom.brandText)).toBe(custom);
    expect(mergeSettings(defaults, normalizeSettingsPatch(custom))).toMatchObject(custom);

    const selected = settingsForFilmStock(custom, FilmType.ILFORD_HP5);
    const preset = FILM_PRESETS[FilmType.ILFORD_HP5];
    expect(selected).toMatchObject({
      brandText: FilmType.ILFORD_HP5,
      textColor: preset.brandColor,
      holeType: preset.holeRounding > 0.4 ? 'rounded' : 'square',
      frameNumberColor: '#112233',
      real135SprocketColor: '#445566',
      edgeRenderMode: 'legacy-template',
      imagingMode: 'spectral',
    });
  });

  it('normalizes output modes', () => {
    expect(normalizeOutputMode('strip', 'single')).toBe('strip');
    expect(normalizeOutputMode('grid', 'single')).toBe('single');
  });

  it('preserves legacy edge choices while migrating new sessions to physical 135', () => {
    expect(mergeSettings({ ...defaults, edgeRenderMode: 'physical135' }, {}, 0).edgeRenderMode).toBe('legacy-template');
    expect(mergeSettings({ ...defaults, imagingMode: 'spectral' }, {}, 0).imagingMode).toBe('legacy');
    expect(mergeSettings({ ...defaults, imagingMode: 'legacy' }, { imagingMode: 'spectral' }, 0).imagingMode).toBe('spectral');
    expect(mergeSettings({ ...defaults, edgeRenderMode: 'physical135' }, { edgeRenderMode: 'legacy-template' }, 1).edgeRenderMode).toBe('legacy-template');
    expect(mergeSettings({ ...defaults, edgeRenderMode: 'legacy-template' }, { edgeRenderMode: 'physical135' }, 1).edgeRenderMode).toBe('physical135');
    expect(defaultEdgeForStock(FilmType.KODAK_PORTRA_400)).toBe('physical135');
    expect(defaultEdgeForStock(FilmType.FUJI_PRO_400H)).toBe('physical135');
    expect(supportsPhysicalSpectralStock(FilmType.FUJI_PRO_400H)).toBe(true);
    expect(mergeSettings({ ...defaults, imagingMode: 'spectral', edgeRenderMode: 'physical135' }, { brandText: FilmType.FUJI_PROVIA_100F }).edgeRenderMode).toBe('legacy-template');
    expect(mergeSettings({ ...defaults, imagingMode: 'spectral', edgeRenderMode: 'physical135' }, { brandText: FilmType.CINESTILL_800T }).edgeRenderMode).toBe('legacy-template');
    expect(supportsPhysicalSpectralStock(FilmType.CINESTILL_800T)).toBe(false);
    expect(mergeSettings({ ...defaults, imagingMode: 'legacy', edgeRenderMode: 'physical135' }, { brandText: FilmType.FUJI_PROVIA_100F }).edgeRenderMode).toBe('physical135');
    expect(mergeSettings({ ...defaults, imagingMode: 'spectral', edgeRenderMode: 'physical135' }, { brandText: FilmType.KODAK_PORTRA_800_PUSH2 }).edgeRenderMode).toBe('physical135');
  });
});

describe('spectral render mode normalization', () => {
  it('migrates classic framing on spectral stocks to template 135 output', () => {
    const migrated = normalizeSpectralRenderMode({
      ...defaults,
      brandText: FilmType.KODAK_PORTRA_400,
      frameRenderMode: 'classic',
      edgeRenderMode: 'legacy-template',
      imagingMode: 'spectral',
    });

    expect(migrated.migratedClassic).toBe(true);
    expect(migrated.settings).toMatchObject({
      brandText: FilmType.KODAK_PORTRA_400,
      frameRenderMode: 'real135',
      edgeRenderMode: 'legacy-template',
      imagingMode: 'legacy',
    });
  });

  it('reports physical edge availability for every stock without an edge layout', () => {
    for (const stock of [
      FilmType.FUJI_PROVIA_100F,
      FilmType.FUJI_VELVIA_100,
      FilmType.KODAK_KODACHROME_64,
      FilmType.FUJI_ACROS_II,
    ]) {
      expect(hasPhysicalEdgeLayout(stock)).toBe(false);
      expect(normalizeSpectralRenderMode({
        ...defaults,
        brandText: stock,
        frameRenderMode: 'real135',
        edgeRenderMode: 'physical135',
        imagingMode: 'legacy',
      }).settings.edgeRenderMode).toBe('legacy-template');
    }
    expect(hasPhysicalEdgeLayout(FilmType.KODAK_PORTRA_400)).toBe(true);
  });

  it('keeps real 135 framing on spectral stocks', () => {
    const settings = {
      ...defaults,
      brandText: FilmType.KODAK_PORTRA_400,
      frameRenderMode: 'real135',
      edgeRenderMode: 'physical135',
      imagingMode: 'spectral',
    } as const;
    expect(normalizeSpectralRenderMode(settings)).toEqual({
      settings,
      migratedClassic: false,
      migratedUnsupportedEdge: false,
    });
  });

  it('keeps classic framing on non-spectral stocks', () => {
    const settings = {
      ...defaults,
      brandText: FilmType.KODAK_COLORPLUS_200,
      frameRenderMode: 'classic',
      edgeRenderMode: 'legacy-template',
      imagingMode: 'legacy',
    } as const;
    expect(normalizeSpectralRenderMode(settings)).toEqual({
      settings,
      migratedClassic: false,
      migratedUnsupportedEdge: false,
    });
  });

  it('keeps real 135 framing on non-spectral stocks', () => {
    const settings = {
      ...defaults,
      brandText: FilmType.KODAK_COLORPLUS_200,
      frameRenderMode: 'real135',
      edgeRenderMode: 'legacy-template',
      imagingMode: 'legacy',
    } as const;
    expect(normalizeSpectralRenderMode(settings)).toEqual({
      settings,
      migratedClassic: false,
      migratedUnsupportedEdge: false,
    });
  });

  it('clears physical edge settings that classic framing cannot express', () => {
    const normalized = normalizeSpectralRenderMode({
      ...defaults,
      brandText: FilmType.KODAK_COLORPLUS_200,
      frameRenderMode: 'classic',
      edgeRenderMode: 'physical135',
      imagingMode: 'legacy',
    });
    expect(normalized.migratedClassic).toBe(false);
    expect(normalized.settings.frameRenderMode).toBe('classic');
    expect(normalized.settings.edgeRenderMode).toBe('legacy-template');
  });

  it('clears classic framing when switching from a non-spectral stock to a spectral stock', () => {
    const selected = settingsForFilmStock({
      ...defaults,
      brandText: FilmType.KODAK_COLORPLUS_200,
      frameRenderMode: 'classic',
      edgeRenderMode: 'legacy-template',
      imagingMode: 'legacy',
    }, FilmType.KODAK_PORTRA_400);

    expect(selected).toMatchObject({
      brandText: FilmType.KODAK_PORTRA_400,
      frameRenderMode: 'real135',
      edgeRenderMode: 'legacy-template',
      imagingMode: 'legacy',
    });
  });

  it('preserves real 135 framing when switching from spectral to non-spectral', () => {
    const selected = settingsForFilmStock({
      ...defaults,
      brandText: FilmType.KODAK_GOLD_200,
      frameRenderMode: 'real135',
      edgeRenderMode: 'physical135',
      imagingMode: 'spectral',
    }, FilmType.KODAK_COLORPLUS_200);

    expect(selected).toMatchObject({
      brandText: FilmType.KODAK_COLORPLUS_200,
      frameRenderMode: 'real135',
      edgeRenderMode: 'legacy-template',
    });
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
      real135SprocketColor: '#112233',
      scanBackgroundColor: '#aabbcc',
    }, 'strip');
  });

  it('saves supported settings and excludes the runtime overlay URL', () => {
    const rawSaved = Array.from(savedValues.values()).join('\n');
    expect(rawSaved).toContain('"outputMode":"strip"');
    expect(rawSaved).toContain('"frameNumber":42');
    expect(rawSaved).toContain('"frameNumberColor":"#44cc88"');
    expect(rawSaved).toContain('"real135SprocketColor":"#112233"');
    expect(rawSaved).toContain('"scanBackgroundColor":"#aabbcc"');
    expect(rawSaved).not.toContain('runtime-overlay');
  });

  it('loads saved preferences while retaining the default overlay URL', () => {
    const loaded = loadPreferences(defaults, 'single');
    expect(loaded.outputMode).toBe('strip');
    expect(loaded.settings.frameNumber).toBe(42);
    expect(loaded.settings.frameNumberColor).toBe('#44cc88');
    expect(loaded.settings.real135SprocketColor).toBe('#112233');
    expect(loaded.settings.scanBackgroundColor).toBe('#aabbcc');
    expect(loaded.settings.filmOverlayUrl).toBe(defaults.filmOverlayUrl);
  });

  it('keeps custom stock appearance after saving and restoring preferences', () => {
    const original = savedValues.get('filmFrame.preferences.v1');
    try {
      const custom = { ...defaults, textColor: '#abcdef', holeType: 'square' as const };
      savePreferences(custom, 'single');
      expect(loadPreferences(defaults, 'strip')).toMatchObject({
        settings: custom,
        outputMode: 'single',
      });
    } finally {
      if (original === undefined) savedValues.delete('filmFrame.preferences.v1');
      else savedValues.set('filmFrame.preferences.v1', original);
    }
  });

  it('migrates a legacy spectral classic preference once', () => {
    const original = savedValues.get('filmFrame.preferences.v1');
    try {
      savedValues.set('filmFrame.preferences.v1', JSON.stringify({
        settings: {
          brandText: FilmType.KODAK_PORTRA_400,
          frameRenderMode: 'classic',
          edgeRenderMode: 'physical135',
          imagingMode: 'spectral',
        },
        outputMode: 'single',
      }));

      const loaded = loadPreferences(defaults, 'single');
      expect(loaded.migratedClassicEdge).toBe(true);
      expect(loaded.settings).toMatchObject({
        brandText: FilmType.KODAK_PORTRA_400,
        frameRenderMode: 'real135',
        edgeRenderMode: 'legacy-template',
        imagingMode: 'legacy',
      });

      savePreferences(loaded.settings, loaded.outputMode);
      expect(loadPreferences(defaults, 'single').migratedClassicEdge).toBe(false);
    } finally {
      if (original === undefined) savedValues.delete('filmFrame.preferences.v1');
      else savedValues.set('filmFrame.preferences.v1', original);
    }
  });

  it('keeps a legacy non-spectral classic preference unchanged', () => {
    const original = savedValues.get('filmFrame.preferences.v1');
    try {
      savedValues.set('filmFrame.preferences.v1', JSON.stringify({
        settings: {
          brandText: FilmType.KODAK_COLORPLUS_200,
          frameRenderMode: 'classic',
          edgeRenderMode: 'legacy-template',
          imagingMode: 'legacy',
        },
        outputMode: 'single',
      }));

      const loaded = loadPreferences(defaults, 'single');
      expect(loaded.migratedClassicEdge).toBe(false);
      expect(loaded.settings).toMatchObject({
        brandText: FilmType.KODAK_COLORPLUS_200,
        frameRenderMode: 'classic',
        edgeRenderMode: 'legacy-template',
        imagingMode: 'legacy',
      });
    } finally {
      if (original === undefined) savedValues.delete('filmFrame.preferences.v1');
      else savedValues.set('filmFrame.preferences.v1', original);
    }
  });

  it('migrates an unsupported physical edge to the template edge', () => {
    const original = savedValues.get('filmFrame.preferences.v1');
    try {
      savedValues.set('filmFrame.preferences.v1', JSON.stringify({
        settings: {
          brandText: FilmType.FUJI_VELVIA_100,
          frameRenderMode: 'real135',
          edgeRenderMode: 'physical135',
          imagingMode: 'legacy',
        },
        outputMode: 'single',
      }));

      const loaded = loadPreferences(defaults, 'single');
      expect(loaded.migratedUnsupportedEdge).toBe(true);
      expect(loaded.settings).toMatchObject({
        brandText: FilmType.FUJI_VELVIA_100,
        edgeRenderMode: 'legacy-template',
      });

      savePreferences(loaded.settings, loaded.outputMode);
      expect(loadPreferences(defaults, 'single').migratedUnsupportedEdge).toBe(false);

      savedValues.set('filmFrame.preferences.v1', JSON.stringify({
        settings: {
          brandText: FilmType.KODAK_PORTRA_400,
          frameRenderMode: 'real135',
          edgeRenderMode: 'physical135',
          imagingMode: 'spectral',
        },
        outputMode: 'single',
      }));
      const supported = loadPreferences(defaults, 'single');
      expect(supported.migratedUnsupportedEdge).toBe(false);
      expect(supported.settings.edgeRenderMode).toBe('physical135');
    } finally {
      if (original === undefined) savedValues.delete('filmFrame.preferences.v1');
      else savedValues.set('filmFrame.preferences.v1', original);
    }
  });

  it('falls back safely when accessing localStorage itself throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage is blocked', 'SecurityError'); },
    });
    try {
      expect(loadPreferences(defaults, 'strip')).toEqual({
        settings: defaults,
        outputMode: 'strip',
        migratedClassicEdge: false,
        migratedUnsupportedEdge: false,
      });
      expect(() => savePreferences(defaults, 'single')).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', descriptor);
    }
  });
});
