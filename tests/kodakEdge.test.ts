import { describe, expect, it } from 'vitest';
import { FilmType } from '../types';
import { createKodakImprints, dxBits, dxModules, kodakEdgeText } from '../services/physical135/kodakEdge';

// Source formula independently exercised from SpektraLab's pinned GPL overscan model.
describe('Kodak film-edge imprints', () => {
  it('encodes Portra 400 DX identity, frame and half-frame parity', () => {
    const bits = dxBits(1277, 1, true);
    expect(bits.slice(1, 8)).toEqual([1, 0, 0, 1, 1, 1, 1]);
    expect(bits.slice(9, 13)).toEqual([1, 1, 0, 1]);
    expect(bits.slice(13, 19)).toEqual([0, 0, 0, 0, 0, 1]);
    expect(bits[19]).toBe(1);
    expect(bits.slice(0, 21).reduce((sum, bit) => sum + bit, 0) % 2).toBe(bits[21]);
    const modules = dxModules(1277, 1, true);
    expect(modules.clock).toHaveLength(31);
    expect(modules.data).toHaveLength(31);
    expect(modules.clock.slice(0, 5)).toEqual([1, 1, 1, 1, 1]);
    expect(modules.clock.slice(-3)).toEqual([1, 1, 1]);
  });

  it('uses the actual Portra stock name and alternating half-frame layout', () => {
    expect(kodakEdgeText(FilmType.KODAK_PORTRA_400)).toBe('KODAK PORTRA 400');
    const ops = createKodakImprints(FilmType.KODAK_PORTRA_400, 1, 0);
    const labels = ops.filter(op => op.kind === 'text').map(op => op.text);
    expect(labels).toContain('KODAK PORTRA 400');
    expect(labels).toContain('1A');
    expect(labels).toContain('1');
    const modules = ops.filter(op => op.kind === 'rect');
    expect(modules.length).toBeGreaterThan(0);
    expect(modules.every(op => Math.abs(op.s1! - op.s) <= 12.7 + 1e-8)).toBe(true);
    expect(ops.some(op => op.kind === 'arrow')).toBe(true);
    for (const op of ops) {
      expect(Number.isFinite(op.s)).toBe(true);
      expect(Number.isFinite(op.t)).toBe(true);
      if (op.s1 !== undefined) expect(Number.isFinite(op.s1)).toBe(true);
    }
    const currentName = ops.find(op => op.text === 'KODAK PORTRA 400');
    expect(currentName!.s).toBeGreaterThan(0);
    expect(currentName!.s).toBeLessThan(38);
  });

  it('uses C200 light numerals and bounds long Kodak-family stock names', () => {
    const c200 = createKodakImprints(FilmType.FUJI_C200, 1, -3.3);
    expect(c200.find(op => op.text === '1')?.bold).toBe(false);
    expect(c200.find(op => op.text === '1')?.cap).toBe(1.07);
    expect(c200.find(op => op.text === 'FUJI 200' && op.s > 39)?.s).toBeCloseTo(-3.3 + 0.62 + 38 + 5.1, 8);
    const trix = createKodakImprints(FilmType.KODAK_TRI_X_400, 1, -3.3);
    expect(trix.find(op => op.text === '1')?.bold).toBe(false);
    expect(trix.find(op => op.text === 'KODAK 400TX')?.bold).toBe(true);
    const proImage = createKodakImprints(FilmType.KODAK_PROIMAGE_100, 1, -3.3);
    const name = proImage.find(op => op.kind === 'text' && op.t < 2 && op.text?.startsWith('KODAK'))!;
    expect(name.text).toBe('KODAK PRO IMAGE 100');
    expect(name.s).toBeCloseTo(-3.3 + 0.62 + 6.4, 8);
    const slot = 19 + 16.9 - 6.4 - 2;
    expect(name.text!.length * (0.68 * name.cap! / 0.714 + name.tracking!)).toBeLessThanOrEqual(slot);
    expect(proImage.some(op => op.kind === 'text' && op.text === 'KODAK PRO IMAGE 100')).toBe(true);
  });
});
