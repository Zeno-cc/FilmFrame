import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawGrain } from '../services/filmTexture';

class FakeOffscreenCanvas {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return {
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: vi.fn(),
    };
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('drawGrain', () => {
  it('builds the shared noise pattern with OffscreenCanvas for Worker rendering', () => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    const fillRect = vi.fn();
    const context = {
      save: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      createPattern: vi.fn(() => ({})),
      translate: vi.fn(),
      fillRect,
      restore: vi.fn(),
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
      fillStyle: '',
    } as unknown as OffscreenCanvasRenderingContext2D;

    drawGrain(context, 10, 20, 300, 200, 15);

    expect(context.createPattern).toHaveBeenCalledOnce();
    expect(context.globalCompositeOperation).toBe('overlay');
    expect(context.globalAlpha).toBe(0.3);
    expect(fillRect).toHaveBeenCalledOnce();
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it.each([[0, 0], [10, 20], [1400, 2000]])('covers the full frame at offset (%i, %i)', (x, y) => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    let shiftX = 0;
    let shiftY = 0;
    const painted: number[][] = [];
    const context = {
      save: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      createPattern: () => ({}),
      translate: (dx: number, dy: number) => { shiftX += dx; shiftY += dy; },
      fillRect: (left: number, top: number, width: number, height: number) => {
        painted.push([left + shiftX, top + shiftY, width, height]);
      },
      restore: vi.fn(),
    } as unknown as OffscreenCanvasRenderingContext2D;

    drawGrain(context, x, y, 300, 200, 15);

    expect(painted).toHaveLength(1);
    expect(painted[0][0]).toBeCloseTo(x, 10);
    expect(painted[0][1]).toBeCloseTo(y, 10);
    expect(painted[0].slice(2)).toEqual([300, 200]);
  });
});
