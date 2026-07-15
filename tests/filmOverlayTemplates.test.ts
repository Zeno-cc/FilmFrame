import { describe, expect, it } from 'vitest';
import { FilmType } from '../types';
import {
  CINESTILL_800T_OVERLAY_URL,
  createFilmTemplateStripLayout,
  createKodakGoldOverlayLayout,
  drawKodakGoldOverlayLayer,
  FUJI_SUPERIA_400_OVERLAY_URL,
  getReal135OverlayUrl,
  ILFORD_HP5_PLUS_OVERLAY_URL,
  KODAK_COLORPLUS_200_OVERLAY_URL,
  KODAK_EKTAR_100_OVERLAY_URL,
  KODAK_EKTACHROME_E100_OVERLAY_URL,
  KODAK_GOLD_OVERLAY_URL,
  KODAK_PORTRA_160_OVERLAY_URL,
  KODAK_PORTRA_400_OVERLAY_URL,
  KODAK_PORTRA_800_OVERLAY_URL,
  KODAK_PRO_IMAGE_100_OVERLAY_URL,
  KODAK_TMAX_100_OVERLAY_URL,
  KODAK_TMAX_400_OVERLAY_URL,
  KODAK_TMAX_P3200_OVERLAY_URL,
  KODAK_TRI_X_400_OVERLAY_URL,
  KODAK_ULTRAMAX_400_OVERLAY_URL,
  supportsReal135Template,
} from '../services/filmOverlay';

describe('real 135 template registry', () => {
  it('registers every selectable film stock', () => {
    const expectedTemplates: Record<FilmType, string> = {
      [FilmType.KODAK_GOLD_200]: KODAK_GOLD_OVERLAY_URL,
      [FilmType.KODAK_PORTRA_160]: KODAK_PORTRA_160_OVERLAY_URL,
      [FilmType.KODAK_PORTRA_400]: KODAK_PORTRA_400_OVERLAY_URL,
      [FilmType.KODAK_EKTAR_100]: KODAK_EKTAR_100_OVERLAY_URL,
      [FilmType.KODAK_PORTRA_800]: KODAK_PORTRA_800_OVERLAY_URL,
      [FilmType.KODAK_ULTRAMAX_400]: KODAK_ULTRAMAX_400_OVERLAY_URL,
      [FilmType.KODAK_COLORPLUS_200]: KODAK_COLORPLUS_200_OVERLAY_URL,
      [FilmType.KODAK_PROIMAGE_100]: KODAK_PRO_IMAGE_100_OVERLAY_URL,
      [FilmType.KODAK_EKTACHROME_E100]: KODAK_EKTACHROME_E100_OVERLAY_URL,
      [FilmType.KODAK_TRI_X_400]: KODAK_TRI_X_400_OVERLAY_URL,
      [FilmType.KODAK_TMAX_100]: KODAK_TMAX_100_OVERLAY_URL,
      [FilmType.KODAK_TMAX_400]: KODAK_TMAX_400_OVERLAY_URL,
      [FilmType.KODAK_P3200]: KODAK_TMAX_P3200_OVERLAY_URL,
      [FilmType.FUJI_SUPERIA]: FUJI_SUPERIA_400_OVERLAY_URL,
      [FilmType.CINESTILL_800T]: CINESTILL_800T_OVERLAY_URL,
      [FilmType.ILFORD_HP5]: ILFORD_HP5_PLUS_OVERLAY_URL,
    };

    for (const [stock, url] of Object.entries(expectedTemplates)) {
      const filmType = stock as FilmType;
      expect(getReal135OverlayUrl(filmType)).toBe(url);
      expect(supportsReal135Template(filmType)).toBe(true);
    }
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

  it('clips flattened overlay bands exactly outside the photo aperture', () => {
    const layout = createKodakGoldOverlayLayout(1123);
    const clips: Array<[number, number, number, number]> = [];
    const context = {
      save() {},
      beginPath() {},
      rect(x: number, y: number, width: number, height: number) {
        clips.push([x, y, width, height]);
      },
      clip() {},
      drawImage() {},
      restore() {},
    } as unknown as CanvasRenderingContext2D;

    drawKodakGoldOverlayLayer(context, {} as CanvasImageSource, layout);

    expect(clips).toEqual([
      [0, 0, layout.filmW, layout.imageY],
      [0, layout.bottomRebateY, layout.filmW, layout.filmH - layout.bottomRebateY],
      [0, 0, layout.imageX, layout.filmH],
      [
        layout.imageX + layout.imageW,
        0,
        layout.filmW - layout.imageX - layout.imageW,
        layout.filmH,
      ],
    ]);
  });
});
