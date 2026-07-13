import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RENDER_TRANSFORM,
  changeZoomPreservingPoint,
  changeZoomPreservingView,
  createCoverPlacement,
  createRenderTransformKey,
  getAutoQuarterTurns,
  getVisibleFrameAspect,
  normalizeRenderTransform,
  rotateFocusAnchor,
} from '../services/renderTransform';

describe('render transform normalization', () => {
  it('uses a centered zero-rotation default for absent and invalid values', () => {
    expect(normalizeRenderTransform()).toEqual(DEFAULT_RENDER_TRANSFORM);
    expect(normalizeRenderTransform({ focusX: Number.NaN, focusY: Number.POSITIVE_INFINITY, zoom: 0, quarterTurns: 5 }))
      .toEqual(DEFAULT_RENDER_TRANSFORM);
  });

  it('accepts continuous positions, clamps bounds, and creates a stable key', () => {
    const transform = { focusX: 0.237, focusY: 0.816, zoom: 1.75, quarterTurns: 3 } as const;
    expect(normalizeRenderTransform(transform)).toEqual(transform);
    expect(normalizeRenderTransform({ focusX: -1, focusY: 2, zoom: 8, quarterTurns: 0 })).toEqual({
      focusX: 0,
      focusY: 1,
      zoom: 3,
      quarterTurns: 0,
    });
    expect(createRenderTransformKey(transform)).toBe(createRenderTransformKey({
      quarterTurns: 3,
      zoom: 1.75,
      focusY: 0.816,
      focusX: 0.237,
    }));
  });

  it('keeps legacy transforms compatible and quantizes pointer noise in keys', () => {
    expect(normalizeRenderTransform({ focusX: 0, focusY: 1, quarterTurns: 2 })).toEqual({
      focusX: 0,
      focusY: 1,
      zoom: 1,
      quarterTurns: 2,
    });
    expect(createRenderTransformKey({ focusX: 0.20000001, focusY: 0.5, zoom: 1, quarterTurns: 0 }))
      .toBe(createRenderTransformKey({ focusX: 0.2, focusY: 0.5, zoom: 1, quarterTurns: 0 }));
  });
});

describe('focus rotation mapping', () => {
  it.each([
    [0, { x: 0, y: 0.5 }],
    [1, { x: 0.5, y: 0 }],
    [2, { x: 1, y: 0.5 }],
    [3, { x: 0.5, y: 1 }],
  ] as const)('maps clockwise quarter turn %s', (quarterTurns, expected) => {
    expect(rotateFocusAnchor(0, 0.5, quarterTurns)).toEqual(expected);
  });
});

describe('cover placement', () => {
  it('matches legacy center-cover geometry', () => {
    expect(createCoverPlacement(200, 100, 100, 100)).toMatchObject({
      rotatedWidth: 200,
      rotatedHeight: 100,
      scale: 1,
      offsetX: -50,
      offsetY: 0,
      drawWidth: 200,
      drawHeight: 100,
    });
  });

  it('applies zoom over the minimum cover scale and keeps centered composition', () => {
    expect(createCoverPlacement(200, 100, 100, 100, {
      focusX: 0.5,
      focusY: 0.5,
      zoom: 2,
      quarterTurns: 0,
    })).toMatchObject({
      scale: 2,
      drawWidth: 400,
      drawHeight: 200,
      offsetX: -150,
      offsetY: -50,
    });
  });

  it('uses the real aperture aspect in the user-visible orientation', () => {
    expect(getVisibleFrameAspect(400, 300, 0, 3 / 2)).toBe(3 / 2);
    expect(getVisibleFrameAspect(400, 300, 1, 3 / 2)).toBeCloseTo(2 / 3);
    expect(getVisibleFrameAspect(400, 300, 0)).toBeCloseTo(4 / 3);
  });

  it('preserves a non-centered visible source point while zooming', () => {
    const current = { focusX: 0.25, focusY: 0.5, zoom: 1, quarterTurns: 0 } as const;
    const before = createCoverPlacement(200, 100, 100, 100, current);
    const next = changeZoomPreservingView(200, 100, 100, 100, current, 2);
    const after = createCoverPlacement(200, 100, 100, 100, next);
    const beforeCenter = (-before.offsetX + 50) / before.scale;
    const afterCenter = (-after.offsetX + 50) / after.scale;

    expect(next.zoom).toBe(2);
    expect(afterCenter).toBeCloseTo(beforeCenter);
  });

  it('preserves the source point under the wheel cursor while zooming', () => {
    const current = { focusX: 0.4, focusY: 0.6, zoom: 1.25, quarterTurns: 0 } as const;
    const before = createCoverPlacement(400, 300, 300, 200, current);
    const next = changeZoomPreservingPoint(400, 300, 300, 200, current, 2, 70, 150);
    const after = createCoverPlacement(400, 300, 300, 200, next);
    const sourcePointBefore = {
      x: (-before.offsetX + 70) / before.scale,
      y: (-before.offsetY + 150) / before.scale,
    };
    const sourcePointAfter = {
      x: (-after.offsetX + 70) / after.scale,
      y: (-after.offsetY + 150) / after.scale,
    };

    expect(sourcePointAfter.x).toBeCloseTo(sourcePointBefore.x);
    expect(sourcePointAfter.y).toBeCloseTo(sourcePointBefore.y);
  });

  it('shows 4:3 source overflow inside a 3:2 crop aperture', () => {
    const placement = createCoverPlacement(400, 300, 300, 200);
    expect(placement.drawHeight).toBe(225);
    expect(placement.offsetY).toBe(-12.5);
  });

  it.each([
    [0, 0],
    [0.5, -50],
    [1, -100],
  ] as const)('uses horizontal focus %s within overflow', (focusX, offsetX) => {
    expect(createCoverPlacement(200, 100, 100, 100, {
      focusX,
      focusY: 0.5,
      quarterTurns: 0,
    }).offsetX).toBe(offsetX);
  });

  it.each([
    [0, 0],
    [0.5, -50],
    [1, -100],
  ] as const)('uses vertical focus %s within overflow', (focusY, offsetY) => {
    expect(createCoverPlacement(100, 200, 100, 100, {
      focusX: 0.5,
      focusY,
      quarterTurns: 0,
    }).offsetY).toBe(offsetY);
  });

  it('auto-rotates based on dimensions after the user rotation', () => {
    expect(getAutoQuarterTurns(100, 200, 100, 100, 0)).toBe(0);
    expect(getAutoQuarterTurns(100, 200, 150, 100, 0)).toBe(1);
    expect(getAutoQuarterTurns(100, 200, 150, 100, 1)).toBe(0);
  });

  it('keeps focus in user-rotated visible coordinates', () => {
    const placement = createCoverPlacement(200, 100, 100, 100, {
      focusX: 0,
      focusY: 0.5,
      quarterTurns: 2,
    });

    expect(placement.offsetX).toBe(0);
  });

  it('never exposes blank space for all transforms and focus anchors', () => {
    const anchors = [0, 0.237, 0.5, 0.816, 1] as const;
    for (const quarterTurns of [0, 1, 2, 3] as const) {
      for (const focusX of anchors) {
        for (const focusY of anchors) {
          for (const zoom of [1, 1.5, 3]) {
            const placement = createCoverPlacement(4032, 3024, 1400, 933, {
              focusX,
              focusY,
              zoom,
              quarterTurns,
            }, true);
            expect(placement.offsetX).toBeLessThanOrEqual(0);
            expect(placement.offsetY).toBeLessThanOrEqual(0);
            expect(placement.offsetX + placement.drawWidth).toBeGreaterThanOrEqual(1400);
            expect(placement.offsetY + placement.drawHeight).toBeGreaterThanOrEqual(933);
          }
        }
      }
    }
  });
});
