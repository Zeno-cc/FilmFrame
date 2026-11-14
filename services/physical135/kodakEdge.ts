import { FilmType } from '../../types';
import { physicalEdgeForFilm } from './edgeRegistry';

// Adapted from SpektraLab's overscan edge-print model, GPL-3.0-or-later.
// Source: JamesQiu2005/SpektraLab@02d82b56 (engine/src/pipeline/overscan.cpp).
// Browser adaptation: film-mm geometry, deterministic JS seeds, Canvas imprint
// masks and spectral exposure instead of CoreText/CoreGraphics/vImage.

export type EdgeText = 'text' | 'rect' | 'arrow' | 'dot';
export interface ImprintOp {
  kind: EdgeText;
  s: number;
  t: number;
  text?: string;
  cap?: number;
  bold?: boolean;
  fontFamily?: 'mono' | 'sans';
  xScale?: number;
  tracking?: number;
  s1?: number;
  t1?: number;
  head?: number;
  halfHeight?: number;
  radius?: number;
}

const EDGE_TEXT: Partial<Record<FilmType, string>> = {
  [FilmType.KODAK_GOLD_200]: 'KODAK GB 200-7',
  [FilmType.KODAK_PORTRA_160]: 'KODAK PORTRA 160',
  [FilmType.KODAK_PORTRA_400]: 'KODAK PORTRA 400',
  [FilmType.KODAK_PORTRA_800]: 'KODAK PORTRA 800-3',
  [FilmType.KODAK_PORTRA_800_PUSH1]: 'KODAK PORTRA 800-3',
  [FilmType.KODAK_PORTRA_800_PUSH2]: 'KODAK PORTRA 800-3',
  [FilmType.KODAK_ULTRAMAX_400]: 'KODAK GC 400',
  [FilmType.KODAK_EKTAR_100]: 'KODAK EKTAR 100',
};

const DX_EXTRACT: Partial<Record<FilmType, number>> = {
  [FilmType.KODAK_PORTRA_400]: 1277,
  [FilmType.KODAK_PORTRA_800]: 1278,
  [FilmType.KODAK_PORTRA_800_PUSH1]: 1278,
  [FilmType.KODAK_PORTRA_800_PUSH2]: 1278,
  [FilmType.KODAK_PORTRA_160]: 1534,
  [FilmType.KODAK_GOLD_200]: 1548,
  [FilmType.KODAK_EKTAR_100]: 1307,
  [FilmType.KODAK_ULTRAMAX_400]: 1313,
  [FilmType.FUJI_C200]: 1550,
};

export function kodakEdgeText(stock: FilmType): string {
  return physicalEdgeForFilm(stock)?.text ?? stock;
}

export function dxBits(dxExtract: number, frame: number, half: boolean): number[] {
  const bits = Array.from({ length: 23 }, () => 0);
  const part1 = (dxExtract >> 4) & 0x7f;
  const part2 = dxExtract & 0xf;
  for (let index = 0; index < 7; index += 1) bits[1 + index] = (part1 >> (6 - index)) & 1;
  for (let index = 0; index < 4; index += 1) bits[9 + index] = (part2 >> (3 - index)) & 1;
  for (let index = 0; index < 6; index += 1) bits[13 + index] = (Math.max(0, Math.min(63, frame)) >> (5 - index)) & 1;
  bits[19] = half ? 1 : 0;
  let sum = 0;
  for (let index = 0; index < 21; index += 1) sum += bits[index];
  bits[21] = sum % 2;
  return bits;
}

export function dxModules(dxExtract: number, frame: number, half: boolean): { clock: number[]; data: number[] } {
  const bits = dxBits(dxExtract, frame, half);
  return {
    clock: Array.from({ length: 31 }, (_, index) => index < 5 || index >= 28 ? 1 : (index - 5) % 2),
    data: Array.from({ length: 31 }, (_, index) => index < 5 ? index % 2 === 0 ? 1 : 0 : index >= 28 ? (index - 28) % 2 === 0 ? 1 : 0 : bits[index - 5]),
  };
}

function fitEdgeText(text: string, slot: number, cap: number, light: boolean): string {
  const size = cap / 0.714;
  const maxCharacters = Math.max(1, Math.floor(slot / (0.68 * size + (light ? 0.04 : 0.06))));
  if (text.length <= maxCharacters) return text;
  const cut = text.lastIndexOf(' ', maxCharacters);
  return cut > 0 ? text.slice(0, cut) : text.slice(0, maxCharacters);
}

export function createKodakImprints(stock: FilmType, frameNumber: number, perfPhase: number, filmWidth = 35, advanceOrigin = 0, gateOrigin = 0.875, span = 38): ImprintOp[] {
  const ops: ImprintOp[] = [];
  const dx = physicalEdgeForFilm(stock)?.dx;
  const text = kodakEdgeText(stock);
  const module = (physicalEdgeForFilm(stock)?.dxLength ?? 12.7) / 31;
  const clockT = filmWidth - 2.17;
  const dataT = filmWidth - 0.87;
  const grid0 = perfPhase + 0.62;
  for (let grid = Math.floor((gateOrigin - grid0) / 19) - 1; grid <= Math.ceil((gateOrigin + span - grid0) / 19) + 1; grid += 1) {
    const s = grid0 + 19 + grid * 19;
    const half = 2 * frameNumber + grid;
    const number = Math.floor(half / 2);
    const aHalf = half % 2 !== 0;
    const light = physicalEdgeForFilm(stock)?.lightNumbers === true;
    const cap = light ? 1.07 : 1.22;
    if (aHalf) {
      const start = s + (light ? 5.1 : 6.4);
      const slot = 19 + 16.9 - (start - s) - 2;
      ops.push({ kind: 'text', s: start, t: light ? 1.69 : 1.53, text: fitEdgeText(text, slot, cap, light), cap, bold: true, tracking: light ? 0.04 : 0.06 });
    } else ops.push({ kind: 'text', s: s + 16.9, t: light ? 1.69 : 1.53, text: String(number), cap, bold: !light, xScale: light ? 1 : 1.25, tracking: light ? 0.04 : 0.25 });
    if (dx !== undefined) {
      const modules = dxModules(dx, number, aHalf);
      for (const [track, row] of [modules.clock, modules.data].entries()) {
        const t = track === 0 ? clockT : dataT;
        const t1 = track === 0 ? dataT : filmWidth + 0.1;
        for (let index = 0; index < 31;) {
          if (!row[index]) { index += 1; continue; }
          let end = index;
          while (end < 31 && row[end]) end += 1;
          ops.push({ kind: 'rect', s: s + index * module, t, s1: s + end * module, t1: t1 + (track === 0 ? 0.01 : 0) });
          index = end;
        }
      }
    }
    if (aHalf) {
      ops.push({ kind: 'text', s: s + 15.3, t: filmWidth - 0.84, text: `${number}A`, cap: light ? 1.40 : 0.90, bold: !light, xScale: light ? 1 : 1.25, tracking: light ? 0.03 : 0.25 });
      ops.push({ kind: 'arrow', s: s + 14.47, t: filmWidth - 0.28, s1: s + 18.07, head: 0.6, halfHeight: 0.26 });
    } else {
      ops.push({ kind: 'text', s: s + 16.0, t: filmWidth - 0.14, text: String(number), cap: 1.40, bold: !light, xScale: light ? 1 : 1.25, tracking: light ? 0.03 : 0.25 });
    }
  }
  return ops;
}
