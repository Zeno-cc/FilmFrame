import { describe, expect, it } from 'vitest';
import { FilmType } from '../types';
import {
  createFilmTemplateStripLayout,
  getReal135OverlayUrl,
  KODAK_GOLD_OVERLAY_URL,
  KODAK_PORTRA_160_OVERLAY_URL,
  supportsReal135Template,
} from '../services/filmOverlay';

describe('real 135 template registry', () => {
  it('registers Gold 200 and Portra 160 without enabling unsupported stocks', () => {
    expect(getReal135OverlayUrl(FilmType.KODAK_GOLD_200)).toBe(KODAK_GOLD_OVERLAY_URL);
    expect(getReal135OverlayUrl(FilmType.KODAK_PORTRA_160)).toBe(KODAK_PORTRA_160_OVERLAY_URL);
    expect(supportsReal135Template(FilmType.KODAK_GOLD_200)).toBe(true);
    expect(supportsReal135Template(FilmType.KODAK_PORTRA_160)).toBe(true);
    expect(supportsReal135Template(FilmType.KODAK_EKTAR_100)).toBe(false);
  });

  it('keeps complete flattened frames separate in multi-row strips', () => {
    const layout = createFilmTemplateStripLayout(900, 5, 4);

    expect(layout.frame.imageW).toBe(900);
    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(2);
    expect(layout.frameGap).toBe(0);
    expect(layout.frameStride).toBe(layout.frame.filmW);
    expect(layout.totalW).toBe(layout.padding * 2 + layout.rowFilmW);
    expect(layout.totalH).toBe(
      layout.padding * 2 + layout.rows * layout.frame.filmH + layout.rowGap,
    );
  });
});
