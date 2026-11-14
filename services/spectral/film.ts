import { interpolateCurve, multiply3, sampleFilmTcLut, type Vec3 } from './math';
import type { PortraSetup } from './setup';
import type { RgbImage } from './types';

export function sceneRgbToFilmRaw(setup: PortraSetup, r: number, g: number, b: number, matrix = setup.arrays.proPhotoToXyzD55Cat16, lut = setup.arrays.filmTcLut): Vec3 {
  const xyz = multiply3(matrix, [r, g, b]);
  const brightness = Number.isFinite(xyz[0] + xyz[1] + xyz[2]) ? xyz[0] + xyz[1] + xyz[2] : 0;
  const denominator = Math.max(brightness, 1e-10);
  const x = xyz[0] / denominator;
  const y = xyz[1] / denominator;
  const tx = Math.min(1, Math.max(0, (1 - x) ** 2));
  const ty = Math.min(1, Math.max(0, y / Math.max(1 - x, 1e-10)));
  const sampled = sampleFilmTcLut(lut, 192, tx, ty);
  return [sampled[0] * brightness, sampled[1] * brightness, sampled[2] * brightness];
}

export function developFilmPixel(
  setup: PortraSetup,
  logRaw: Vec3,
  output: Float32Array,
  offset: number,
): void {
  const { filmLogExposure, filmNormalizedCurves, filmDirCurves, filmDirMatrix } = setup.arrays;
  const normalized: Vec3 = [
    interpolateCurve(logRaw[0], filmLogExposure, filmNormalizedCurves, 0),
    interpolateCurve(logRaw[1], filmLogExposure, filmNormalizedCurves, 1),
    interpolateCurve(logRaw[2], filmLogExposure, filmNormalizedCurves, 2),
  ];
  for (let receiver = 0; receiver < 3; receiver += 1) {
    let correction = 0;
    for (let donor = 0; donor < 3; donor += 1) {
      correction += normalized[donor] * filmDirMatrix[donor * 3 + receiver];
    }
    output[offset + receiver] = interpolateCurve(logRaw[receiver] - correction, filmLogExposure, filmDirCurves, receiver);
  }
}

export function exposeFilm(setup: PortraSetup, image: RgbImage): Float32Array {
  const filmRaw = new Float32Array(image.pixels.length);
  for (let offset = 0; offset < image.pixels.length; offset += 3) {
    const raw = sceneRgbToFilmRaw(setup, image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2]);
    for (let channel = 0; channel < 3; channel += 1) {
      filmRaw[offset + channel] = Math.log10(Math.max(raw[channel], 0) + 1e-10);
    }
  }
  return filmRaw;
}

export function developFilm(setup: PortraSetup, filmRaw: Float32Array): Float32Array {
  const density = new Float32Array(filmRaw.length);
  for (let offset = 0; offset < filmRaw.length; offset += 3) {
    developFilmPixel(setup, [filmRaw[offset], filmRaw[offset + 1], filmRaw[offset + 2]], density, offset);
  }
  return density;
}
