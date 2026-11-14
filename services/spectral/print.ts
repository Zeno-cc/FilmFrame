import { sceneRgbToFilmRaw } from './film';
import { interpolateCurve, type Vec3 } from './math';
import type { PortraSetup } from './setup';

export function spectralIntegral(
  cmy: Vec3,
  channelDensity: Float64Array,
  baseDensity: Float64Array,
  illuminantTimesReceiver: Float64Array,
  validWavelengths: Float64Array,
): Vec3 {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let wavelength = 0; wavelength < 81; wavelength += 1) {
    const offset = wavelength * 3;
    const density = baseDensity[wavelength]
      + cmy[0] * channelDensity[offset]
      + cmy[1] * channelDensity[offset + 1]
      + cmy[2] * channelDensity[offset + 2];
    const transmitted = validWavelengths[wavelength] === 0 ? 0 : 10 ** -density;
    r += transmitted * illuminantTimesReceiver[offset];
    g += transmitted * illuminantTimesReceiver[offset + 1];
    b += transmitted * illuminantTimesReceiver[offset + 2];
  }
  return [r, g, b];
}

function combineIlluminantAndSensitivity(
  illuminant: Float64Array,
  sensitivityLog10: Float64Array,
  normalization = 1,
): Float64Array {
  const combined = new Float64Array(81 * 3);
  for (let index = 0; index < combined.length; index += 1) {
    combined[index] = illuminant[Math.floor(index / 3)] * 10 ** sensitivityLog10[index] / normalization;
  }
  return combined;
}

export interface PortraPrintSetup {
  enlargerReceiver: Float64Array;
  normalization: Float64Array;
}

export function preparePortraPrint(
  setup: PortraSetup,
  rawFilmCurves: Float64Array,
): PortraPrintSetup {
  const enlargerReceiver = combineIlluminantAndSensitivity(
    setup.arrays.filteredEnlarger,
    setup.arrays.paperLogSensitivity,
  );
  const normalization = new Float64Array(3);
  // Recompute with the actual unnormalized stock curves used by the reference.
  const rawMidGray = sceneRgbToFilmRaw(setup, 0.184, 0.184, 0.184, setup.arrays.midGrayToXyzReferenceCat16);
  const logMidGray: Vec3 = [
    Math.log10(rawMidGray[0] + 1e-10),
    Math.log10(rawMidGray[1] + 1e-10),
    Math.log10(rawMidGray[2] + 1e-10),
  ];
  const cmy: Vec3 = [
    interpolateCurve(logMidGray[0], setup.arrays.filmLogExposure, rawFilmCurves, 0),
    interpolateCurve(logMidGray[1], setup.arrays.filmLogExposure, rawFilmCurves, 1),
    interpolateCurve(logMidGray[2], setup.arrays.filmLogExposure, rawFilmCurves, 2),
  ];
  const midGrayRaw = spectralIntegral(cmy, setup.arrays.filmChannelDensity, setup.arrays.filmBaseDensity, enlargerReceiver, setup.arrays.filmSpectralValidMask);
  const geometricMean = Math.exp(midGrayRaw.reduce(
    (sum, value) => sum + Math.log(Math.max(value, 1e-10)), 0,
  ) / 3);
  normalization.fill(1 / geometricMean);
  return { enlargerReceiver, normalization };
}

export function exposePaper(
  setup: PortraSetup,
  printSetup: PortraPrintSetup,
  negativeDensity: Float32Array,
): Float32Array {
  const output = new Float32Array(negativeDensity.length);
  for (let offset = 0; offset < negativeDensity.length; offset += 3) {
    const raw = spectralIntegral(
      [negativeDensity[offset], negativeDensity[offset + 1], negativeDensity[offset + 2]],
      setup.arrays.filmChannelDensity,
      setup.arrays.filmBaseDensity,
      printSetup.enlargerReceiver,
      setup.arrays.filmSpectralValidMask,
    );
    for (let channel = 0; channel < 3; channel += 1) {
      output[offset + channel] = Math.log10(Math.max(raw[channel] * printSetup.normalization[channel], 0) + 1e-10);
    }
  }
  return output;
}

export function developPaper(setup: PortraSetup, paperLogExposure: Float32Array): Float32Array {
  const output = new Float32Array(paperLogExposure.length);
  for (let offset = 0; offset < paperLogExposure.length; offset += 3) {
    for (let channel = 0; channel < 3; channel += 1) {
      output[offset + channel] = interpolateCurve(
        paperLogExposure[offset + channel],
        setup.arrays.paperLogExposure,
        setup.arrays.paperFittedCurves,
        channel,
      );
    }
  }
  return output;
}

export function createScanReceiver(setup: PortraSetup): Float64Array {
  let normalization = 0;
  for (let wavelength = 0; wavelength < 81; wavelength += 1) {
    normalization += setup.arrays.d50[wavelength] * setup.arrays.cmfs[wavelength * 3 + 1];
  }
  const receiver = new Float64Array(81 * 3);
  for (let index = 0; index < receiver.length; index += 1) {
    receiver[index] = setup.arrays.d50[Math.floor(index / 3)] * setup.arrays.cmfs[index] / normalization;
  }
  return receiver;
}
