import { describe, expect, it } from 'vitest';
import {
  validateCanvasBudget,
  validateKodakStripBudget,
} from '../services/renderBudget';
import { createRuntimeRenderConfig } from '../services/runtimeConfig';

describe('canvas render budget', () => {
  it('accepts dimensions exactly at the default pixel limit', () => {
    expect(validateCanvasBudget(28_672, 6_400)).toEqual({
      ok: true,
      pixels: 183_500_800,
    });
  });

  it('rejects dimensions one pixel beyond the default pixel limit', () => {
    expect(validateCanvasBudget(183_500_801, 1, {
      maxEdge: Number.MAX_SAFE_INTEGER,
    })).toEqual({
      ok: false,
      pixels: 183_500_801,
      reason: 'max-pixels-exceeded',
    });
  });

  it('accepts the previously blocked 245.5 MiB strip canvas', () => {
    expect(validateCanvasBudget(8_000, 8_045)).toEqual({
      ok: true,
      pixels: 64_360_000,
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
    [1.5, 100],
    [Number.MAX_SAFE_INTEGER + 1, 1],
  ])('rejects invalid dimensions (%s, %s)', (width, height) => {
    expect(validateCanvasBudget(width, height)).toEqual({
      ok: false,
      pixels: 0,
      reason: 'invalid-dimensions',
    });
  });

  it.each([128, 700, 2_048])(
    'enforces the %i MiB threshold immediately below, at, and above it',
    (maxCanvasMiB) => {
      const limits = {
        ...createRuntimeRenderConfig(maxCanvasMiB, null).renderBudgetLimits,
        maxEdge: Number.MAX_SAFE_INTEGER,
      };
      const maxPixels = limits.maxPixels;
      if (maxPixels === undefined) throw new Error('Expected an exact pixel limit');

      expect(validateCanvasBudget(maxPixels - 1, 1, limits).ok).toBe(true);
      expect(validateCanvasBudget(maxPixels, 1, limits).ok).toBe(true);
      expect(validateCanvasBudget(maxPixels + 1, 1, limits)).toMatchObject({
        ok: false,
        reason: 'max-pixels-exceeded',
      });
    },
  );
});

describe('Kodak strip render budget', () => {
  it('accepts a four-frame high-resolution strip', () => {
    expect(validateKodakStripBudget(1_400, 4).ok).toBe(true);
  });

  it('accepts a 36-frame high-resolution strip within the larger budget', () => {
    expect(validateKodakStripBudget(1_400, 36).ok).toBe(true);
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
