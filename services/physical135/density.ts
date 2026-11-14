import type { Vec3 } from '../spectral/math';

export interface HoleDensitySolution {
  cmy: Vec3;
  maxBaseResidual: number;
  validWavelengths: number;
}

export function solveMonochromeHoleDensity(
  channelDensity: ArrayLike<number>,
  baseDensity: ArrayLike<number>,
  validWavelengths: ArrayLike<number>,
): HoleDensitySolution {
  if (channelDensity.length !== baseDensity.length * 3 || baseDensity.length !== validWavelengths.length) {
    throw new RangeError('Hole-density spectral arrays have incompatible dimensions');
  }
  let weight = 0;
  let target = 0;
  let valid = 0;
  for (let wavelength = 0; wavelength < baseDensity.length; wavelength += 1) {
    if (validWavelengths[wavelength] !== 1) continue;
    const channels = [0, 1, 2].map(channel => channelDensity[wavelength * 3 + channel]);
    if (channels.some(channel => Math.abs(channel - channels[0]) > 1e-12)) {
      throw new RangeError('Monochrome hole density requires one shared silver-density channel');
    }
    const coefficient = channels[0];
    if (!Number.isFinite(coefficient) || coefficient <= 0 || !Number.isFinite(baseDensity[wavelength])) {
      throw new RangeError('Monochrome hole-density inputs must be finite and positive');
    }
    weight += coefficient * coefficient;
    target -= coefficient * baseDensity[wavelength];
    valid += 1;
  }
  if (valid < 1 || weight <= 0) throw new RangeError('Monochrome hole density needs valid silver-density wavelengths');
  const silver = target / weight;
  const cmy: Vec3 = [silver, silver, silver];
  let maxBaseResidual = 0;
  for (let wavelength = 0; wavelength < baseDensity.length; wavelength += 1) {
    if (validWavelengths[wavelength] !== 1) continue;
    const residual = baseDensity[wavelength] + silver * channelDensity[wavelength * 3];
    maxBaseResidual = Math.max(maxBaseResidual, Math.abs(residual));
  }
  return { cmy, maxBaseResidual, validWavelengths: valid };
}

export function solveBaseCancelingHoleDensity(
  channelDensity: ArrayLike<number>,
  baseDensity: ArrayLike<number>,
  validWavelengths: ArrayLike<number>,
): HoleDensitySolution {
  if (channelDensity.length !== baseDensity.length * 3 || baseDensity.length !== validWavelengths.length) {
    throw new RangeError('Hole-density spectral arrays have incompatible dimensions');
  }
  const normal = Array.from({ length: 3 }, () => [0, 0, 0]);
  const target = [0, 0, 0];
  let valid = 0;
  for (let wavelength = 0; wavelength < baseDensity.length; wavelength += 1) {
    if (validWavelengths[wavelength] !== 1) continue;
    const base = baseDensity[wavelength];
    const channels = [0, 1, 2].map(channel => channelDensity[wavelength * 3 + channel]);
    if (![base, ...channels].every(Number.isFinite)) throw new RangeError('Hole-density inputs must be finite');
    valid += 1;
    for (let row = 0; row < 3; row += 1) {
      target[row] -= channels[row] * base;
      for (let column = 0; column < 3; column += 1) normal[row][column] += channels[row] * channels[column];
    }
  }
  if (valid < 3) throw new RangeError('At least three valid wavelengths are required to solve hole density');
  const matrix = normal.map((row, index) => [...row, target[index]]);
  const scale = normal.reduce((largest, row) => Math.max(largest, ...row.map(Math.abs)), 0);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    if (Math.abs(matrix[pivot][column]) <= 1e-12 * Math.max(scale, 1)) {
      throw new RangeError('Film dye matrix cannot produce a stable base-canceling hole density');
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    for (let row = column + 1; row < 3; row += 1) {
      const factor = matrix[row][column] / matrix[column][column];
      for (let index = column; index < 4; index += 1) matrix[row][index] -= factor * matrix[column][index];
    }
  }
  const solved = [0, 0, 0];
  for (let row = 2; row >= 0; row -= 1) {
    let value = matrix[row][3];
    for (let column = row + 1; column < 3; column += 1) value -= matrix[row][column] * solved[column];
    solved[row] = value / matrix[row][row];
  }
  const cmy: Vec3 = [solved[0], solved[1], solved[2]];
  if (!cmy.every(Number.isFinite)) throw new RangeError('Non-finite base-canceling hole density');
  let maxBaseResidual = 0;
  for (let wavelength = 0; wavelength < baseDensity.length; wavelength += 1) {
    if (validWavelengths[wavelength] !== 1) continue;
    let density = baseDensity[wavelength];
    for (let channel = 0; channel < 3; channel += 1) density += cmy[channel] * channelDensity[wavelength * 3 + channel];
    maxBaseResidual = Math.max(maxBaseResidual, Math.abs(density));
  }
  return { cmy, maxBaseResidual, validWavelengths: valid };
}

export function blendFilmPresence(
  negative: ArrayLike<number>,
  filmPresence: ArrayLike<number>,
  holeCmy: Vec3,
): Float32Array {
  if (negative.length % 3 !== 0 || filmPresence.length !== negative.length / 3) {
    throw new RangeError('Film-presence coverage must have one value per CMY pixel');
  }
  const result = new Float32Array(negative.length);
  for (let pixel = 0; pixel < filmPresence.length; pixel += 1) {
    const alpha = filmPresence[pixel];
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new RangeError('Film presence must be in [0, 1]');
    for (let channel = 0; channel < 3; channel += 1) {
      const index = pixel * 3 + channel;
      if (!Number.isFinite(negative[index])) throw new RangeError('Negative density must be finite');
      result[index] = alpha * negative[index] + (1 - alpha) * holeCmy[channel];
    }
  }
  return result;
}
