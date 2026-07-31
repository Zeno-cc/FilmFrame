import { describe, expect, it } from 'vitest';
import {
  BATCH_ADMISSION_LIMITS,
  MEBIBYTE,
  RGBA_BYTES_PER_PIXEL,
  evaluateBatchAdmission,
  formatBatchAdmission,
} from '../services/batchAdmission';
import { MAX_ZIP_INPUT_BYTES } from '../services/zip';

const image = (sourceWidth: number, sourceHeight: number) => ({ sourceWidth, sourceHeight });

describe('batch admission', () => {
  it('blocks an empty included subset with an actionable selection recovery', () => {
    const result = evaluateBatchAdmission({
      operation: 'process',
      includedImages: [],
      totalImageCount: 3,
    });

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'empty-selection',
      includedCount: 0,
      totalImageCount: 3,
      sourcePixels: 0,
    });
    expect(result.recommendations).toEqual(['select-images']);
    expect(formatBatchAdmission(result)).toContain('至少一张');
  });

  it('rejects invalid decoded source dimensions without throwing', () => {
    const result = evaluateBatchAdmission({
      operation: 'process',
      includedImages: [image(0, 1200)],
    });

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'invalid-source-dimensions',
      sourcePixels: 0,
    });
  });

  it('warns at the centralized source-pixel threshold and reports RGBA estimates', () => {
    const result = evaluateBatchAdmission({
      operation: 'process',
      includedImages: [image(8_000, 10_000)],
      totalImageCount: 12,
    });

    expect(result.status).toBe('warning');
    expect(result.reasons).toContain('source-pixels-warning');
    expect(result.reasons).toContain('working-set-warning');
    expect(result.includedCount).toBe(1);
    expect(result.totalImageCount).toBe(12);
    expect(result.sourcePixels).toBe(BATCH_ADMISSION_LIMITS.sourcePixelsWarning);
    expect(result.decodedSourceBytes).toBe(
      BATCH_ADMISSION_LIMITS.sourcePixelsWarning * RGBA_BYTES_PER_PIXEL,
    );
    expect(result.estimatedWorkingBytes).toBe(
      BATCH_ADMISSION_LIMITS.sourcePixelsWarning
        * RGBA_BYTES_PER_PIXEL
        * BATCH_ADMISSION_LIMITS.workingSetMultiplier,
    );
  });

  it('blocks a source set exceeding the cumulative source and work-set budgets', () => {
    const result = evaluateBatchAdmission({
      operation: 'process',
      includedImages: [image(16_000, 10_000)],
    });

    expect(result.status).toBe('blocked');
    expect(result.reasons).toContain('source-pixels-exceeded');
    expect(result.reasons).toContain('working-set-exceeded');
    expect(result.recommendations).toEqual([
      'select-images',
      'remove-largest-images',
      'use-preview-mode',
    ]);
  });

  it('uses the existing canvas hard budget before a strip allocation', () => {
    const result = evaluateBatchAdmission({
      operation: 'strip',
      includedImages: [image(1200, 800)],
      stripCanvas: { width: 28_672, height: 6_401 },
    });

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'strip-canvas-exceeded',
      stripCanvas: {
        pixels: 183_529_472,
        estimatedBytes: 183_529_472 * RGBA_BYTES_PER_PIXEL,
        budget: { ok: false, reason: 'max-pixels-exceeded' },
      },
    });
  });

  it('blocks a strip when its otherwise-warning source work set crosses the limit with the output canvas', () => {
    const result = evaluateBatchAdmission({
      operation: 'strip',
      includedImages: [image(11_000, 10_000)],
      stripCanvas: { width: 8_000, height: 8_000 },
    });

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'working-set-exceeded',
      stripCanvas: { budget: { ok: true } },
    });
    expect(result.reasons).toContain('source-pixels-warning');
    expect(result.reasons).toContain('working-set-exceeded');
    expect(result.estimatedWorkingBytes).toBe(
      110_000_000 * RGBA_BYTES_PER_PIXEL * BATCH_ADMISSION_LIMITS.workingSetMultiplier
        + 64_000_000 * RGBA_BYTES_PER_PIXEL,
    );
  });

  it('keeps ZIP admission pending until artifact Blob sizes are available', () => {
    const result = evaluateBatchAdmission({
      operation: 'zip',
      includedImages: [image(1200, 800)],
    });

    expect(result).toMatchObject({
      status: 'ok',
      reason: undefined,
      zipInputBytes: undefined,
    });
  });

  it('does not block ZIP export on source decode pressure that is not part of archive creation', () => {
    const result = evaluateBatchAdmission({
      operation: 'zip',
      includedImages: [image(16_000, 10_000)],
      zipInputBytes: 1024,
    });

    expect(result).toMatchObject({
      status: 'ok',
      sourcePixels: 160_000_000,
      estimatedWorkingBytes: 0,
      zipInputBytes: 1024,
    });
  });

  it('warns near the ZIP budget and blocks only bytes beyond the existing hard limit', () => {
    const nearLimit = evaluateBatchAdmission({
      operation: 'zip',
      includedImages: [image(1200, 800)],
      zipInputBytes: 192 * MEBIBYTE,
    });
    const atLimit = evaluateBatchAdmission({
      operation: 'zip',
      includedImages: [image(1200, 800)],
      zipInputBytes: MAX_ZIP_INPUT_BYTES,
    });
    const oversized = evaluateBatchAdmission({
      operation: 'zip',
      includedImages: [image(1200, 800)],
      zipInputBytes: MAX_ZIP_INPUT_BYTES + 1,
    });

    expect(nearLimit).toMatchObject({
      status: 'warning',
      reason: 'zip-input-warning',
    });
    expect(atLimit).toMatchObject({
      status: 'warning',
      reason: 'zip-input-warning',
    });
    expect(oversized).toMatchObject({
      status: 'blocked',
      reason: 'zip-input-exceeded',
    });
  });
});
