import {
  PHYS_135,
  create135LandscapeLayout,
  create135SidePerforationLayout,
  shouldAutoRotateForFilmFrame,
} from '../services/filmGeometry';
import { getKodakGoldFrameNumberPositions, normalizeFrameNumber } from '../services/filmFrameNumber';
import { getReal135TargetImageWidth, getReal135StripTargetImageWidth } from '../services/filmResolution';
import { createKodakGoldOverlayLayout, createKodakGoldStripLayout, getKodakGoldStripSegment } from '../services/filmOverlay';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const layout = create135LandscapeLayout(3600);

assert(PHYS_135.perforationsPerFrame === 8, '135 frame should use 8 perforations');
assert(layout.imageW === 3600, 'image width should match target width');
assert(layout.imageH === 2400, 'image area should keep 36x24mm 3:2 ratio');
assert(layout.filmW === 3800, 'film width should model 38mm frame advance');
assert(layout.filmH === 3500, 'film height should model 35mm film width');
assert(layout.topRebateH === 550, 'top rebate should be 5.5mm');
assert(layout.bottomRebateH === 550, 'bottom rebate should be 5.5mm');
assert(Math.round(layout.perfPitch) === 475, 'perforation pitch should be 4.75mm');

const sideLayout = create135SidePerforationLayout(3600);

assert(sideLayout.imageW === 3600, 'side layout image width should match target width');
assert(sideLayout.imageH === 2400, 'side layout image should remain 3:2');
assert(sideLayout.filmW === 4200, 'side layout should include left and right film rails');
assert(sideLayout.filmH === 2800, 'side layout should include slim top and bottom rebate');
assert(sideLayout.sideRailW === 300, 'each side rail should be 3mm wide at 100px/mm');
assert(sideLayout.verticalRebateH === 200, 'top and bottom rebate should be 2mm at 100px/mm');
assert(sideLayout.perfCount === 8, 'side layout should draw 8 perforations per side');

assert(normalizeFrameNumber(1) === 1, 'frame 1 should stay 1');
assert(normalizeFrameNumber(36) === 36, 'frame 36 should stay 36');
assert(normalizeFrameNumber(37) === 1, 'frame 37 should wrap to 1');
assert(normalizeFrameNumber(0) === 36, 'frame 0 should wrap to 36');
assert(normalizeFrameNumber(24 + 13) === 1, 'frame sequence should wrap after 36');

const overlayLayout = createKodakGoldOverlayLayout(3600);
assert(overlayLayout.imageW === 3600, 'overlay image width should match target width');
assert(overlayLayout.filmW > overlayLayout.imageW, 'overlay should include real template border');
assert(overlayLayout.imageX > 0 && overlayLayout.imageY > 0, 'overlay aperture should be inset');
assert(overlayLayout.filmW / overlayLayout.filmH > 1, 'overlay template should remain landscape');

const frameNumberPositions = getKodakGoldFrameNumberPositions(overlayLayout);
assert(
  !('previousSuffixX' in frameNumberPositions),
  'Kodak Gold overlay should not draw the previous frame suffix'
);

assert(shouldAutoRotateForFilmFrame(1200, 1800, 3600, 2400) === true, 'portrait images should rotate into landscape film frames');
assert(shouldAutoRotateForFilmFrame(1800, 1200, 3600, 2400) === false, 'landscape images should not rotate');
assert(shouldAutoRotateForFilmFrame(1200, 1800, 2400, 3600) === false, 'portrait targets should not auto-rotate portrait images');

const stripLayout = createKodakGoldStripLayout(1400, 5, 4);
assert(stripLayout.frame.imageW === 1400, 'strip frame image width should match target width');
assert(stripLayout.rows === 2, '5 frames with max 4 per row should use 2 rows');
assert(stripLayout.cols === 4, 'strip should use max 4 columns on first row');
assert(stripLayout.frameGap >= Math.round(stripLayout.frame.imageW * 0.055), 'continuous strip should keep a real black frame gap between photos');
assert(stripLayout.frameStride === stripLayout.frame.imageW + stripLayout.frameGap, 'continuous strip frame stride should be image width plus a narrow frame gap');
assert(stripLayout.totalW === stripLayout.padding * 2 + stripLayout.rowFilmW, 'strip canvas should wrap one continuous row film width');
assert(stripLayout.totalH > stripLayout.frame.filmH * 2, 'strip height should include row gap and padding');

const segment0 = getKodakGoldStripSegment(stripLayout, 0, 4);
const segment1 = getKodakGoldStripSegment(stripLayout, 1, 4);
const segment2 = getKodakGoldStripSegment(stripLayout, 2, 4);
assert(segment1.targetX - segment0.targetX === stripLayout.frameStride, 'second frame should align to one continuous frame pitch');
assert(segment2.targetX - segment1.targetX === stripLayout.frameStride, 'third frame should align to one continuous frame pitch');

assert(getReal135TargetImageWidth(4000, 'preview') === 1200, 'preview mode should render single frames at preview width');
assert(getReal135TargetImageWidth(4000, 'high') === 3600, 'high mode should keep existing high-resolution cap');
assert(getReal135TargetImageWidth(900, 'high') === 1800, 'high mode should keep existing minimum output width');
assert(getReal135StripTargetImageWidth('preview') === 900, 'preview mode should render strip frames at preview width');
assert(getReal135StripTargetImageWidth('high') === 1400, 'high mode should keep existing strip frame width');
