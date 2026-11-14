import { FilmType } from '../../types';

// Stock-specific physical-imprint identities. Adapted from the pinned GPL
// SpektraLab edge-look registry, with unsupported stock types kept explicit.
export type PhysicalEdgeKind = 'kodak' | 'fuji-negative' | 'vision3' | 'ilford' | 'cinestill';

export interface PhysicalEdgeDefinition {
  kind: PhysicalEdgeKind;
  text: string;
  dx?: number;
  dxLength: number;
  layer: readonly [number, number, number];
  ev: number;
  lightNumbers?: boolean;
}

const kodak = (text: string, dx: number, layer: readonly [number, number, number] = [1, 0.40, 0.26]): PhysicalEdgeDefinition => ({
  kind: 'kodak', text, dx, dxLength: 12.7, layer, ev: 5.3,
});

const REGISTRY = new Map<FilmType, PhysicalEdgeDefinition>([
  [FilmType.KODAK_GOLD_200, kodak('KODAK GB 200-7', 1548)],
  [FilmType.KODAK_PORTRA_160, kodak('KODAK PORTRA 160', 1534)],
  [FilmType.KODAK_PORTRA_400, kodak('KODAK PORTRA 400', 1277)],
  [FilmType.KODAK_PORTRA_800, kodak('KODAK PORTRA 800-3', 1278)],
  [FilmType.KODAK_PORTRA_800_PUSH1, kodak('KODAK PORTRA 800-3', 1278)],
  [FilmType.KODAK_PORTRA_800_PUSH2, kodak('KODAK PORTRA 800-3', 1278)],
  [FilmType.KODAK_ULTRAMAX_400, kodak('KODAK GC 400', 1313)],
  [FilmType.KODAK_EKTAR_100, kodak('KODAK EKTAR 100', 1307)],
  [FilmType.KODAK_COLORPLUS_200, { kind: 'kodak', text: 'KODAK 200', dxLength: 12.7, layer: [1, 0.40, 0.26], ev: 5.3 }],
  [FilmType.KODAK_PROIMAGE_100, { kind: 'kodak', text: 'KODAK PRO IMAGE 100', dxLength: 12.7, layer: [1, 0.40, 0.26], ev: 5.3 }],
  [FilmType.FUJI_C200, { kind: 'kodak', text: 'FUJI 200', dx: 1550, dxLength: 12.7, layer: [1, 0.33, 0.27], ev: 5.3, lightNumbers: true }],
  [FilmType.FUJI_XTRA_400, { kind: 'fuji-negative', text: 'S-400', dx: 628, dxLength: 14.1, layer: [1, 0.72, 0.40], ev: 5.3 }],
  [FilmType.FUJI_PRO_400H, { kind: 'fuji-negative', text: 'PRO400H', dx: 584, dxLength: 14.1, layer: [1, 0.51, 0.025], ev: 6.0 }],
  [FilmType.FUJI_SUPERIA, { kind: 'fuji-negative', text: 'FUJI SUPERIA 400', dxLength: 14.1, layer: [1, 0.72, 0.40], ev: 5.3 }],
  [FilmType.KODAK_VISION3_50D, { kind: 'vision3', text: 'EASTMAN 5203', dxLength: 0, layer: [0.58, 0.60, 1], ev: 4.5 }],
  [FilmType.KODAK_VISION3_250D, { kind: 'vision3', text: 'EASTMAN 5207', dxLength: 0, layer: [0.58, 0.60, 1], ev: 4.5 }],
  [FilmType.KODAK_VISION3_200T, { kind: 'vision3', text: 'EASTMAN 5213', dxLength: 0, layer: [0.58, 0.60, 1], ev: 4.5 }],
  [FilmType.KODAK_VISION3_500T, { kind: 'vision3', text: 'EASTMAN 5219', dxLength: 0, layer: [0.58, 0.60, 1], ev: 4.5 }],
  [FilmType.ILFORD_HP5, { kind: 'ilford', text: 'ILFORD HP5 PLUS', dx: 1753, dxLength: 13.06, layer: [1, 1, 1], ev: 5.3 }],
  [FilmType.CINESTILL_800T, { kind: 'cinestill', text: 'CINESTILL 800T', dxLength: 0, layer: [1, 0.45, 0], ev: 6.0 }],
  [FilmType.KODAK_TRI_X_400, { kind: 'kodak', text: 'KODAK 400TX', dxLength: 12.7, layer: [1, 1, 1], ev: 5.3, lightNumbers: true }],
  [FilmType.KODAK_TMAX_100, { kind: 'kodak', text: 'KODAK 100TMX', dxLength: 12.7, layer: [1, 1, 1], ev: 5.3 }],
  [FilmType.KODAK_TMAX_400, { kind: 'kodak', text: 'KODAK 400TMX', dxLength: 12.7, layer: [1, 1, 1], ev: 5.3 }],
  [FilmType.KODAK_P3200, { kind: 'kodak', text: 'KODAK P3200', dxLength: 12.7, layer: [1, 1, 1], ev: 5.3 }],
  [FilmType.KODAK_EKTACHROME_E100, { kind: 'kodak', text: 'KODAK E100', dx: 382, dxLength: 12.7, layer: [1, 0.62, 0.70], ev: 5.7 }],
]);

export function physicalEdgeForFilm(stock: FilmType): PhysicalEdgeDefinition | undefined {
  return REGISTRY.get(stock);
}

export function physicalEdgeDefinitions(): readonly [FilmType, PhysicalEdgeDefinition][] {
  return [...REGISTRY.entries()];
}
