import { clamp, multiply3, signedPower, type Vec3 } from './math';
import { createScanReceiver, spectralIntegral } from './print';
import type { PortraSetup } from './setup';

function reinhardKnee(value: number, threshold: number, limit: number, power: number): number {
  if (value <= threshold) return value;
  const scale = limit - threshold;
  const normalized = (value - threshold) / scale;
  return threshold + scale * normalized / (1 + normalized ** power) ** (1 / power);
}

function sampleCmax(setup: PortraSetup, lightness: number, hue: number): number {
  const { cam16LGrid, cam16HGrid, cam16Cmax } = setup.arrays;
  const l = clamp(lightness, cam16LGrid[0], cam16LGrid[cam16LGrid.length - 1]);
  const lIndex = (l - cam16LGrid[0]) / (cam16LGrid[cam16LGrid.length - 1] - cam16LGrid[0]) * (cam16LGrid.length - 1);
  const lLow = clamp(Math.floor(lIndex), 0, cam16LGrid.length - 2);
  const lFraction = lIndex - lLow;
  const hIndex = (hue - cam16HGrid[0]) / (cam16HGrid[1] - cam16HGrid[0]);
  const hFloor = Math.floor(hIndex);
  const hLow = ((hFloor % cam16HGrid.length) + cam16HGrid.length) % cam16HGrid.length;
  const hHigh = (hLow + 1) % cam16HGrid.length;
  const hFraction = hIndex - hFloor;
  const lower = lLow * cam16HGrid.length;
  const upper = (lLow + 1) * cam16HGrid.length;
  return cam16Cmax[lower + hLow] * (1 - lFraction) * (1 - hFraction)
    + cam16Cmax[lower + hHigh] * (1 - lFraction) * hFraction
    + cam16Cmax[upper + hLow] * lFraction * (1 - hFraction)
    + cam16Cmax[upper + hHigh] * lFraction * hFraction;
}

export function compressOklch(setup: PortraSetup, linearRgb: Vec3): Vec3 {
  const xyz = multiply3(setup.arrays.srgbToXyz, linearRgb);
  const lms = multiply3(setup.arrays.oklabXyzToLms, xyz);
  const lab = multiply3(setup.arrays.oklabLmsToLab, [
    signedPower(lms[0], 1 / 3),
    signedPower(lms[1], 1 / 3),
    signedPower(lms[2], 1 / 3),
  ]);
  const lightness = reinhardKnee(lab[0], 0.7, 1, 2.2);
  const chroma = Math.hypot(lab[1], lab[2]);
  const hue = Math.atan2(lab[2], lab[1]);
  const maximum = Math.max(sampleCmax(setup, lightness, hue), 1e-9);
  const compressed = reinhardKnee(chroma / maximum, 0, 1, 6) * maximum;
  const adjustedLab: Vec3 = [lightness, compressed * Math.cos(hue), compressed * Math.sin(hue)];
  const adjustedLms = multiply3(setup.arrays.oklabLabToLms, adjustedLab);
  const adjustedXyz = multiply3(setup.arrays.oklabLmsToXyz, [
    adjustedLms[0] ** 3,
    adjustedLms[1] ** 3,
    adjustedLms[2] ** 3,
  ]);
  return multiply3(setup.arrays.xyzToSrgb, adjustedXyz);
}

export function encodeSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * signedPower(value, 1 / 2.4) - 0.055;
}

export function scanPaper(setup: PortraSetup, paperDensity: Float32Array): Float32Array {
  const receiver = createScanReceiver(setup);
  const output = new Float32Array(paperDensity.length);
  for (let offset = 0; offset < paperDensity.length; offset += 3) {
    const xyz = spectralIntegral(
      [paperDensity[offset], paperDensity[offset + 1], paperDensity[offset + 2]],
      setup.arrays.paperChannelDensity,
      setup.arrays.paperBaseDensity,
      receiver,
      setup.arrays.paperSpectralValidMask,
    );
    const linear = multiply3(setup.arrays.xyzD50ToSrgbCat02, xyz);
    const compressed = compressOklch(setup, linear);
    for (let channel = 0; channel < 3; channel += 1) {
      output[offset + channel] = encodeSrgb(compressed[channel]);
    }
  }
  return output;
}
