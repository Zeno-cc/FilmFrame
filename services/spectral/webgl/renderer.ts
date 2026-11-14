import type { PortraPipeline } from '../portraPipeline';
import type { RgbImage } from '../types';
import type { PositivePipeline } from '../positive';
import type { MonochromePipeline } from '../monochrome';
import type { CineStillPipeline } from '../cineStill';
import type { Vec3 } from '../math';
import { WebGlDevice, WebGlSpectralError, type WebGlCanvas, type WebGlCapabilities, type WebGlStage } from './device';
import { PortraGpuResources, type ResourceTextureName, type TextureLayout } from './resources';
import { FILM_DEVELOPMENT_SHADER, FILM_EXPOSURE_SHADER, FILM_PRESENCE_SHADER, FULLSCREEN_VERTEX_SHADER, MONOCHROME_DEVELOPMENT_SHADER, PAPER_DEVELOPMENT_SHADER, PAPER_EXPOSURE_SHADER, POSITIVE_DEVELOPMENT_SHADER, SCAN_SHADER, CINESTILL_BLUR_SHADER, CINESTILL_HEADROOM_SHADER, CINESTILL_MAX_SHADER, CINESTILL_MIX_SHADER, CINESTILL_ACCUMULATE_SHADER } from './shaders';

export interface WebGlRendererOptions {
  maxPixels?: number;
  maxTextureBytes?: number;
  onContextLost?: (message: string) => void;
}
export interface GpuRenderTimings { uploadMs: number; packInputMs: number; filmMs: number; paperMs: number; scanMs: number; renderMs: number; }
export interface GpuFrame {
  readonly width: number;
  readonly height: number;
  readonly source: WebGLTexture;
  readonly filmRaw: WebGLTexture;
  readonly negativeDensity: WebGLTexture;
  readonly paperLogExposure: WebGLTexture;
  readonly paperDensity: WebGLTexture;
  readonly printRgb: WebGLTexture;
  readonly framebuffers: Readonly<Record<WebGlStage, WebGLFramebuffer>>;
  readonly bytes: number;
}
export interface GpuRendererInfo {
  capabilities: WebGlCapabilities;
  densityFormat: 'RGBA32F';
  outputFormat: 'RGBA32F';
  textureBytes: number;
  setupTextureBytes: number;
  frameTextureBytes: number;
  textureLayouts: Readonly<Record<string, TextureLayout>>;
  readbackFormat: 'FLOAT';
}
export interface ReadbackResult { rgba: Float32Array; rgb: Float32Array; bytes: number; format: 'FLOAT'; }
type Binding = { texture: WebGLTexture; unit: number };
type SamplerName = ResourceTextureName | 'source' | 'filmRaw' | 'negativeDensity' | 'paperDensity' | 'paperLogExposureInput' | 'scanDensity' | 'scanChannelDensity' | 'scanBaseDensity' | 'scanSpectralValidMask' | 'accumulator' | 'halo';
type OwnedTexture = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number };
const STAGES: readonly WebGlStage[] = ['filmRaw', 'negativeDensity', 'paperLogExposure', 'paperDensity', 'printRgb'];

function validateImage(image: RgbImage, maxPixels: number, device: WebGlDevice): void {
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0
    || image.width > Math.floor(Number.MAX_SAFE_INTEGER / image.height) || image.width * image.height > maxPixels) {
    throw new WebGlSpectralError('GPU spectral input exceeds the validated pixel/dimension budget', 'invalid-input');
  }
  if (!(image.pixels instanceof Float32Array) || image.pixels.length !== image.width * image.height * 3) {
    throw new WebGlSpectralError('GPU spectral input must be packed Float32Array RGB', 'invalid-input');
  }
  if (image.width > device.capabilities.maxTextureSize || image.height > device.capabilities.maxTextureSize
    || image.width > device.capabilities.maxViewportDimensions[0] || image.height > device.capabilities.maxViewportDimensions[1]) {
    throw new WebGlSpectralError('GPU spectral image exceeds texture or viewport limits', 'invalid-input');
  }
  for (let index = 0; index < image.pixels.length; index += 1) {
    if (!Number.isFinite(image.pixels[index])) throw new WebGlSpectralError(`Non-finite GPU input at ${index}`, 'invalid-input');
  }
}

/** Single-output passes avoid driver-dependent dual float attachment validation and make feedback impossible. */
export class WebGlSpectralRenderer {
  readonly device: WebGlDevice;
  readonly resources: PortraGpuResources;
  private readonly maxPixels: number;
  private readonly filmExposureProgram: WebGLProgram;
  private readonly filmDevelopmentProgram: WebGLProgram;
  private positiveDevelopmentProgram?: WebGLProgram;
  private monochromeExposureMatrix?: Float64Array;
  private monochromeDevelopmentProgram?: WebGLProgram;
  private positiveDensityMax?: readonly [number, number, number];
  private readonly filmPresenceProgram: WebGLProgram;
  private readonly paperExposureProgram: WebGLProgram;
  private readonly paperDevelopmentProgram: WebGLProgram;
  private readonly scanProgram: WebGLProgram;
  private readonly cineStill?: CineStillPipeline;
  private cineStillMaxProgram?: WebGLProgram;
  private cineStillHeadroomProgram?: WebGLProgram;
  private cineStillBlurProgram?: WebGLProgram;
  private cineStillAccumulateProgram?: WebGLProgram;
  private cineStillMixProgram?: WebGLProgram;
  private readonly vertexArray: WebGLVertexArrayObject;
  private readonly frames = new Set<GpuFrame>();
  private readonly frameScratch = new Map<GpuFrame, OwnedTexture[]>();
  private disposed = false;
  private readbackCount = 0;
  private readbackBytes = 0;

  constructor(canvas: WebGlCanvas, pipeline: PortraPipeline | PositivePipeline | MonochromePipeline | CineStillPipeline, options: WebGlRendererOptions = {}) {
    this.maxPixels = options.maxPixels ?? 2_073_600;
    if ('densityMax' in pipeline) this.positiveDensityMax = pipeline.densityMax;
    if ('filmKind' in pipeline) {
      if (pipeline.filmKind === 'cineStill') this.cineStill = pipeline;
      else this.monochromeExposureMatrix = pipeline.inputColorMatrix;
    }
    if (!Number.isSafeInteger(this.maxPixels) || this.maxPixels <= 0) throw new RangeError('GPU maxPixels must be a positive safe integer');
    let device: WebGlDevice | undefined;
    try {
      device = new WebGlDevice(canvas, options);
      this.device = device;
      const format = device.capabilities.floatRenderTargets.find(item => item.internalFormat === 'RGBA32F');
      if (!format?.renderable || !format.readback) throw new WebGlSpectralError('RGBA32F rendering and FLOAT readback are required; negative density is never quantized', 'unsupported');
      this.resources = new PortraGpuResources(device, pipeline);
      this.filmExposureProgram = device.createProgram(FILM_EXPOSURE_SHADER, FULLSCREEN_VERTEX_SHADER);
      this.filmDevelopmentProgram = device.createProgram(FILM_DEVELOPMENT_SHADER, FULLSCREEN_VERTEX_SHADER);
      if (this.monochromeExposureMatrix) this.monochromeDevelopmentProgram = device.createProgram(MONOCHROME_DEVELOPMENT_SHADER, FULLSCREEN_VERTEX_SHADER);
      if (this.positiveDensityMax) {
        this.positiveDevelopmentProgram = device.createProgram(POSITIVE_DEVELOPMENT_SHADER, FULLSCREEN_VERTEX_SHADER);
      }
      this.filmPresenceProgram = device.createProgram(FILM_PRESENCE_SHADER, FULLSCREEN_VERTEX_SHADER);
      this.paperExposureProgram = device.createProgram(PAPER_EXPOSURE_SHADER, FULLSCREEN_VERTEX_SHADER);
      this.paperDevelopmentProgram = device.createProgram(PAPER_DEVELOPMENT_SHADER, FULLSCREEN_VERTEX_SHADER);
      this.scanProgram = device.createProgram(SCAN_SHADER, FULLSCREEN_VERTEX_SHADER);
      if (this.cineStill) {
        this.cineStillMaxProgram = device.createProgram(CINESTILL_MAX_SHADER, FULLSCREEN_VERTEX_SHADER);
        this.cineStillHeadroomProgram = device.createProgram(CINESTILL_HEADROOM_SHADER, FULLSCREEN_VERTEX_SHADER);
        this.cineStillBlurProgram = device.createProgram(CINESTILL_BLUR_SHADER, FULLSCREEN_VERTEX_SHADER);
        this.cineStillAccumulateProgram = device.createProgram(CINESTILL_ACCUMULATE_SHADER, FULLSCREEN_VERTEX_SHADER);
        this.cineStillMixProgram = device.createProgram(CINESTILL_MIX_SHADER, FULLSCREEN_VERTEX_SHADER);
      }
      const { gl } = device;
      const buffer = device.createBuffer(new Float32Array([-1, -1, 3, -1, -1, 3]));
      const vertexArray = device.createVertexArray();
      this.vertexArray = vertexArray;
      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.useProgram(this.filmExposureProgram);
      gl.uniformMatrix3fv(gl.getUniformLocation(this.filmExposureProgram, 'uProPhotoToXyz'), false, this.resources.matrices.proPhotoToXyz);
      gl.useProgram(this.filmDevelopmentProgram);
      for (let donor = 0; donor < 3; donor += 1) gl.uniform3fv(gl.getUniformLocation(this.filmDevelopmentProgram, `uDirDonor${donor}`), pipeline.setup.arrays.filmDirMatrix.slice(donor * 3, donor * 3 + 3));
      if (this.positiveDevelopmentProgram && this.positiveDensityMax) {
        gl.useProgram(this.positiveDevelopmentProgram);
        for (let donor = 0; donor < 3; donor += 1) gl.uniform3fv(gl.getUniformLocation(this.positiveDevelopmentProgram, `uDirDonor${donor}`), pipeline.setup.arrays.filmDirMatrix.slice(donor * 3, donor * 3 + 3));
        gl.uniform3fv(gl.getUniformLocation(this.positiveDevelopmentProgram, 'uFilmDensityMax'), this.positiveDensityMax);
      }
      if (this.monochromeExposureMatrix) {
        gl.useProgram(this.filmExposureProgram);
        gl.uniformMatrix3fv(gl.getUniformLocation(this.filmExposureProgram, 'uProPhotoToXyz'), false, this.resources.matrices.proPhotoToXyz);
      }
      gl.useProgram(this.paperExposureProgram);
      gl.uniform3fv(gl.getUniformLocation(this.paperExposureProgram, 'uNormalization'), this.resources.normalization);
      const matrices = {
        uXyzD50ToSrgb: 'xyzD50ToSrgb', uSrgbToXyz: 'srgbToXyz', uOklabXyzToLms: 'oklabXyzToLms',
        uOklabLmsToLab: 'oklabLmsToLab', uOklabLabToLms: 'oklabLabToLms', uOklabLmsToXyz: 'oklabLmsToXyz', uXyzToSrgb: 'xyzToSrgb',
      } as const;
      gl.useProgram(this.scanProgram);
      for (const [uniform, matrix] of Object.entries(matrices)) {
        const location = gl.getUniformLocation(this.scanProgram, uniform);
        if (location === null) throw new WebGlSpectralError(`Missing scan matrix ${uniform}`, 'shader');
        gl.uniformMatrix3fv(location, false, this.resources.matrices[matrix]);
      }
      gl.disable(gl.BLEND);
      gl.disable(gl.DITHER);
      gl.disable(gl.DEPTH_TEST);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    } catch (error) {
      if (device) device.dispose();
      throw error;
    }
  }

  get info(): GpuRendererInfo {
    return {
      capabilities: this.device.capabilities, densityFormat: 'RGBA32F', outputFormat: 'RGBA32F',
      textureBytes: this.device.textureBytes, setupTextureBytes: this.resources.bytes,
      frameTextureBytes: [...this.frames].reduce((sum, frame) => sum + frame.bytes
        + (this.frameScratch.get(frame) ?? []).reduce((bytes, texture) => bytes + texture.width * texture.height * 16, 0), 0),
      textureLayouts: this.resources.layouts, readbackFormat: 'FLOAT',
    };
  }
  get measurements(): { readbackCount: number; readbackBytes: number; activeFrames: number } {
    return { readbackCount: this.readbackCount, readbackBytes: this.readbackBytes, activeFrames: this.frames.size };
  }
  getDiagnostics(): { info: GpuRendererInfo; measurements: { readbackCount: number; readbackBytes: number; activeFrames: number } } {
    return { info: this.info, measurements: this.measurements };
  }

  private assertActive(): void {
    if (this.disposed) throw new WebGlSpectralError('WebGL spectral renderer has been disposed', 'disposed');
    this.device.assertAlive();
  }

  createFrame(image: RgbImage): { frame: GpuFrame; uploadMs: number; packInputMs: number } {
    this.assertActive();
    validateImage(image, this.maxPixels, this.device);
    const packStart = performance.now();
    const { gl } = this.device;
    const { width, height } = image;
    const pixels = width * height;
    const packed = new Float32Array(pixels * 4);
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      packed[pixel * 4] = image.pixels[pixel * 3];
      packed[pixel * 4 + 1] = image.pixels[pixel * 3 + 1];
      packed[pixel * 4 + 2] = image.pixels[pixel * 3 + 2];
      packed[pixel * 4 + 3] = 1;
    }
    const uploadStart = performance.now();
    const packInputMs = uploadStart - packStart;
    const source = this.device.createTexture(width, height, gl.RGBA32F, 16, packed, 'linear ProPhoto source');
    const textures = {} as Record<WebGlStage, WebGLTexture>;
    const framebuffers = {} as Record<WebGlStage, WebGLFramebuffer>;
    try {
      for (const stage of this.positiveDensityMax ? ['filmRaw', 'negativeDensity', 'printRgb'] as const : STAGES) {
        textures[stage] = this.device.createTexture(width, height, gl.RGBA32F, 16, null, stage);
        framebuffers[stage] = this.device.createFramebuffer(textures[stage]);
      }
      const frame: GpuFrame = { width, height, source, ...textures, framebuffers, bytes: pixels * (1 + Object.keys(textures).length) * 16 };
      this.frames.add(frame);
      return { frame, uploadMs: performance.now() - uploadStart, packInputMs };
    } catch (error) {
      this.device.deleteTexture(source, pixels * 16);
      for (const stage of this.positiveDensityMax ? ['filmRaw', 'negativeDensity', 'printRgb'] as const : STAGES) {
        const texture = textures[stage];
        if (texture) this.device.deleteTexture(texture, pixels * 16);
        const framebuffer = framebuffers[stage];
        if (framebuffer) this.device.deleteFramebuffer(framebuffer);
      }
      throw error;
    }
  }

  private bindSamplers(program: WebGLProgram, assignments: Readonly<Partial<Record<SamplerName, Binding>>>, reset = false): void {
    const { gl } = this.device;
    if (reset) this.unbindSpatialSamplers();
    gl.useProgram(program);
    for (const [name, binding] of Object.entries(assignments)) {
      if (!binding) continue;
      const sampler = name === 'source' ? 'uSource' : name === 'filmRaw' ? 'uFilmRaw' : name === 'negativeDensity' ? 'uNegativeDensity' : name === 'paperDensity' ? 'uPaperDensity' : name === 'paperLogExposureInput' ? 'uPaperLogExposureInput' : name === 'accumulator' ? 'uAccumulator' : name === 'halo' ? 'uHalo' : `u${name[0].toUpperCase()}${name.slice(1)}`;
      const location = gl.getUniformLocation(program, sampler);
      if (location === null) throw new WebGlSpectralError(`Missing active spectral sampler ${sampler}`, 'shader');
      gl.activeTexture(gl.TEXTURE0 + binding.unit);
      gl.bindTexture(gl.TEXTURE_2D, binding.texture);
      gl.uniform1i(location, binding.unit);
    }
  }

  private draw(frame: GpuFrame, target: WebGLFramebuffer): void {
    const { gl } = this.device;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new WebGlSpectralError('Single-output spectral framebuffer is incomplete', 'unsupported');
    gl.viewport(0, 0, frame.width, frame.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new WebGlSpectralError(`GPU spectral draw failed with error 0x${error.toString(16)}`, 'shader');
  }

  private unbindSpatialSamplers(): void {
    const { gl } = this.device;
    for (let unit = 0; unit < this.device.capabilities.maxFragmentTextureUnits; unit += 1) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }

  private drawSize(width: number, height: number, target: WebGLFramebuffer): void {
    const { gl } = this.device;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new WebGlSpectralError('CineStill framebuffer is incomplete', 'unsupported');
    gl.viewport(0, 0, width, height);
    if (target !== null) {
      const attachment = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME);
      const active: number[] = [];
      for (let unit = 0; unit < this.device.capabilities.maxFragmentTextureUnits; unit += 1) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        if (gl.getParameter(gl.TEXTURE_BINDING_2D) === attachment) active.push(unit);
      }
      if (active.length) throw new WebGlSpectralError(`CineStill texture feedback at units ${active.join(',')}`, 'shader');
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new WebGlSpectralError(`CineStill GPU draw failed with error 0x${error.toString(16)}`, 'shader');
  }

  private createSpatialTexture(width: number, height: number): OwnedTexture {
    const { gl } = this.device;
    const texture = this.device.createTexture(width, height, gl.RGBA32F, 16, null, 'CineStill spatial scratch');
    try {
      return { texture, framebuffer: this.device.createFramebuffer(texture), width, height };
    } catch (error) {
      this.device.deleteTexture(texture, width * height * 16);
      throw error;
    }
  }

  private releaseSpatialTexture(owned: OwnedTexture): void {
    this.device.deleteFramebuffer(owned.framebuffer);
    this.device.deleteTexture(owned.texture, owned.width * owned.height * 16);
  }

  private applyCineStillExposure(frame: GpuFrame): WebGLTexture {
    const pipeline = this.cineStill;
    if (!pipeline || !this.cineStillMaxProgram || !this.cineStillHeadroomProgram || !this.cineStillBlurProgram || !this.cineStillAccumulateProgram || !this.cineStillMixProgram) throw new Error('CineStill GPU programs are not initialized');
    const { gl } = this.device;
    this.unbindSpatialSamplers();
    for (const texture of this.frameScratch.get(frame) ?? []) this.releaseSpatialTexture(texture);
    this.frameScratch.delete(frame);
    const owned: OwnedTexture[] = [];
    const allocate = (width: number, height: number) => {
      const texture = this.createSpatialTexture(width, height);
      owned.push(texture);
      return texture;
    };
    try {
      const reductions: OwnedTexture[] = [];
      let width = frame.width;
      let height = frame.height;
      do {
        if (reductions.length >= 16) throw new WebGlSpectralError('CineStill maximum reduction exceeds its bounded level count', 'invalid-input');
        const target = allocate(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
        reductions.push(target);
        width = target.width;
        height = target.height;
      } while (width > 1 || height > 1);
      this.bindSamplers(this.cineStillMaxProgram, { source: { texture: frame.source, unit: 0 } }, true);
      gl.uniform2i(gl.getUniformLocation(this.cineStillMaxProgram, 'uSourceSize'), frame.width, frame.height);
      this.drawSize(reductions[0].width, reductions[0].height, reductions[0].framebuffer);
      for (let index = 1; index < reductions.length; index += 1) {
        const source = reductions[index - 1];
        const target = reductions[index];
        this.bindSamplers(this.cineStillMaxProgram, { source: { texture: source.texture, unit: 0 } }, true);
        gl.uniform2i(gl.getUniformLocation(this.cineStillMaxProgram, 'uSourceSize'), source.width, source.height);
        this.drawSize(target.width, target.height, target.framebuffer);
      }
      const clipRgba = this.device.readPixels(
        reductions.at(-1)!.framebuffer,
        1,
        1,
      );
      const clip = Math.max(clipRgba[0], clipRgba[1], clipRgba[2]);
      const headroom = allocate(frame.width, frame.height);
      this.bindSamplers(this.cineStillHeadroomProgram, { source: { texture: frame.source, unit: 0 } }, true);
      gl.uniform1f(gl.getUniformLocation(this.cineStillHeadroomProgram, 'uClip'), clip);
      gl.uniform1f(gl.getUniformLocation(this.cineStillHeadroomProgram, 'uHeadroomEv'), pipeline.spatial.headroomEv);
      this.drawSize(frame.width, frame.height, headroom.framebuffer);

      const horizontal = allocate(frame.width, frame.height);
      let accumulated = allocate(frame.width, frame.height);
      const plan = pipeline.spatial.plan(frame.width, frame.height);
      const maximumSigma = Math.max(...plan.components.flatMap(component => component.sigma));
      if (Math.floor(3 * maximumSigma + 0.5) > 256) throw new WebGlSpectralError('CineStill bounded Gaussian kernel exceeds 256 pixels', 'invalid-input');
      const blurred = allocate(frame.width, frame.height);
      for (const [index, component] of plan.components.entries()) {
        for (const [axis, source, target] of [[[1, 0], headroom, horizontal], [[0, 1], horizontal, blurred]] as const) {
          this.bindSamplers(this.cineStillBlurProgram, { source: { texture: source.texture, unit: 0 } }, true);
          gl.uniform2i(gl.getUniformLocation(this.cineStillBlurProgram, 'uSourceSize'), frame.width, frame.height);
          gl.uniform2iv(gl.getUniformLocation(this.cineStillBlurProgram, 'uAxis'), axis);
          gl.uniform3fv(gl.getUniformLocation(this.cineStillBlurProgram, 'uSigma'), component.sigma);
          gl.uniform3fv(gl.getUniformLocation(this.cineStillBlurProgram, 'uWeight'), [1, 1, 1]);
          this.drawSize(frame.width, frame.height, target.framebuffer);
        }
        const next = allocate(frame.width, frame.height);
        this.bindSamplers(this.cineStillAccumulateProgram, {
          accumulator: { texture: accumulated.texture, unit: 0 },
          source: { texture: blurred.texture, unit: 1 },
        }, true);
        gl.uniform3fv(gl.getUniformLocation(this.cineStillAccumulateProgram, 'uWeight'), component.weights);
        gl.uniform1i(gl.getUniformLocation(this.cineStillAccumulateProgram, 'uInitialize'), index === 0 ? 1 : 0);
        this.drawSize(frame.width, frame.height, next.framebuffer);
        this.releaseSpatialTexture(accumulated);
        owned.splice(owned.indexOf(accumulated), 1);
        accumulated = next;
      }
      const spatialLinear = allocate(frame.width, frame.height);
      this.bindSamplers(this.cineStillMixProgram, {
        source: { texture: headroom.texture, unit: 0 },
        halo: { texture: accumulated.texture, unit: 1 },
      }, true);
      gl.uniform3fv(gl.getUniformLocation(this.cineStillMixProgram, 'uStrength'), pipeline.spatial.strength.map(value => Math.fround(value) * Math.fround(pipeline.spatial.amount)));
      this.drawSize(frame.width, frame.height, spatialLinear.framebuffer);
      this.unbindSpatialSamplers();
      this.frameScratch.set(frame, [spatialLinear]);
      owned.splice(owned.indexOf(spatialLinear), 1);
      return spatialLinear.texture;
    } finally {
      this.unbindSpatialSamplers();
      for (const texture of owned.reverse()) this.releaseSpatialTexture(texture);
    }
  }

  private resourcesAt(program: WebGLProgram, names: readonly ResourceTextureName[], firstUnit: number): void {
    this.bindSamplers(program, Object.fromEntries(names.map((name, index) => [name, { texture: this.resources.texture(name), unit: firstUnit + index }])));
  }

  developFilm(frame: GpuFrame): number {
    this.assertActive();
    const { gl } = this.device;
    gl.bindVertexArray(this.vertexArray);
    const exposureSource = this.cineStill ? this.applyCineStillExposure(frame) : frame.source;
    this.bindSamplers(this.filmExposureProgram, { source: { texture: exposureSource, unit: 0 } });
    this.resourcesAt(this.filmExposureProgram, ['filmTcLut'], 1);
    const start = performance.now();
    this.draw(frame, frame.framebuffers.filmRaw);
    this.bindSamplers(this.monochromeDevelopmentProgram ?? this.positiveDevelopmentProgram ?? this.filmDevelopmentProgram, { filmRaw: { texture: frame.filmRaw, unit: 0 } });
    this.resourcesAt(this.monochromeDevelopmentProgram ?? this.positiveDevelopmentProgram ?? this.filmDevelopmentProgram,
      this.monochromeDevelopmentProgram ? ['filmLogExposure', 'filmNormalizedCurves'] : ['filmLogExposure', 'filmNormalizedCurves', 'filmDirCurves'], 1);
    this.draw(frame, frame.framebuffers.negativeDensity);
    return performance.now() - start;
  }

  printPaper(frame: GpuFrame, negativeTexture = frame.negativeDensity): number {
    this.assertActive();
    const { gl } = this.device;
    gl.bindVertexArray(this.vertexArray);
    this.bindSamplers(this.paperExposureProgram, { negativeDensity: { texture: negativeTexture, unit: 0 } });
    this.resourcesAt(this.paperExposureProgram, ['filmChannelDensity', 'filmBaseDensity', 'filmSpectralValidMask', 'enlargerReceiver'], 1);
    const start = performance.now();
    this.draw(frame, frame.framebuffers.paperLogExposure);
    this.bindSamplers(this.paperDevelopmentProgram, { paperLogExposureInput: { texture: frame.paperLogExposure, unit: 0 } });
    this.resourcesAt(this.paperDevelopmentProgram, ['paperLogExposure', 'paperFittedCurves'], 1);
    this.draw(frame, frame.framebuffers.paperDensity);
    return performance.now() - start;
  }

  scanPrint(frame: GpuFrame): number {
    this.assertActive();
    const { gl } = this.device;
    gl.bindVertexArray(this.vertexArray);
    this.bindSamplers(this.scanProgram, { scanDensity: { texture: this.positiveDensityMax ? frame.negativeDensity : frame.paperDensity, unit: 0 } });
    this.bindSamplers(this.scanProgram, Object.fromEntries((this.positiveDensityMax
      ? [['scanChannelDensity', 'filmChannelDensity'], ['scanBaseDensity', 'filmBaseDensity'], ['scanSpectralValidMask', 'filmSpectralValidMask']]
      : [['scanChannelDensity', 'paperChannelDensity'], ['scanBaseDensity', 'paperBaseDensity'], ['scanSpectralValidMask', 'paperSpectralValidMask']])
      .map(([sampler, resource], index) => [sampler, { texture: this.resources.texture(resource as ResourceTextureName), unit: index + 1 }])));
    this.resourcesAt(this.scanProgram, ['scanReceiver', 'cam16LGrid', 'cam16HGrid', 'cam16Cmax'], 4);
    const start = performance.now();
    this.draw(frame, frame.framebuffers.printRgb);
    return performance.now() - start;
  }

  render(image: RgbImage, filmPresence?: Float32Array, holeCmy?: Vec3): { frame: GpuFrame; timings: GpuRenderTimings } {
    this.assertActive();
    const start = performance.now();
    const { frame, uploadMs, packInputMs } = this.createFrame(image);
    let presenceTexture: WebGLTexture | undefined;
    let presenceTextureBytes = 0;
    try {
      const filmMs = this.developFilm(frame);
      if (filmPresence && holeCmy) {
        if (filmPresence.length !== image.width * image.height) throw new WebGlSpectralError('Film presence must match the physical frame', 'invalid-input');
        const packed = new Float32Array(filmPresence.length * 4);
        for (let pixel = 0; pixel < filmPresence.length; pixel += 1) {
          if (!Number.isFinite(filmPresence[pixel]) || filmPresence[pixel] < 0 || filmPresence[pixel] > 1) throw new WebGlSpectralError('Film presence must be in [0, 1]', 'invalid-input');
          packed[pixel * 4] = filmPresence[pixel];
        }
        const { gl } = this.device;
        presenceTexture = this.device.createTexture(image.width, image.height, gl.RGBA32F, 16, packed, 'film presence');
        presenceTextureBytes = packed.byteLength;
        this.bindSamplers(this.filmPresenceProgram, {
          negativeDensity: { texture: frame.negativeDensity, unit: 0 },
        });
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, presenceTexture);
        gl.uniform1i(gl.getUniformLocation(this.filmPresenceProgram, 'uFilmPresence'), 1);
        gl.uniform3fv(gl.getUniformLocation(this.filmPresenceProgram, 'uHoleCmy'), holeCmy);
        this.draw(frame, frame.framebuffers.filmRaw);
        this.device.deleteTexture(presenceTexture, packed.byteLength);
        presenceTexture = undefined;
        presenceTextureBytes = 0;
      }
      const paperMs = this.positiveDensityMax ? 0 : this.printPaper(frame, filmPresence && holeCmy ? frame.filmRaw : frame.negativeDensity);
      const scanMs = this.scanPrint(frame);
      return { frame, timings: { uploadMs, packInputMs, filmMs, paperMs, scanMs, renderMs: performance.now() - start } };
    } catch (error) {
      if (presenceTexture) this.device.deleteTexture(presenceTexture, presenceTextureBytes);
      this.releaseFrame(frame);
      throw error;
    }
  }

  /** Test-only by default. Ordinary print repeats consume float textures without reading them back. */
  readStage(frame: GpuFrame, stage: WebGlStage): ReadbackResult {
    this.assertActive();
    if (!this.frames.has(frame)) throw new WebGlSpectralError('Cannot read a released or foreign spectral frame', 'invalid-input');
    const rgba = this.device.readPixels(frame.framebuffers[stage], frame.width, frame.height);
    const rgb = new Float32Array(frame.width * frame.height * 3);
    for (let pixel = 0; pixel < frame.width * frame.height; pixel += 1) {
      rgb[pixel * 3] = rgba[pixel * 4];
      rgb[pixel * 3 + 1] = rgba[pixel * 4 + 1];
      rgb[pixel * 3 + 2] = rgba[pixel * 4 + 2];
    }
    this.readbackCount += 1;
    this.readbackBytes += rgba.byteLength;
    return { rgba, rgb, bytes: rgba.byteLength, format: 'FLOAT' };
  }

  releaseFrame(frame: GpuFrame): void {
    if (!this.frames.delete(frame)) return;
    for (const texture of this.frameScratch.get(frame) ?? []) this.releaseSpatialTexture(texture);
    this.frameScratch.delete(frame);
    for (const framebuffer of Object.values(frame.framebuffers)) {
      this.device.deleteFramebuffer(framebuffer);
    }
    const bytes = frame.width * frame.height * 16;
    this.device.deleteTexture(frame.source, bytes);
    for (const stage of Object.keys(frame.framebuffers) as WebGlStage[]) this.device.deleteTexture(frame[stage], bytes);
  }

  dispose(): void {
    if (this.disposed) return;
    for (const frame of [...this.frames]) this.releaseFrame(frame);
    this.resources.dispose();
    this.disposed = true;
    this.device.dispose();
  }
}
