import { FilmType } from '../../types';
import { physicalEdgeForFilm } from './edgeRegistry';
import { dxModules, type ImprintOp } from './kodakEdge';

// Adapted from SpektraLab@02d82b56, GPL-3.0-or-later. These are separate
// stock-edge layouts, not alternative colors for one Kodak imprint template.

const GLYPHS: Record<string, number[]> = {
  '0': [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e], '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f], '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02], '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e], '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e], '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  A: [0x0e, 0x11, 0x11, 0x11, 0x1f, 0x11, 0x11], B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e], D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f], F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f], H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e], J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11], L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11], N: [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e], P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d], R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e], T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e], V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a], X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04], Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '-': [0, 0, 0, 0x1f, 0, 0, 0], '/': [0, 0x01, 0x02, 0x04, 0x08, 0x10, 0],
};

function matrix(text: string, cap: number, xScale: number, bold: boolean, s: number, baseT: number): ImprintOp[] {
  const ops: ImprintOp[] = [];
  const pitch = cap / 7;
  const width = pitch * xScale;
  const overlap = 0.02 * pitch;
  const columns = bold ? 6 : 5;
  let cursor = s;
  for (const character of text) {
    const glyph = GLYPHS[character.toUpperCase()];
    if (glyph) {
      for (let row = 0; row < 7; row += 1) {
        const bits = bold ? (glyph[row] << 1) | glyph[row] : glyph[row];
        const top = bold ? 0x20 : 0x10;
        for (let column = 0; column < columns;) {
          if (!(bits & (top >> column))) { column += 1; continue; }
          let end = column;
          while (end < columns && (bits & (top >> end))) end += 1;
          ops.push({
            kind: 'rect',
            s: cursor + column * width - overlap,
            t: baseT - (7 - row) * pitch - overlap,
            s1: cursor + end * width + overlap,
            t1: baseT - (6 - row) * pitch + overlap,
          });
          column = end;
        }
      }
    }
    cursor += character === ' ' ? 4 * width : (columns + 1) * width;
  }
  return ops;
}

function matrixWidth(text: string, cap: number, xScale: number, bold: boolean): number {
  const pitch = cap / 7 * xScale;
  let width = 0;
  for (const character of text) width += character === ' ' ? 4 * pitch : (bold ? 7 : 6) * pitch;
  return Math.max(0, width - pitch);
}

function fitMatrix(text: string, slot: number, cap: number, xScale: number, bold: boolean): string {
  let result = text;
  while (result && matrixWidth(result, cap, xScale, bold) > slot) {
    const cut = result.lastIndexOf(' ');
    result = cut > 0 ? result.slice(0, cut) : result.slice(0, -1);
  }
  return result;
}

const NAME_ROWS: Record<string, string[]> = {
  A: ['...#...', '..#.#..', '.#...#.', '#.....#', '#.....#', '#######', '#.....#', '#.....#', '#.....#'],
  B: ['######.', '#.....#', '#.....#', '#.....#', '######.', '#.....#', '#.....#', '#.....#', '######.'],
  C: ['.#####.', '#.....#', '#......', '#......', '#......', '#......', '#......', '#.....#', '.#####.'],
  D: ['#####..', '.#...#.', '.#....#', '.#....#', '.#....#', '.#....#', '.#....#', '.#...#.', '#####..'],
  E: ['#######', '#......', '#......', '#......', '#####..', '#......', '#......', '#......', '#######'],
  F: ['#######', '#......', '#......', '#......', '#####..', '#......', '#......', '#......', '#......'],
  G: ['.#####.', '#.....#', '#......', '#......', '#..####', '#.....#', '#.....#', '#.....#', '.#####.'],
  H: ['#.....#', '#.....#', '#.....#', '#.....#', '#######', '#.....#', '#.....#', '#.....#', '#.....#'],
  I: ['.###...', '..#....', '..#....', '..#....', '..#....', '..#....', '..#....', '..#....', '.###...'],
  J: ['....###', '.....#.', '.....#.', '.....#.', '.....#.', '.....#.', '#....#.', '.#..#..', '..##...'],
  K: ['#.....#', '#....#.', '#...#..', '#..#...', '###....', '#..#...', '#...#..', '#....#.', '#.....#'],
  L: ['#......', '#......', '#......', '#......', '#......', '#......', '#......', '#......', '#######'],
  M: ['#.....#', '##...##', '#.#.#.#', '#..#..#', '#..#..#', '#.....#', '#.....#', '#.....#', '#.....#'],
  N: ['#.....#', '##....#', '#.#...#', '#.#...#', '#..#..#', '#...#.#', '#...#.#', '#....##', '#.....#'],
  O: ['.#####.', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '.#####.'],
  P: ['######.', '#.....#', '#.....#', '#.....#', '######.', '#......', '#......', '#......', '#......'],
  Q: ['.#####.', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#...#.#', '#....#.', '.####.#'],
  R: ['######.', '#.....#', '#.....#', '#.....#', '######.', '#..#...', '#...#..', '#....#.', '#.....#'],
  S: ['.#####.', '#.....#', '#......', '#......', '.#####.', '......#', '......#', '#.....#', '.#####.'],
  T: ['#######', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...'],
  U: ['#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'],
  V: ['#.....#', '#.....#', '#.....#', '#.....#', '.#...#.', '.#...#.', '..#.#..', '..#.#..', '...#...'],
  W: ['#.....#', '#.....#', '#.....#', '#.....#', '#..#..#', '#..#..#', '#.#.#.#', '##...##', '#.....#'],
  X: ['#.....#', '#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#', '#.....#'],
  Y: ['#.....#', '#.....#', '.#...#.', '..#.#..', '...#...', '...#...', '...#...', '...#...', '...#...'],
  Z: ['#######', '......#', '.....#.', '....#..', '...#...', '..#....', '.#.....', '#......', '#######'],
  '0': ['.#####.', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '.#####.'],
  '1': ['...#...', '..##...', '.#.#...', '...#...', '...#...', '...#...', '...#...', '...#...', '.#####.'],
  '2': ['.#####.', '#.....#', '......#', '.....#.', '....#..', '...#...', '..#....', '.#.....', '#######'],
  '3': ['.#####.', '#.....#', '......#', '......#', '..####.', '......#', '......#', '#.....#', '.#####.'],
  '4': ['.....#.', '....##.', '...#.#.', '..#..#.', '.#...#.', '#....#.', '#######', '.....#.', '.....#.'],
  '5': ['#######', '#......', '#......', '#......', '######.', '......#', '......#', '#.....#', '.#####.'],
  '6': ['.#####.', '#.....#', '#......', '#......', '######.', '#.....#', '#.....#', '#.....#', '.#####.'],
  '7': ['#######', '......#', '.....#.', '....#..', '...#...', '..#....', '..#....', '..#....', '..#....'],
  '8': ['.#####.', '#.....#', '#.....#', '#.....#', '.#####.', '#.....#', '#.....#', '#.....#', '.#####.'],
  '9': ['.#####.', '#.....#', '#.....#', '#.....#', '.######', '......#', '......#', '#.....#', '.#####.'],
  '-': ['.......', '.......', '.......', '.......', '.#####.', '.......', '.......', '.......', '.......'],
};

const SMALL_ROWS: Record<string, string[]> = {
  '0': ['.######.', '########', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '########', '.######.'],
  '1': ['...##...', '..###...', '.####...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '.######.', '.######.'],
  '2': ['.######.', '########', '##....##', '......##', '.....###', '....###.', '...###..', '..###...', '.###....', '###.....', '########', '########'],
  '3': ['.######.', '########', '##....##', '......##', '......##', '..######', '..######', '......##', '......##', '##....##', '########', '.######.'],
  '4': ['.....###', '....####', '...#####', '..######', '.###.###', '###..###', '###..###', '###..###', '########', '########', '.....###', '.....###'],
  '5': ['########', '########', '##......', '##......', '#######.', '########', '......##', '......##', '......##', '##....##', '########', '.######.'],
  '6': ['.######.', '########', '##....##', '##......', '##......', '#######.', '########', '##....##', '##....##', '##....##', '########', '.######.'],
  '7': ['########', '########', '......##', '......##', '.....###', '....###.', '....##..', '...###..', '...##...', '...##...', '...##...', '...##...'],
  '8': ['.######.', '########', '##....##', '##....##', '##....##', '.######.', '.######.', '##....##', '##....##', '##....##', '########', '.######.'],
  '9': ['.######.', '########', '##....##', '##....##', '##....##', '########', '.#######', '......##', '......##', '##....##', '########', '.######.'],
  A: ['...##...', '..####..', '.######.', '###..###', '##....##', '##....##', '########', '########', '##....##', '##....##', '##....##', '##....##'],
};

interface DotFace {
  rows: Record<string, string[]>;
  columns: number;
  advance: number;
}

const FUJI_NAMES: DotFace = { rows: NAME_ROWS, columns: 7, advance: 9 };
const FUJI_SMALL: DotFace = { rows: SMALL_ROWS, columns: 8, advance: 10 };

function dotWidth(text: string, face: DotFace, pitchS: number): number {
  if (!text) return 0;
  let columns = 0;
  for (const character of text) columns += character === ' ' ? 4 : face.advance;
  return Math.max(0, columns - (face.advance - face.columns + 1)) * pitchS + 0.114;
}

function fitDots(text: string, face: DotFace, pitchS: number, slot: number): string {
  let result = text;
  while (result && dotWidth(result, face, pitchS) > slot) {
    const cut = result.lastIndexOf(' ');
    result = cut > 0 ? result.slice(0, cut) : result.slice(0, -1);
  }
  return result;
}

function dots(text: string, face: DotFace, pitchS: number, pitchT: number, s: number, baseT: number): ImprintOp[] {
  const ops: ImprintOp[] = [];
  const diameter = 0.114;
  let cursor = s;
  for (const character of text.toUpperCase()) {
    if (character === ' ') { cursor += 4 * pitchS; continue; }
    const rows = face.rows[character];
    if (rows) {
      for (let row = 0; row < rows.length; row += 1) {
        for (let column = 0; column < face.columns; column += 1) {
          if (rows[row][column] === '#') ops.push({
            kind: 'dot',
            s: cursor + diameter / 2 + column * pitchS,
            t: baseT - diameter / 2 - (rows.length - 1 - row) * pitchT,
            radius: diameter / 2,
          });
        }
      }
    }
    cursor += face.advance * pitchS;
  }
  return ops;
}

function dx(dxExtract: number, length: number, s: number, number: number, half: boolean, filmWidth: number): ImprintOp[] {
  const ops: ImprintOp[] = [];
  const module = length / 31;
  const { clock, data } = dxModules(dxExtract, number, half);
  for (const [track, row] of [clock, data].entries()) {
    const t = track === 0 ? filmWidth - 2.17 : filmWidth - 0.87;
    const t1 = track === 0 ? filmWidth - 0.87 : filmWidth + 0.1;
    for (let index = 0; index < 31;) {
      if (!row[index]) { index += 1; continue; }
      let end = index;
      while (end < 31 && row[end]) end += 1;
      ops.push({ kind: 'rect', s: s + index * module, t, s1: s + end * module, t1 });
      index = end;
    }
  }
  return ops;
}

function windArrow(s: number, s1: number, t: number): ImprintOp {
  return { kind: 'arrow', s, s1, t, head: 0.55, halfHeight: 0.3 };
}

export function createFujiImprints(stock: FilmType, frameNumber: number, perfPhase: number, gateOrigin: number, advanceOrigin: number, filmWidth = 35): ImprintOp[] {
  const definition = physicalEdgeForFilm(stock)!;
  const ops: ImprintOp[] = [];
  const grid0 = perfPhase + 0.62;
  for (let grid = Math.floor((gateOrigin - grid0) / 19) - 1; grid <= Math.ceil((gateOrigin + 38 - grid0) / 19) + 1; grid += 1) {
    const s = grid0 + 19 + grid * 19;
    const half = 2 * frameNumber + grid;
    const number = Math.floor(half / 2);
    const aHalf = half % 2 !== 0;
    const label = `${number}${aHalf ? 'A' : ''}`;
    ops.push(...dots(label, FUJI_SMALL, 0.090, 0.0984, s + (aHalf ? 16.38 : 15.75), 1.60));
    if (aHalf) ops.push(...dots(fitDots(definition.text, FUJI_NAMES, 0.1155, 9.8), FUJI_NAMES, 0.1155, 0.0984, s + 5.5, 1.50));
    if (definition.dx !== undefined) ops.push(...dx(definition.dx, definition.dxLength, s, number, aHalf, filmWidth));
    ops.push(...dots(label, FUJI_SMALL, 0.090, 0.0984, s + (aHalf ? 16.1 : 15.25), aHalf ? filmWidth - 0.41 : filmWidth - 0.31));
    if (aHalf) ops.push(windArrow(s + 14.6, s + 15.85, filmWidth - 1));
  }
  return ops;
}

export function createVisionImprints(stock: FilmType, perfPhase: number, gateOrigin: number, advanceOrigin: number, filmWidth = 35): ImprintOp[] {
  const definition = physicalEdgeForFilm(stock)!;
  const ops: ImprintOp[] = [];
  const grid0 = perfPhase + 0.62;
  for (let grid = Math.floor((gateOrigin - grid0) / 19) - 1; grid <= Math.ceil((gateOrigin + 38 - grid0) / 19) + 1; grid += 1) {
    if (grid % 2 !== 0) continue;
    const s = grid0 + grid * 19;
    ops.push({ kind: 'rect', s: s + 2.06, t: filmWidth - 0.91, s1: s + 3.22, t1: filmWidth - 0.69 });
    if (Math.floor(grid / 2) % 2 === 0) {
      ops.push(...matrix(fitMatrix(definition.text, 27.4, 0.88, 0.93, false), 0.88, 0.93, false, s + 12.16, filmWidth - 0.47));
    }
  }
  return ops;
}

export function createIlfordImprints(stock: FilmType, frameNumber: number, perfPhase: number, gateOrigin: number, advanceOrigin: number, filmWidth = 35): ImprintOp[] {
  const definition = physicalEdgeForFilm(stock)!;
  const ops: ImprintOp[] = [];
  for (let grid = Math.floor((gateOrigin - perfPhase - 2.85) / 19) - 1; grid <= Math.ceil((gateOrigin + 38 - perfPhase - 2.85) / 19) + 1; grid += 1) {
    const codeStart = perfPhase + 2.85 + (grid + 1) * 19;
    const half = 2 * frameNumber + grid;
    const number = Math.floor(half / 2);
    const aHalf = half % 2 !== 0;
    const group: ImprintOp[] = [];
    if (definition.dx !== undefined) group.push(...dx(definition.dx, definition.dxLength, 0, number, aHalf, filmWidth));
    group.push(...matrix(`${number}${aHalf ? 'A' : ''}`, aHalf ? 1.2 : 1.6, 1, !aHalf, aHalf ? 14.9 : 14.6, filmWidth - 0.35));
    if (aHalf) group.push(...matrix(fitMatrix(definition.text, 26, 1.5, 1, false), 1.5, 1, false, 8.7, 1.85));
    for (const op of group) {
      const turnedS = codeStart - op.s;
      const turnedS1 = op.s1 === undefined ? undefined : codeStart - op.s1;
      const turnedT = filmWidth - op.t;
      const turnedT1 = op.t1 === undefined ? undefined : filmWidth - op.t1;
      ops.push({
        ...op,
        s: turnedS1 === undefined ? turnedS : Math.min(turnedS, turnedS1),
        t: turnedT1 === undefined ? turnedT : Math.min(turnedT, turnedT1),
        ...(turnedS1 === undefined ? {} : { s1: Math.max(turnedS, turnedS1) }),
        ...(turnedT1 === undefined ? {} : { t1: Math.max(turnedT, turnedT1) }),
      });
    }
  }
  return ops;
}

export function createCinestillImprints(stock: FilmType, frameNumber: number, perfPhase: number, gateOrigin: number, advanceOrigin: number, filmWidth = 35): ImprintOp[] {
  const definition = physicalEdgeForFilm(stock)!;
  const ops: ImprintOp[] = [];
  const grid0 = perfPhase + 6.34;
  for (let grid = Math.floor((gateOrigin - grid0) / 19) - 1; grid <= Math.ceil((gateOrigin + 38 - grid0) / 19) + 1; grid += 1) {
    const frame = Math.floor(grid / 2);
    const s = grid0 + 38 * frame;
    const number = frameNumber + frame;
    if (grid % 2 === 0) {
      ops.push({ kind: 'text', s, t: filmWidth - 0.02, text: String(number), cap: 1.68, bold: true, xScale: 1.28, fontFamily: 'mono' });
      ops.push(...matrix(fitMatrix(definition.text, 36, 1.38, 1.16, false), 1.38, 1.16, false, s - 6.21, 1.64));
    } else {
      const start = s + 18.59;
      const center = filmWidth - 0.915;
      let previous = 0;
      for (const [end, halfHeight] of [[0.37, 0.455], [0.80, 0.365], [1.08, 0.235], [1.50, 0.094]]) {
        ops.push({ kind: 'rect', s: start + previous, t: center - halfHeight, s1: start + end + 0.01, t1: center + halfHeight });
        previous = end;
      }
      ops.push({ kind: 'text', s: start + 1.75, t: filmWidth - 0.50, text: `${number}A`, cap: 1, bold: true, xScale: 1.25, fontFamily: 'mono' });
    }
  }
  return ops;
}
