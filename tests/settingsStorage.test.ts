import { FilmType } from '../types';
import type { FilmSettings } from '../types';
import {
  loadPreferences,
  mergeSettings,
  normalizeOutputMode,
  normalizeSettingsPatch,
  savePreferences,
} from '../services/settingsStorage';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

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

const patch = normalizeSettingsPatch({
  brandText: FilmType.ILFORD_HP5,
  customText: 'SHOT BY ZENO',
  frameNumber: -10,
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
  autoCropToFilmRatio: false,
  enableRealisticRebate: false,
  maxRollFrames: 24,
  useFilmOverlayTemplate: false,
  filmOverlayUrl: '/should-not-persist.png',
});

assert(patch.brandText === FilmType.ILFORD_HP5, 'valid film type should persist');
assert(patch.frameNumber === 1, 'frameNumber should clamp to at least 1');
assert(patch.borderSize === 25, 'borderSize should clamp to 25');
assert(patch.grainIntensity === 0, 'grainIntensity should clamp to 0');
assert(patch.outputQuality === 1, 'outputQuality should clamp to 1');
assert(patch.maxRollFrames === 24, 'maxRollFrames should accept 24');
assert(patch.textColor === '#fedcba', 'textColor should persist when it is a string');
assert(patch.holeType === 'square', 'holeType should persist when it is valid');
assert(!('filmOverlayUrl' in patch), 'filmOverlayUrl should not persist');

const merged = mergeSettings(defaults, {
  brandText: 'not a film',
  borderSize: 1,
  outputQuality: 0.1,
  maxRollFrames: 99,
  filmOverlayUrl: '/should-not-override.png',
});

assert(merged.brandText === defaults.brandText, 'invalid film type should fall back to defaults');
assert(merged.borderSize === 5, 'merge should use normalized numeric values');
assert(merged.outputQuality === 0.5, 'merge should clamp output quality to 0.5');
assert(merged.maxRollFrames === defaults.maxRollFrames, 'invalid maxRollFrames should fall back to defaults');
assert(merged.filmOverlayUrl === defaults.filmOverlayUrl, 'merge should keep default filmOverlayUrl');

assert(normalizeOutputMode('strip', 'single') === 'strip', 'valid output mode should persist');
assert(normalizeOutputMode('grid', 'single') === 'single', 'invalid output mode should fall back');

const savedValues = new Map<string, string>();
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

savePreferences({ ...defaults, filmOverlayUrl: '/runtime-overlay.png', frameNumber: 42 }, 'strip');

const rawSaved = Array.from(savedValues.values()).join('\n');
assert(rawSaved.includes('"outputMode":"strip"'), 'output mode should be saved');
assert(rawSaved.includes('"frameNumber":42'), 'settings should be saved');
assert(!rawSaved.includes('runtime-overlay'), 'filmOverlayUrl should not be saved');

const loaded = loadPreferences(defaults, 'single');
assert(loaded.outputMode === 'strip', 'output mode should load from storage');
assert(loaded.settings.frameNumber === 42, 'settings should load from storage');
assert(loaded.settings.filmOverlayUrl === defaults.filmOverlayUrl, 'loaded settings should keep default filmOverlayUrl');
