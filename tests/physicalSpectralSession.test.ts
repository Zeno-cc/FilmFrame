import { describe, expect, it, vi, afterEach } from 'vitest';

const backend = vi.hoisted(() => ({
  kind: 'cpu' as const,
  render: vi.fn(),
  readRgb: vi.fn(),
  release: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../services/spectral/backend', () => ({
  createSpectralBackend: () => backend,
}));
import { FilmType, type FilmSettings } from '../types';
import { createPhysicalFilmPlan } from '../services/physical135/plan';
import { renderPhysicalSpectralCanvas } from '../services/physical135/spectralAdapter';

const settings = {
  brandText: FilmType.KODAK_GOLD_200,
  frameRenderMode: 'real135',
  imagingMode: 'spectral',
  edgeRenderMode: 'physical135',
  spectralBackend: 'cpu',
  physicalStraighten: 0,
  physicalBodySeed: 1,
  physicalFrameSeed: 1,
  physicalFog: 1,
  physicalLeaks: 0,
  physicalAperture: 5.6,
  physicalBacking: 'open',
} as FilmSettings;

describe('physical spectral session ownership', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('disposes an owned session when preparation fails before rendering', async () => {
    const plan = createPhysicalFilmPlan({ settings, orientation: 'landscape', gateWidth: 36, gateHeight: 24, pxPerMm: 1 });
    vi.stubGlobal('OffscreenCanvas', class {
      width: number;
      height: number;
      constructor(width: number, height: number) { this.width = width; this.height = height; }
      getContext() { return null; }
    });
    const canvas = {
      width: plan.outputWidth,
      height: plan.outputHeight,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
    await expect(renderPhysicalSpectralCanvas(
      canvas,
      plan,
      settings,
      new Float32Array(plan.outputWidth * plan.outputHeight),
      new Float32Array(plan.outputWidth * plan.outputHeight * 3),
      new Float32Array(plan.outputWidth * plan.outputHeight * 3),
      undefined,
      undefined,
      {},
    )).rejects.toThrow('context unavailable');
    expect(backend.dispose).toHaveBeenCalledOnce();
    expect(backend.render).not.toHaveBeenCalled();
  });
});
