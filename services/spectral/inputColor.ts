import { multiply3 } from './math';
import type { PortraSetup } from './setup';

/** Decode the sRGB electro-optical transfer function to linear-light values. */
export function decodeSrgbChannel(value: number): number {
  if (value <= 0.04045) return value / 12.92;
  return ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * Convert an sRGB display byte to scene-linear ProPhoto RGB.
 * Alpha is deliberately outside this color transform.
 */
export function srgbByteToLinearProPhoto(
  setup: PortraSetup,
  red: number,
  green: number,
  blue: number,
): readonly [number, number, number] {
  const linearSrgb: readonly [number, number, number] = [
    decodeSrgbChannel(red / 255),
    decodeSrgbChannel(green / 255),
    decodeSrgbChannel(blue / 255),
  ];
  return multiply3(setup.arrays.srgbToProPhoto, linearSrgb);
}
