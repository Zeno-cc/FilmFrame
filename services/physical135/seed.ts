import type { BodyVariation, FrameVariation } from './plan';

export type SeedDomain = 'body' | 'frame' | 'fog' | 'leaks' | 'material';

export function hashSeed(seed: number, domain: SeedDomain): number {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Physical film seed must be an unsigned 32-bit integer');
  }
  let value = (seed ^ 0x9e3779b9) >>> 0;
  for (let index = 0; index < domain.length; index += 1) {
    value = Math.imul(value ^ domain.charCodeAt(index), 0x85ebca6b) >>> 0;
    value ^= value >>> 13;
  }
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

export function seedUnit(seed: number, domain: SeedDomain, index = 0): number {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Seed index must be a nonnegative integer');
  return hashSeed((seed + Math.imul(index, 0x9e3779b1)) >>> 0, domain) / 0x100000000;
}

export function nextPhysicalSeed(seed: number): number {
  return (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
}

function centered(seed: number, domain: SeedDomain, index: number, amplitude: number): number {
  return (seedUnit(seed, domain, index) * 2 - 1) * amplitude;
}

export function createBodyVariation(seed: number): BodyVariation {
  return {
    gateOffset: { s: centered(seed, 'body', 0, 0.08), t: centered(seed, 'body', 1, 0.1) },
    gateRadii: [0, 1, 2, 3].map(index => 0.10 + seedUnit(seed, 'body', index + 2) * 0.28) as unknown as BodyVariation['gateRadii'],
    registration: centered(seed, 'body', 6, 0.035),
    perforationPhase: -3.3 + centered(seed, 'body', 7, 0.7),
  };
}

export function createFrameVariation(seed: number, straighten: number): FrameVariation {
  return {
    straightenDegrees: straighten,
    weave: centered(seed, 'frame', 0, 0.025),
    scanOffset: { s: centered(seed, 'frame', 1, 0.04), t: centered(seed, 'frame', 2, 0.025) },
  };
}
