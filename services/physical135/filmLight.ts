import { FilmType } from '../../types';
import { physicalEdgeForFilm } from './edgeRegistry';

// Layer weights for the stock edge printer, derived from the pinned GPL
// SpektraLab edge-look model. Exposure, not a final sRGB paint color.
export interface FilmLightWeights {
  fog: readonly [number, number, number];
  edge: readonly [number, number, number];
}

export function edgeLightWeights(stock: FilmType): FilmLightWeights {
  const definition = physicalEdgeForFilm(stock);
  return { fog: [1, 1, 0], edge: definition?.layer ?? [1, 0.40, 0.26] };
}

export const MID_GREY = 0.184;
export const EDGE_IMPRINT_EV = 1.7;
