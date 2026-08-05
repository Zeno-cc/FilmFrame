import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLuminanceAlphaMask,
  exportCanvasToObjectUrl,
  loadCanvasImage,
  restoreOutputOrientationForSource,
  rotateCanvas,
} from '../services/canvasRuntime';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('canvas image loading', () => {
  it('loads anonymously and resolves the decoded image', async () => {
    const images: FakeImage[] = [];
    class FakeImage {
      crossOrigin = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';

      constructor() {
        images.push(this);
      }
    }
    vi.stubGlobal('Image', FakeImage);

    const pending = loadCanvasImage('blob:source');
    expect(images).toHaveLength(1);
    expect(images[0].crossOrigin).toBe('anonymous');
    expect(images[0].src).toBe('blob:source');

    images[0].onload?.();
    await expect(pending).resolves.toBe(images[0]);
  });

  it('uses a stable error when decoding fails', async () => {
    const images: FakeImage[] = [];
    class FakeImage {
      crossOrigin = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';

      constructor() {
        images.push(this);
      }
    }
    vi.stubGlobal('Image', FakeImage);

    const pending = loadCanvasImage('blob:broken');
    images[0].onerror?.();

    await expect(pending).rejects.toThrow('Failed to load image');
  });
});

describe('canvas export', () => {
  it('passes through the output MIME and quality before creating the object URL', async () => {
    const blob = new Blob(['rendered'], { type: 'image/webp' });
    const toBlob = vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
      expect(type).toBe('image/webp');
      expect(quality).toBe(0.82);
      callback(blob);
    });
    const createObjectURL = vi.fn(() => 'blob:rendered');
    vi.stubGlobal('URL', { createObjectURL });

    await expect(exportCanvasToObjectUrl(
      { toBlob } as unknown as HTMLCanvasElement,
      'image/webp',
      0.82,
    )).resolves.toBe('blob:rendered');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('rejects a null export with the caller-specific failure message', async () => {
    const canvas = {
      toBlob(callback: BlobCallback) {
        callback(null);
      },
    } as HTMLCanvasElement;

    await expect(exportCanvasToObjectUrl(
      canvas,
      'image/jpeg',
      0.9,
      'Failed to export film strip blob',
    )).rejects.toThrow('Failed to export film strip blob');
  });
});

describe('canvas orientation', () => {
  it('rotates quarter turns onto an opaque canvas with swapped dimensions', () => {
    const source = { width: 120, height: 80 } as HTMLCanvasElement;
    const context = createRotationContext();
    const output = createFakeCanvas(context);
    const createElement = vi.fn(() => output);
    vi.stubGlobal('document', { createElement });

    expect(rotateCanvas(source, -Math.PI / 2)).toBe(output);
    expect(output.width).toBe(80);
    expect(output.height).toBe(120);
    expect(output.getContext).toHaveBeenCalledWith('2d', { alpha: false });
    expect(context.fillStyle).toBe('#e8e3d8');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 80, 120);
    expect(context.translate).toHaveBeenCalledWith(40, 60);
    expect(context.rotate).toHaveBeenCalledWith(-Math.PI / 2);
    expect(context.drawImage).toHaveBeenCalledWith(source, -60, -40);
  });

  it('restores portrait auto-rotation but leaves user-landscape output untouched', () => {
    const source = { width: 300, height: 200 } as HTMLCanvasElement;
    const context = createRotationContext();
    const output = createFakeCanvas(context);
    const createElement = vi.fn(() => output);
    vi.stubGlobal('document', { createElement });

    expect(restoreOutputOrientationForSource(
      source,
      { width: 100, height: 200 },
      300,
      200,
    )).toBe(output);
    expect(context.rotate).toHaveBeenCalledWith(-Math.PI / 2);

    createElement.mockClear();
    expect(restoreOutputOrientationForSource(
      source,
      { width: 100, height: 200 },
      300,
      200,
      { focusX: 0.5, focusY: 0.5, quarterTurns: 1 },
    )).toBe(source);
    expect(createElement).not.toHaveBeenCalled();
  });
});

describe('luminance mask conversion', () => {
  it('turns RGB luminance into alpha while keeping mask pixels white', () => {
    const pixels = new Uint8ClampedArray([
      100, 150, 200, 0,
      255, 0, 0, 42,
    ]);
    const imageData = { data: pixels } as ImageData;
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => imageData),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const canvas = createFakeCanvas(context);
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    const mask = {} as CanvasImageSource;

    expect(createLuminanceAlphaMask(mask, 2, 1)).toBe(canvas);
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(1);
    expect(context.drawImage).toHaveBeenCalledWith(mask, 0, 0, 2, 1);
    expect(Array.from(pixels)).toEqual([
      255, 255, 255, 143,
      255, 255, 255, 54,
    ]);
    expect(context.putImageData).toHaveBeenCalledWith(imageData, 0, 0);
  });
});

function createRotationContext() {
  return {
    fillStyle: '',
    fillRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
  };
}

function createFakeCanvas(context: unknown) {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement & { getContext: ReturnType<typeof vi.fn> };
}
