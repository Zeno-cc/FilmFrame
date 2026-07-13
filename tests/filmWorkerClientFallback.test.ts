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
  it('revokes an unreturned image URL when reading its Blob fails', async () => {
    engine.processImage.mockResolvedValue('blob:image-result');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('read failed')));

    await expect(processImage('blob:source', settings)).rejects.toThrow('read failed');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-result');
  });

  it('revokes an unreturned strip URL when its response body cannot be read', async () => {
    engine.generateFilmStrip.mockResolvedValue('blob:strip-result');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockRejectedValue(new Error('body failed')),
    }));

    await expect(generateFilmStrip([image], settings)).rejects.toThrow('body failed');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:strip-result');
  });
});
