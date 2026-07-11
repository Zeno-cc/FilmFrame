import { describe, expect, it } from 'vitest';
import {
  PHYS_135,
  create135LandscapeLayout,
  create135SidePerforationLayout,
  getAutoRotateRadiansForFilmFrame,
  getOutputRestoreRotationRadiansForFilmFrame,
  shouldAutoRotateForFilmFrame,
} from '../services/filmGeometry';
import {
  getFrameNumberForIndex,
  getKodakGoldFrameNumberPositions,
  normalizeFrameNumber,
} from '../services/filmFrameNumber';
import { createKodakGoldOverlayLayout, createKodakGoldStripLayout } from '../services/filmOverlay';
import { getReal135StripTargetImageWidth, getReal135TargetImageWidth } from '../services/filmResolution';

describe('135 film geometry', () => {
  it('models the landscape frame dimensions and perforations', () => {
    const layout = create135LandscapeLayout(3600);

    expect(PHYS_135.perforationsPerFrame).toBe(8);
    expect(layout.imageW).toBe(3600);
    expect(layout.imageH).toBe(2400);
    expect(layout.filmW).toBe(3800);
    expect(layout.filmH).toBe(3500);
    expect(layout.topRebateH).toBe(550);
    expect(layout.bottomRebateH).toBe(550);
    expect(Math.round(layout.perfPitch)).toBe(475);
  });

  it('models the side-perforation frame dimensions', () => {
    const layout = create135SidePerforationLayout(3600);

    expect(layout.imageW).toBe(3600);
    expect(layout.imageH).toBe(2400);
    expect(layout.filmW).toBe(4200);
    expect(layout.filmH).toBe(2800);
    expect(layout.sideRailW).toBe(300);
    expect(layout.verticalRebateH).toBe(200);
    expect(layout.perfCount).toBe(8);
  });
});

describe('frame numbers', () => {
  it('normalizes numbers to the roll range', () => {
    expect(normalizeFrameNumber(1)).toBe(1);
    expect(normalizeFrameNumber(36)).toBe(36);
    expect(normalizeFrameNumber(37)).toBe(1);
    expect(normalizeFrameNumber(0)).toBe(36);
    expect(normalizeFrameNumber(24 + 13)).toBe(1);
  });

  it('wraps indexed frame numbers at 24 and 36 frame roll boundaries', () => {
    expect(getFrameNumberForIndex(36, 0, 36)).toBe(36);
    expect(getFrameNumberForIndex(36, 1, 36)).toBe(1);
    expect(getFrameNumberForIndex(24, 0, 24)).toBe(24);
    expect(getFrameNumberForIndex(24, 1, 24)).toBe(1);
  });

  it('does not expose the removed previous-frame suffix position', () => {
    const positions = getKodakGoldFrameNumberPositions(createKodakGoldOverlayLayout(3600));
    expect('previousSuffixX' in positions).toBe(false);
  });
});

describe('Kodak Gold overlay geometry', () => {
  it('keeps the image aperture inset in a landscape template', () => {
    const layout = createKodakGoldOverlayLayout(3600);

    expect(layout.imageW).toBe(3600);
    expect(layout.filmW).toBeGreaterThan(layout.imageW);
    expect(layout.imageX > 0 && layout.imageY > 0).toBe(true);
    expect(layout.filmW / layout.filmH).toBeGreaterThan(1);
  });

  it('creates a continuous multi-row strip layout', () => {
    const layout = createKodakGoldStripLayout(1400, 5, 4);

    expect(layout.frame.imageW).toBe(1400);
    expect(layout.rows).toBe(2);
    expect(layout.cols).toBe(4);
    expect(layout.frameGap).toBeGreaterThanOrEqual(Math.round(layout.frame.imageW * 0.055));
    expect(layout.frameStride).toBe(layout.frame.imageW + layout.frameGap);
    expect(layout.totalW).toBe(layout.padding * 2 + layout.rowFilmW);
    expect(layout.totalH).toBeGreaterThan(layout.frame.filmH * 2);
  });
});

describe('film frame orientation', () => {
  it('auto-rotates only portrait sources entering landscape frames', () => {
    expect(shouldAutoRotateForFilmFrame(1200, 1800, 3600, 2400)).toBe(true);
    expect(shouldAutoRotateForFilmFrame(1800, 1200, 3600, 2400)).toBe(false);
    expect(shouldAutoRotateForFilmFrame(1200, 1800, 2400, 3600)).toBe(false);
  });

  it('returns matching input and output rotation angles', () => {
    expect(getAutoRotateRadiansForFilmFrame(1200, 1800, 3600, 2400)).toBe(Math.PI / 2);
    expect(getAutoRotateRadiansForFilmFrame(1800, 1200, 3600, 2400)).toBe(0);
    expect(getOutputRestoreRotationRadiansForFilmFrame(1200, 1800, 3600, 2400)).toBe(-Math.PI / 2);
    expect(getOutputRestoreRotationRadiansForFilmFrame(1800, 1200, 3600, 2400) === 0).toBe(true);
  });
});

describe('render resolution', () => {
  it('selects the established single and strip widths', () => {
    expect(getReal135TargetImageWidth(4000, 'preview')).toBe(1200);
    expect(getReal135TargetImageWidth(4000, 'high')).toBe(3600);
    expect(getReal135TargetImageWidth(900, 'high')).toBe(1800);
    expect(getReal135StripTargetImageWidth('preview')).toBe(900);
    expect(getReal135StripTargetImageWidth('high')).toBe(1400);
  });
});
