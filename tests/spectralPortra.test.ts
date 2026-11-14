import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from './fixtures/spectral/manifest.json';
import { readLittleEndianFloat64Npy } from './spectralNpy';
import { createPortraPipeline, DEFAULT_SPECTRAL_LIMITS, renderLinearProPhotoRgba, renderPortraStages } from '../services/spectral/portraPipeline';
import { srgbByteToLinearProPhoto, decodeSrgbChannel } from '../services/spectral/inputColor';
import { decodePortraSetupResource } from '../services/spectral/setup';
import { portraResource, portraResourceIntegrity } from '../services/spectral/resources/portraResource';
import type { RgbImage } from '../services/spectral/types';

function fixture(name: string) {
  return readLittleEndianFloat64Npy(resolve(__dirname, 'fixtures/spectral', `${name}.npy`));
}

function grayRamp(): RgbImage {
  const pixels = new Float32Array(16 * 16 * 3);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const value = 0.01 + x * 0.99 / 15;
      pixels.fill(value, (y * 16 + x) * 3, (y * 16 + x + 1) * 3);
    }
  }
  return { width: 16, height: 16, pixels };
}

function greenPatch(): RgbImage {
  const pixels = new Float32Array(8 * 8 * 3);
  for (let pixel = 0; pixel < 64; pixel += 1) pixels.set([0.05, 0.4, 0.05], pixel * 3);
  return { width: 8, height: 8, pixels };
}

function errors(actual: Float32Array, expected: Float64Array) {
  let maxAbs = 0;
  let sum = 0;
  let violations = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const difference = Math.abs(actual[index] - expected[index]);
    maxAbs = Math.max(maxAbs, difference);
    sum += difference;
    if (difference > 1e-6 + 1.5e-3 * Math.abs(expected[index])) violations += 1;
  }
  return { maxAbs, meanAbs: sum / expected.length, violations };
}

function verifyFixtureIntegrity(): void {
  for (const [id, entry] of Object.entries(manifest.baselines)) {
    const decoded = fixture(id);
    expect(decoded.shape).toEqual(entry.shape);
    expect(decoded.payloadSha256).toBe(entry.outputPayloadSha256);
  }
  for (const [id, entry] of Object.entries(manifest.intermediates)) {
    const decoded = fixture(id);
    expect(decoded.shape).toEqual(entry.shape);
    expect(decoded.payloadSha256).toBe(entry.outputPayloadSha256);
  }
}

describe('Portra spectral reference resources', () => {
  it('verifies baseline and intermediate shape/dtype/payload identity', () => {
    verifyFixtureIntegrity();
  });

  it('records measured OkLch configuration and unresolved dark-gray failure', () => {
    expect(manifest.baselines.print_rgb_portra_endura_green_patch8.recomputed).toMatchObject({
      algorithm: 'oklch', passes: true, violations: 0,
    });
    expect(manifest.baselines.print_rgb_portra_endura_gray_ramp16.recomputed).toMatchObject({
      algorithm: 'oklch', passes: false, violations: 48,
    });
  });
});

describe('isolated Float32Array Portra pipeline', () => {
  it('matches film_raw and negative_density within the pinned tolerance', () => {
    const result = renderPortraStages(grayRamp(), createPortraPipeline(portraResource));
    expect(errors(result.filmRaw, fixture('film_raw_portra_endura_gray_ramp16').values).violations).toBe(0);
    expect(errors(result.negativeDensity, fixture('negative_density_portra_endura_gray_ramp16').values).violations).toBe(0);
    expect(errors(result.paperLogExposure, fixture('gray_ramp_16.paperLogExposure').values).maxAbs).toBeLessThan(0.0001);
    expect(errors(result.paperDensity, fixture('gray_ramp_16.paperDensity').values).violations).toBe(0);
  });

  it('matches the current green print pipeline within the pinned tolerance', () => {
    const result = renderPortraStages(greenPatch(), createPortraPipeline(portraResource));
    expect(errors(result.printRgb, fixture('print_rgb_portra_endura_green_patch8').values).violations).toBe(0);
    expect(errors(result.printRgb, fixture('green_patch_8.printRgb').values).violations).toBe(0);
  });

  it('keeps the historical mismatch confined to the known dark column', () => {
    const result = renderPortraStages(grayRamp(), createPortraPipeline(portraResource));
    const current = errors(result.printRgb, fixture('gray_ramp_16.printRgb').values);
    const historical = errors(result.printRgb, fixture('print_rgb_portra_endura_gray_ramp16').values);
    const nonDarkActual = new Float32Array(16 * 15 * 3);
    const nonDarkExpected = new Float64Array(16 * 15 * 3);
    const expected = fixture('print_rgb_portra_endura_gray_ramp16').values;
    for (let y = 0; y < 16; y += 1) {
      nonDarkActual.set(result.printRgb.subarray((y * 16 + 1) * 3, (y + 1) * 16 * 3), y * 15 * 3);
      nonDarkExpected.set(expected.subarray((y * 16 + 1) * 3, (y + 1) * 16 * 3), y * 15 * 3);
    }
    expect(current.maxAbs).toBeLessThan(0.0001);
    expect(errors(nonDarkActual, nonDarkExpected).violations).toBe(0);
    expect(historical.violations).toBe(48);
    expect(manifest.baselines.print_rgb_portra_endura_gray_ramp16.recomputed.passes).toBe(false);
  });

  it('converts sRGB input through transfer decoding and ProPhoto primaries', async () => {
    await portraResourceIntegrity;
    const pipeline = createPortraPipeline(portraResource);
    expect(decodeSrgbChannel(0.04045)).toBe(0.04045 / 12.92);
    expect(decodeSrgbChannel(0.5)).toBeCloseTo(0.21404114048223255, 12);
    const white = srgbByteToLinearProPhoto(pipeline.setup, 255, 255, 255);
    expect(white[0]).toBeCloseTo(1.0002467779346262, 10);
    expect(white[1]).toBeCloseTo(0.999934941771564, 10);
    expect(white[2]).toBeCloseTo(1.0002209135817952, 10);
    const color = srgbByteToLinearProPhoto(pipeline.setup, 64, 128, 191);
    expect(color[0]).toBeCloseTo(0.17078792974933804, 10);
    expect(color[1]).toBeCloseTo(0.20693357492224185, 10);
    expect(color[2]).toBeCloseTo(0.48089478417095993, 10);
  });

  it('preserves legacy calibration and rejects incomplete declared calibration', () => {
    const legacy = decodePortraSetupResource(portraResource);
    expect(legacy.arrays.midGrayToXyzReferenceCat16).toEqual(legacy.arrays.proPhotoToXyzD55Cat16);
    const declared = structuredClone(portraResource) as unknown as Record<string, unknown>;
    declared.resourceKind = 'spectral-stock-setup';
    delete (declared.arrays as Record<string, unknown>).midGrayToXyzReferenceCat16;
    (declared.configuration as Record<string, unknown>).midGrayInputColorSpace = 'sRGB';
    expect(() => decodePortraSetupResource(declared)).toThrow('exact transform');
  });

  it('rejects malformed resource masks, curve axes and digest metadata', () => {
    const invalidMask = structuredClone(portraResource);
    invalidMask.arrays.filmSpectralValidMask.values = invalidMask.arrays.filmSpectralValidMask.values.map((value, index) => index === 0 ? 0.5 : value);
    expect(() => decodePortraSetupResource(invalidMask)).toThrow('wavelength mask');
    const invalidAxis = structuredClone(portraResource);
    invalidAxis.arrays.filmLogExposure.values = invalidAxis.arrays.filmLogExposure.values.map((value, index) => index === 2 ? invalidAxis.arrays.filmLogExposure.values[1] : value);
    expect(() => decodePortraSetupResource(invalidAxis)).toThrow('strictly increasing');
    const invalidDigest = structuredClone(portraResource);
    invalidDigest.arrays.filmRawCurves.payloadSha256 = 'invalid';
    expect(() => decodePortraSetupResource(invalidDigest)).toThrow('digest');
  });

  it('preserves each source alpha byte and is deterministic', () => {
    const source = { width: 2, height: 1, pixels: new Uint8ClampedArray([
      47, 102, 13, 0, 128, 26, 230, 79,
    ]) };
    const alpha = [0, 79];
    const first = renderLinearProPhotoRgba(source, createPortraPipeline(portraResource));
    const second = renderLinearProPhotoRgba(source, createPortraPipeline(portraResource));
    expect(Array.from(first.pixels.filter((_, index) => index % 4 === 3))).toEqual(alpha);
    expect(first.pixels).toEqual(second.pixels);
    expect(source.pixels[3]).toBe(0);
    expect(source.pixels[7]).toBe(79);
  });

  it('rejects malformed and non-finite input before allocation', () => {
    expect(() => renderPortraStages({ width: 0, height: 1, pixels: new Float32Array() }, createPortraPipeline(portraResource))).toThrow(RangeError);
    expect(() => renderPortraStages({ width: 1, height: 1, pixels: new Float32Array(2) }, createPortraPipeline(portraResource))).toThrow(RangeError);
    expect(() => renderPortraStages({ width: 1, height: 1, pixels: new Float32Array([0, Number.NaN, 0]) }, createPortraPipeline(portraResource))).toThrow(RangeError);
    expect(() => renderPortraStages(grayRamp(), createPortraPipeline(portraResource), { ...DEFAULT_SPECTRAL_LIMITS, maxPixels: 255 })).toThrow('pixel budget');
    expect(() => renderPortraStages(grayRamp(), createPortraPipeline(portraResource), { ...DEFAULT_SPECTRAL_LIMITS, maxWorkingSetBytes: 1 })).toThrow('working set');
    const pipeline = createPortraPipeline(portraResource);
    const onePixel = { width: 1, height: 1, pixels: new Float32Array([0.18, 0.18, 0.18]) };
    const exactBytes = 7 * 3 * 4 + 81 * 3 * 8;
    expect(() => renderPortraStages(onePixel, pipeline, { maxPixels: 1, maxWorkingSetBytes: exactBytes - 1 })).toThrow('working set');
    const accepted = renderPortraStages(onePixel, pipeline, { maxPixels: 1, maxWorkingSetBytes: exactBytes });
    expect(accepted.allocation.workingArrayBytes).toBe(exactBytes);
  });

  it('creates no additional default application integration', () => {
    const pipeline = createPortraPipeline(portraResource);
    expect(pipeline.setup.resource.source.redistribution).toContain('BLOCKED');
    expect(pipeline.setup.resource.configuration.outputGamutAlgorithm).toBe('oklch');
  });
});
