import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilmType } from '../types';
import type { FilmSettings, ImageItem } from '../types';

const engine = vi.hoisted(() => ({
  processImage: vi.fn(),
  generateFilmStrip: vi.fn(),
}));

vi.mock('../services/filmEngine', () => engine);

import { generateFilmStrip, processImage } from '../services/filmWorkerClient';

const settings: FilmSettings = {
  brandText: FilmType.ILFORD_HP5,
  customText: '',
  frameNumber: 1,
  showDate: false,
  dateStr: '2026/07/12',
  borderColor: '#111111',
  holeColor: '#eeeeee',
  textColor: '#eab308',
  borderSize: 12,
  grainIntensity: 15,
  holeType: 'square',
  outputFormat: 'image/jpeg',
  outputQuality: 0.95,
  processingMode: 'preview',
  frameRenderMode: 'classic',
  scanOutputAspect: 'native',
  autoCropToFilmRatio: true,
  enableRealisticRebate: true,
  maxRollFrames: 36,
  useFilmOverlayTemplate: false,
};

const image: ImageItem = {
  id: 'one',
  file: {} as File,
  previewUrl: 'blob:source',
  included: true,
  sourceWidth: 1200,
  sourceHeight: 800,
};

afterEach(() => {
  engine.processImage.mockReset();
  engine.generateFilmStrip.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('main-thread render output metadata', () => {
  it('uses Blob metadata returned by the canvas export without refetching its object URL', async () => {
    const output = { url: 'blob:image-result', byteSize: 321 };
    engine.processImage.mockResolvedValue(output);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(processImage('blob:source', settings)).resolves.toEqual(output);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes the render budget to the main-thread fallback', async () => {
    engine.processImage.mockResolvedValue({ url: 'blob:image-result', byteSize: 6 });
    const renderBudgetLimits = { maxPixels: 32_000_000 };

    await processImage(
      'blob:source',
      settings,
      undefined,
      undefined,
      undefined,
      renderBudgetLimits,
    );

    expect(engine.processImage).toHaveBeenCalledWith(
      'blob:source',
      settings,
      undefined,
      undefined,
      renderBudgetLimits,
    );
  });

  it('returns strip Blob metadata without refetching its object URL', async () => {
    const output = { url: 'blob:strip-result', byteSize: 654 };
    engine.generateFilmStrip.mockResolvedValue(output);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(generateFilmStrip([image], settings)).resolves.toEqual(output);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
