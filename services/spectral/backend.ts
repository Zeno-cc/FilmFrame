import { renderPortraStages, validateSpectralRenderInput, type PortraPipeline } from './portraPipeline';
import { renderPositiveStages, type PositivePipeline } from './positive';
import type { MonochromePipeline } from './monochrome';
import { renderMonochromeStages } from './monochrome';
import type { CineStillPipeline } from './cineStill';
import { renderCineStillStages } from './cineStill';
import { blendFilmPresence } from '../physical135/density';
import { developFilm, exposeFilm } from './film';
import { developPaper, exposePaper } from './print';
import { scanPaper } from './scan';
import type { RgbImage, RenderLimits } from './types';
import type { Vec3 } from './math';
import { WebGlSpectralError } from './webgl/device';
import { WebGlSpectralRenderer, type GpuFrame, type GpuRenderTimings } from './webgl/renderer';

export type SpectralBackendKind = 'webgl2' | 'cpu';

export interface SpectralFrameHandle {
  readonly backend: SpectralBackendKind;
  readonly frame: GpuFrame | null;
}

export interface SpectralBackendDiagnostics {
  readonly info: WebGlSpectralRenderer['info'];
  readonly measurements: WebGlSpectralRenderer['measurements'];
  render(image: RgbImage, filmPresence?: Float32Array, holeCmy?: Vec3): Promise<{ frame: SpectralFrameHandle; timings: GpuRenderTimings }>;
}

export interface SpectralBackend {
  readonly kind: SpectralBackendKind;
  readonly diagnostics?: SpectralBackendDiagnostics;
  render(image: RgbImage, filmPresence?: Float32Array, holeCmy?: Vec3): Promise<SpectralFrameHandle>;
  readRgb(frame: SpectralFrameHandle): Float32Array;
  release(frame: SpectralFrameHandle): void;
  dispose(): void;
}

class CpuSpectralBackend implements SpectralBackend {
  readonly kind = 'cpu' as const;
  private disposed = false;
  private frames = new Set<SpectralFrameHandle>();

  constructor(private readonly pipeline: PortraPipeline | PositivePipeline | MonochromePipeline | CineStillPipeline, private readonly limits: RenderLimits) {}

  async render(image: RgbImage, filmPresence?: Float32Array, holeCmy?: Vec3): Promise<SpectralFrameHandle> {
    if (this.disposed) throw new Error('Spectral CPU backend is disposed');
    let output: Float32Array;
    if ('filmKind' in this.pipeline) {
      if (this.pipeline.filmKind === 'cineStill') {
        if (filmPresence || holeCmy) throw new Error('CineStill physical perforation development is not enabled');
        output = renderCineStillStages(image, this.pipeline, this.limits).printRgb;
      } else {
        if (filmPresence || holeCmy) throw new Error('Monochrome physical perforation development is not enabled');
        output = renderMonochromeStages(image, this.pipeline, this.limits).printRgb;
      }
    } else if ('densityMax' in this.pipeline) {
      if (filmPresence || holeCmy) throw new Error('Positive physical perforation development is not validated');
      output = renderPositiveStages(image, this.pipeline, this.limits).scanRgb;
    } else if (filmPresence && holeCmy) {
      validateSpectralRenderInput(image, this.limits);
      if (filmPresence.length !== image.width * image.height) throw new RangeError('Film presence must match the physical frame');
      const filmRaw = exposeFilm(this.pipeline.setup, image);
      const negative = developFilm(this.pipeline.setup, filmRaw);
      const compensated = blendFilmPresence(negative, filmPresence, holeCmy);
      const log = exposePaper(this.pipeline.setup, this.pipeline.print, compensated);
      const density = developPaper(this.pipeline.setup, log);
      output = scanPaper(this.pipeline.setup, density);
    } else {
      output = renderPortraStages(image, this.pipeline, this.limits).printRgb;
    }
    const frame = { backend: this.kind, frame: null };
    (frame as SpectralFrameHandle & { output?: Float32Array }).output = output;
    this.frames.add(frame);
    return frame;
  }

  readRgb(frame: SpectralFrameHandle): Float32Array {
    if (!this.frames.has(frame)) throw new Error('Spectral frame is released or foreign');
    return (frame as SpectralFrameHandle & { output?: Float32Array }).output as Float32Array;
  }

  release(frame: SpectralFrameHandle): void { this.frames.delete(frame); }
  dispose(): void { this.disposed = true; this.frames.clear(); }
}

class WebGlSpectralBackend implements SpectralBackend {
  readonly kind = 'webgl2' as const;
  readonly diagnostics: SpectralBackendDiagnostics;
  private disposed = false;

  constructor(private readonly renderer: WebGlSpectralRenderer) {
    this.diagnostics = {
      get info() { return renderer.info; },
      get measurements() { return renderer.measurements; },
      render: async (image, filmPresence, holeCmy) => {
        const { frame, timings } = renderer.render(image, filmPresence, holeCmy);
        return { frame: { backend: this.kind, frame }, timings };
      },
    };
  }

  async render(image: RgbImage, filmPresence?: Float32Array, holeCmy?: Vec3): Promise<SpectralFrameHandle> {
    if (this.disposed) throw new Error('Spectral WebGL backend is disposed');
    const { frame } = this.renderer.render(image, filmPresence, holeCmy);
    return { backend: this.kind, frame };
  }

  readRgb(frame: SpectralFrameHandle): Float32Array {
    if (!frame.frame) throw new Error('Missing WebGL spectral frame');
    return this.renderer.readStage(frame.frame, 'printRgb').rgb;
  }

  release(frame: SpectralFrameHandle): void {
    if (frame.frame) this.renderer.releaseFrame(frame.frame);
  }

  dispose(): void { this.disposed = true; this.renderer.dispose(); }
}

export type SpectralBackendOptions = {
  pipeline?: PortraPipeline | PositivePipeline | MonochromePipeline | CineStillPipeline;
  limits?: RenderLimits;
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  prefer?: 'auto' | 'webgl2' | 'cpu';
  maxTextureBytes?: number;
};

export function createSpectralBackend(options: SpectralBackendOptions = {}): SpectralBackend {
  const pipeline = options.pipeline;
  if (!pipeline) throw new Error('A validated spectral resource pipeline is required');
  const limits = options.limits ?? {
    maxPixels: 2_073_600,
    maxWorkingSetBytes: 2_073_600 * 7 * 3 * 4 + 81 * 3 * 8,
  };
  if (options.prefer !== 'cpu' && options.canvas) {
    try {
      const renderer = new WebGlSpectralRenderer(options.canvas, pipeline, {
        maxPixels: limits.maxPixels,
        maxTextureBytes: options.maxTextureBytes,
      });
      if (/swiftshader|llvmpipe|software/i.test(renderer.info.capabilities.unmaskedRenderer ?? '')) {
        renderer.dispose();
      } else {
        return new WebGlSpectralBackend(renderer);
      }
    } catch (error) {
      if (options.prefer === 'webgl2' || !(error instanceof WebGlSpectralError) || error.code !== 'unsupported') throw error;
    }
  }
  if (options.prefer === 'webgl2') throw new WebGlSpectralError('WebGL2 spectral backend is unavailable', 'unsupported');
  return new CpuSpectralBackend(pipeline, limits);
}
