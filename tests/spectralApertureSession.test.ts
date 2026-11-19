import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  backend: {
    kind: 'cpu' as const,
    render: vi.fn(),
    readRgb: vi.fn(),
    release: vi.fn(),
    dispose: vi.fn(),
  },
  createSpectralBackend: vi.fn(),
  createPortraPipeline: vi.fn(),
  loadSpectralStockResource: vi.fn(),
}));

vi.mock('../services/spectral/backend', () => ({ createSpectralBackend: mocks.createSpectralBackend }));
vi.mock('../services/spectral/portraPipeline', () => ({ createPortraPipeline: mocks.createPortraPipeline }));
vi.mock('../services/spectral/stockResourceLoader', () => ({ loadSpectralStockResource: mocks.loadSpectralStockResource }));
vi.mock('../services/spectral/inputColor', () => ({
  decodeSrgbChannel: (value: number) => value,
  srgbByteToLinearProPhoto: (_setup: unknown, r: number, g: number, b: number) => [r / 255, g / 255, b / 255],
}));

import { FilmType, type FilmSettings } from '../types';
import {
  applySpectralToAperture,
  createSpectralApertureSession,
  supportsSpectral,
} from '../services/spectral/canvasAdapter';
import { assertSpectralStripSupported, spectralStripSupported } from '../services/spectral/scope';

const APERTURE_W = 4;
const APERTURE_H = 3;

const spectralSettings: FilmSettings = {
  brandText: FilmType.KODAK_PORTRA_400,
  frameRenderMode: 'real135',
  edgeRenderMode: 'legacy-template',
  useFilmOverlayTemplate: true,
  imagingMode: 'spectral',
  spectralBackend: 'cpu',
} as FilmSettings;

type ApertureContext = Parameters<typeof applySpectralToAperture>[0];

function createContext() {
  const getImageData = vi.fn((_x: number, _y: number, width: number, height: number) => ({
    data: new Uint8ClampedArray(width * height * 4),
  }));
  const putImageData = vi.fn();
  return {
    ctx: { getImageData, putImageData } as unknown as ApertureContext,
    getImageData,
    putImageData,
  };
}

beforeEach(() => {
  mocks.backend.render.mockReset().mockResolvedValue({ backend: 'cpu', frame: null });
  mocks.backend.readRgb.mockReset().mockReturnValue(new Float32Array(APERTURE_W * APERTURE_H * 3));
  mocks.backend.release.mockReset();
  mocks.backend.dispose.mockReset();
  mocks.createSpectralBackend.mockReset().mockReturnValue(mocks.backend);
  mocks.createPortraPipeline.mockReset().mockReturnValue({ setup: { arrays: {} } });
  mocks.loadSpectralStockResource.mockReset().mockResolvedValue({ id: 'fake-portra' });
  vi.stubGlobal('OffscreenCanvas', class {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('spectralStripSupported', () => {
  const base = { brandText: FilmType.KODAK_PORTRA_400, frameRenderMode: 'real135' } as const;

  it('supports spectral physical strips', () => {
    expect(spectralStripSupported({ ...base, imagingMode: 'spectral', edgeRenderMode: 'physical135', useFilmOverlayTemplate: false })).toBe(true);
  });

  it('supports spectral template strips with a spectral stock and the template path enabled', () => {
    expect(spectralStripSupported({ ...base, imagingMode: 'spectral', edgeRenderMode: 'legacy-template', useFilmOverlayTemplate: true })).toBe(true);
  });

  it('rejects template strips for a stock without a spectral resource', () => {
    expect(spectralStripSupported({ ...base, brandText: FilmType.FUJI_SUPERIA, imagingMode: 'spectral', edgeRenderMode: 'legacy-template', useFilmOverlayTemplate: true })).toBe(false);
  });

  it('rejects template strips when the overlay template path is disabled', () => {
    expect(spectralStripSupported({ ...base, imagingMode: 'spectral', edgeRenderMode: 'legacy-template', useFilmOverlayTemplate: false })).toBe(false);
  });

  it('rejects non-135 render modes', () => {
    expect(spectralStripSupported({ ...base, frameRenderMode: 'classic', imagingMode: 'spectral', edgeRenderMode: 'legacy-template', useFilmOverlayTemplate: true })).toBe(false);
  });

  it('never marks legacy imaging as spectral', () => {
    expect(spectralStripSupported({ ...base, imagingMode: 'legacy', edgeRenderMode: 'legacy-template', useFilmOverlayTemplate: true })).toBe(false);
  });

  it('does not throw for the standard spectral template strip', () => {
    expect(() => assertSpectralStripSupported({ ...base, imagingMode: 'spectral', edgeRenderMode: 'legacy-template', useFilmOverlayTemplate: true })).not.toThrow();
  });

  it('fails loudly for a disabled template path instead of degrading silently', () => {
    expect(() => assertSpectralStripSupported({ ...base, imagingMode: 'spectral', edgeRenderMode: 'legacy-template', useFilmOverlayTemplate: false }))
      .toThrow('Spectral template strips need the 135 overlay template');
  });
});

describe('spectral aperture session', () => {
  it('creates one backend and reuses it across frames', async () => {
    const session = await createSpectralApertureSession(spectralSettings, APERTURE_W, APERTURE_H);
    expect(session).not.toBeNull();
    const { ctx, getImageData, putImageData } = createContext();

    await session!.process(ctx, 5, 6, APERTURE_W, APERTURE_H);
    await session!.process(ctx, 5, 6, APERTURE_W, APERTURE_H);

    expect(mocks.createSpectralBackend).toHaveBeenCalledTimes(1);
    expect(mocks.backend.render).toHaveBeenCalledTimes(2);
    expect(mocks.backend.release).toHaveBeenCalledTimes(2);
    expect(getImageData).toHaveBeenCalledWith(5, 6, APERTURE_W, APERTURE_H);
    expect(putImageData).toHaveBeenCalledTimes(2);
    session!.dispose();
    expect(mocks.backend.dispose).toHaveBeenCalledTimes(1);
  });

  it('rejects a mismatched frame size instead of reusing the wrong backend', async () => {
    const session = await createSpectralApertureSession(spectralSettings, APERTURE_W, APERTURE_H);
    await expect(session!.process(createContext().ctx, 0, 0, APERTURE_W + 1, APERTURE_H))
      .rejects.toThrow('fixed at 4x3');
    expect(mocks.backend.render).not.toHaveBeenCalled();
    session!.dispose();
  });

  it('disposes once and rejects work after disposal', async () => {
    const session = await createSpectralApertureSession(spectralSettings, APERTURE_W, APERTURE_H);
    session!.dispose();
    session!.dispose();
    expect(mocks.backend.dispose).toHaveBeenCalledTimes(1);
    await expect(session!.process(createContext().ctx, 0, 0, APERTURE_W, APERTURE_H))
      .rejects.toThrow('disposed');
  });

  it('returns null when the settings are not spectral', async () => {
    expect(await createSpectralApertureSession({ ...spectralSettings, imagingMode: 'legacy' }, APERTURE_W, APERTURE_H)).toBeNull();
    expect(supportsSpectral(spectralSettings)).toBe(true);
  });

  it('owns and disposes a single backend through the applySpectralToAperture wrapper', async () => {
    const { ctx } = createContext();
    await applySpectralToAperture(ctx, 1, 2, APERTURE_W, APERTURE_H, spectralSettings);
    expect(mocks.createSpectralBackend).toHaveBeenCalledTimes(1);
    expect(mocks.backend.render).toHaveBeenCalledTimes(1);
    expect(mocks.backend.dispose).toHaveBeenCalledTimes(1);
  });
});
