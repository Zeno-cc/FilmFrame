import type { PortraPipeline } from '../portraPipeline';
import type { PositivePipeline } from '../positive';
import type { MonochromePipeline } from '../monochrome';
import type { CineStillPipeline } from '../cineStill';
import { createScanReceiver } from '../print';
import type { PortraArrays } from '../setup';
import { WebGlDevice, WebGlSpectralError } from './device';

export type ResourceTextureName =
  | 'filmTcLut' | 'filmLogExposure' | 'filmNormalizedCurves' | 'filmDirCurves' | 'filmDirMatrix'
  | 'filmChannelDensity' | 'filmBaseDensity' | 'filmSpectralValidMask'
  | 'paperLogExposure' | 'paperFittedCurves' | 'paperChannelDensity' | 'paperBaseDensity'
  | 'paperSpectralValidMask' | 'enlargerReceiver' | 'scanReceiver'
  | 'cam16LGrid' | 'cam16HGrid' | 'cam16Cmax';

export interface TextureLayout {
  width: number;
  height: number;
  channels: number;
  source: string;
  coordinate: string;
  bytes: number;
}

function packed(source: ArrayLike<number>, width: number, height: number, channels: number, transposeScalar = false): Float32Array {
  if (source.length !== width * height * channels || ![1, 3].includes(channels)) throw new Error(`Invalid spectral texture source layout: ${source.length} vs ${width * height * channels}`);
  const output = new Float32Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const sourcePixel = transposeScalar ? (pixel % width) * height + Math.floor(pixel / width) : pixel * channels;
    for (let channel = 0; channel < channels; channel += 1) output[pixel * 4 + channel] = source[sourcePixel + channel];
    output[pixel * 4 + 3] = 1;
  }
  return output;
}

function matrixUniform(matrix: ArrayLike<number>): Float32Array {
  const transposed = new Float32Array(9);
  for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) transposed[column * 3 + row] = matrix[row * 3 + column];
  return transposed;
}

export class PortraGpuResources {
  readonly textures = new Map<ResourceTextureName, WebGLTexture>();
  readonly layouts: Record<ResourceTextureName, TextureLayout>;
  readonly bytes: number;
  readonly normalization: Float32Array;
  readonly matrices: Readonly<Record<'proPhotoToXyz' | 'xyzD50ToSrgb' | 'srgbToXyz' | 'oklabXyzToLms' | 'oklabLmsToLab' | 'oklabLabToLms' | 'oklabLmsToXyz' | 'xyzToSrgb', Float32Array>>;
  private disposed = false;

  constructor(private readonly device: WebGlDevice, pipeline: PortraPipeline | PositivePipeline | MonochromePipeline | CineStillPipeline) {
    device.assertAlive();
    const { gl } = device;
    const arrays = pipeline.setup.arrays;
    // [width, height, channels, data, coordinate convention]. Generation is from existing validated arrays.
    const definitions = {
      filmTcLut: [192, 192, 3, 'filmKind' in pipeline && pipeline.filmKind === 'monochrome' ? pipeline.filmTcLut : arrays.filmTcLut, 'C-order [x * 192 + y] is uploaded as texel(y,x); Mitchell sampling uses texelFetch(y,x)'],
      filmLogExposure: [256, 1, 1, arrays.filmLogExposure, 'x=curve index; strictly increasing log10 exposure'],
      filmNormalizedCurves: [256, 3, 1, arrays.filmNormalizedCurves, 'x=curve index, y=RGB channel'],
      filmDirCurves: [256, 3, 1, arrays.filmDirCurves, 'x=curve index, y=RGB channel'],
      filmChannelDensity: [81, 1, 3, arrays.filmChannelDensity, 'x=wavelength index 0..80; RGB=CMY density'],
      filmBaseDensity: [81, 1, 1, arrays.filmBaseDensity, 'x=wavelength index 0..80'],
      filmSpectralValidMask: [81, 1, 1, arrays.filmSpectralValidMask, 'x=wavelength index; zero means no transmitted light'],
      ...('densityMax' in pipeline ? {} : {
        filmDirMatrix: [3, 3, 1, arrays.filmDirMatrix, 'texel(receiver,donor) = C-order [donor * 3 + receiver]; supplied to the film-development pass as donor-row uniforms'],
        paperLogExposure: [256, 1, 1, arrays.paperLogExposure, 'x=curve index; strictly increasing log10 exposure'],
        paperFittedCurves: [256, 3, 1, arrays.paperFittedCurves, 'x=curve index, y=RGB channel'],
        paperChannelDensity: [81, 1, 3, arrays.paperChannelDensity, 'x=wavelength index 0..80; RGB=CMY density'],
        paperBaseDensity: [81, 1, 1, arrays.paperBaseDensity, 'x=wavelength index 0..80'],
        paperSpectralValidMask: [81, 1, 1, arrays.paperSpectralValidMask, 'x=wavelength index; zero means no transmitted light'],
        enlargerReceiver: [81, 1, 3, pipeline.print.enlargerReceiver, 'x=wavelength; CPU-derived filtered enlarger * paper sensitivity'],
      }),
      scanReceiver: [81, 1, 3, createScanReceiver(pipeline.setup), 'x=wavelength; D50 * CMFs / luminance normalization'],
      cam16LGrid: [64, 1, 1, arrays.cam16LGrid, 'x=lightness index; CPU normalized grid coordinate'],
      cam16HGrid: [720, 1, 1, arrays.cam16HGrid, 'x=hue index; local cell fraction avoids absolute-index cancellation'],
      cam16Cmax: [720, 64, 1, arrays.cam16Cmax, 'texel(h,l) = C-order [l * 720 + h]'],
    } as const;
    const layouts = {} as Record<ResourceTextureName, TextureLayout>;
    this.layouts = layouts;
    type TextureDefinition = readonly [number, number, number, ArrayLike<number>, string];
    try {
      for (const [name, definition] of Object.entries(definitions) as [ResourceTextureName, TextureDefinition][]) {
        const [width, height, channels, source, coordinate] = definition;
        const transposeScalar = channels === 1 && height === 3;
        const data = packed(source, width, height, channels, transposeScalar);
        this.textures.set(name, device.createTexture(width, height, gl.RGBA32F, 16, data, name));
        layouts[name] = { width, height, channels, source: name === 'enlargerReceiver' || name === 'scanReceiver' ? `derived:${name}` : `portraResource:${name}`, coordinate, bytes: data.byteLength };
      }
      this.normalization = Float32Array.from('print' in pipeline ? pipeline.print.normalization : [1, 1, 1]);
      this.matrices = {
        proPhotoToXyz: matrixUniform('filmKind' in pipeline && pipeline.filmKind === 'monochrome' ? pipeline.inputColorMatrix : arrays.proPhotoToXyzD55Cat16),
        xyzD50ToSrgb: matrixUniform(arrays.xyzD50ToSrgbCat02),
        srgbToXyz: matrixUniform(arrays.srgbToXyz),
        oklabXyzToLms: matrixUniform(arrays.oklabXyzToLms),
        oklabLmsToLab: matrixUniform(arrays.oklabLmsToLab),
        oklabLabToLms: matrixUniform(arrays.oklabLabToLms),
        oklabLmsToXyz: matrixUniform(arrays.oklabLmsToXyz),
        xyzToSrgb: matrixUniform(arrays.xyzToSrgb),
      };
      this.bytes = device.textureBytes;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  bind(program: WebGLProgram, assignments: Readonly<Partial<Record<ResourceTextureName | 'source' | 'negativeDensity' | 'paperDensity', { texture: WebGLTexture; unit: number }>>>): void {
    this.device.assertAlive();
    const { gl } = this.device;
    for (const [name, binding] of Object.entries(assignments)) {
      if (!binding) continue;
      const sampler = name === 'source' ? 'uSource' : name === 'negativeDensity' ? 'uNegativeDensity' : name === 'paperDensity' ? 'uPaperDensity' : `u${name[0].toUpperCase()}${name.slice(1)}`;
      const location = gl.getUniformLocation(program, sampler);
      if (location === null) throw new WebGlSpectralError(`Missing active spectral sampler ${sampler}`, 'shader');
      gl.activeTexture(gl.TEXTURE0 + binding.unit);
      gl.bindTexture(gl.TEXTURE_2D, binding.texture);
      gl.uniform1i(location, binding.unit);
    }
  }

  texture(name: ResourceTextureName): WebGLTexture {
    const texture = this.textures.get(name);
    if (!texture) throw new Error(`Missing GPU resource ${name}`);
    return texture;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const [name, texture] of this.textures) {
      const layout = this.layouts?.[name];
      if (layout) this.device.deleteTexture(texture, layout.bytes);
    }
    this.textures.clear();
  }
}
