import { describe, expect, it } from 'vitest';
import {
  validateCanvasBudget,
  validateKodakStripBudget,
} from '../services/renderBudget';

describe('canvas render budget', () => {
  it('accepts dimensions exactly at the default pixel limit', () => {
    expect(validateCanvasBudget(8_000, 8_000)).toEqual({
      ok: true,
      pixels: 64_000_000,
    });
  });

  it('rejects dimensions one pixel beyond the default pixel limit', () => {
    expect(validateCanvasBudget(8_000, 8_001)).toEqual({
      ok: false,
      pixels: 64_008_000,
      reason: 'max-pixels-exceeded',
    });
  });

  it('accepts an edge exactly at the default edge limit', () => {
    expect(validateCanvasBudget(32_767, 1).ok).toBe(true);
  });

  it('rejects an edge one pixel beyond the default edge limit', () => {
    expect(validateCanvasBudget(32_768, 1)).toEqual({
      ok: false,
      pixels: 32_768,
      reason: 'max-edge-exceeded',
    });
  });

  it.each([
    [0, 100],
    [-1, 100],
    [100, 0],
    [Number.NaN, 100],
    [100, Number.POSITIVE_INFINITY],
  ])('rejects invalid dimensions (%s, %s)', (width, height) => {
    expect(validateCanvasBudget(width, height)).toEqual({
      ok: false,
      pixels: 0,
      reason: 'invalid-dimensions',
    });
  });
});

describe('Kodak strip render budget', () => {
  it('accepts a four-frame high-resolution strip', () => {
    expect(validateKodakStripBudget(1_400, 4).ok).toBe(true);
  });

  it('rejects a 36-frame high-resolution strip by pixel area', () => {
    expect(validateKodakStripBudget(1_400, 36)).toMatchObject({
      ok: false,
      reason: 'max-pixels-exceeded',
    });
  });

  it('rejects an 81-frame high-resolution strip', () => {
    expect(validateKodakStripBudget(1_400, 81).ok).toBe(false);
  });

  it.each([
    [0, 4, 4],
    [1_400, 0, 4],
    [1_400, 1.5, 4],
    [1_400, 4, 0],
  ])('rejects invalid strip input (%s, %s, %s)', (targetWidth, frameCount, maxPerRow) => {
    expect(validateKodakStripBudget(targetWidth, frameCount, maxPerRow)).toEqual({
      ok: false,
      pixels: 0,
      reason: 'invalid-dimensions',
    });
  });
});
