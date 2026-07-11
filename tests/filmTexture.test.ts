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
});
