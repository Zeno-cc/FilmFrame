export type Vec3 = readonly [number, number, number];
export type Mat3 = ArrayLike<number>;

export function multiply3(matrix: Mat3, vector: Vec3): Vec3 {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ];
}

export function signedPower(value: number, exponent: number): number {
  return Math.sign(value) * Math.abs(value) ** exponent;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function interpolateCurve(
  value: number,
  axis: Float64Array,
  values: Float64Array,
  channel: number,
): number {
  if (value <= axis[0]) return values[channel];
  const last = axis.length - 1;
  if (value >= axis[last]) return values[last * 3 + channel];
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const middle = (low + high) >>> 1;
    if (axis[middle] <= value) low = middle;
    else high = middle;
  }
  const fraction = (value - axis[low]) / (axis[low + 1] - axis[low]);
  const lowerValue = values[low * 3 + channel];
  return lowerValue + fraction * (values[(low + 1) * 3 + channel] - lowerValue);
}

function mitchellWeight(value: number): number {
  const x = Math.abs(value);
  const b = 1 / 3;
  const c = 1 / 3;
  if (x < 1) {
    return ((12 - 9 * b - 6 * c) * x ** 3 + (-18 + 12 * b + 6 * c) * x ** 2 + 6 - 2 * b) / 6;
  }
  if (x < 2) {
    return ((-b - 6 * c) * x ** 3 + (6 * b + 30 * c) * x ** 2 + (-12 * b - 48 * c) * x + 8 * b + 24 * c) / 6;
  }
  return 0;
}

function reflectedIndex(index: number, length: number): number {
  if (index < 0) return -index;
  if (index >= length) return 2 * (length - 1) - index;
  return index;
}

function cubicCell(coordinate: number, length: number): [number, number] {
  const clamped = clamp(coordinate, 0, length - 1);
  if (clamped >= length - 1) return [length - 2, 1];
  const base = Math.floor(clamped);
  return [base, clamped - base];
}

/** Mitchell 2D interpolation with the same reflected edge behavior as upstream. */
export function sampleFilmTcLut(
  lut: Float64Array,
  side: number,
  tx: number,
  ty: number,
): Vec3 {
  const [xBase, xFraction] = cubicCell(tx * (side - 1), side);
  const [yBase, yFraction] = cubicCell(ty * (side - 1), side);
  const wx = [mitchellWeight(xFraction + 1), mitchellWeight(xFraction), mitchellWeight(xFraction - 1), mitchellWeight(xFraction - 2)];
  const wy = [mitchellWeight(yFraction + 1), mitchellWeight(yFraction), mitchellWeight(yFraction - 1), mitchellWeight(yFraction - 2)];
  const out = [0, 0, 0];
  let weightSum = 0;
  for (let xIndex = 0; xIndex < 4; xIndex += 1) {
    const x = reflectedIndex(xBase - 1 + xIndex, side);
    for (let yIndex = 0; yIndex < 4; yIndex += 1) {
      const y = reflectedIndex(yBase - 1 + yIndex, side);
      const weight = wx[xIndex] * wy[yIndex];
      const offset = (x * side + y) * 3;
      weightSum += weight;
      for (let channel = 0; channel < 3; channel += 1) out[channel] += weight * lut[offset + channel];
    }
  }
  if (weightSum === 0) return [0, 0, 0];
  return [out[0] / weightSum, out[1] / weightSum, out[2] / weightSum];
}
