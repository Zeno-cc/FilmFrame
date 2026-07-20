import { describe, expect, it, vi } from 'vitest';
import { REAL135_TEMPLATE_URLS } from '../services/filmOverlay';
import {
  getReal135SprocketColor,
  getReal135SprocketMaskUrl,
  paintTintedSprocketMask,
  REAL135_SPROCKET_MASK_URLS,
} from '../services/filmSprocket';
import { FilmType } from '../types';

describe('real 135 sprocket color', () => {
  it('registers one mask for every real 135 template', () => {
    expect(Object.keys(REAL135_SPROCKET_MASK_URLS).sort()).toEqual(
      Object.keys(REAL135_TEMPLATE_URLS).sort(),
    );
    expect(getReal135SprocketMaskUrl(FilmType.ILFORD_HP5)).toBe(
      '/film-sprocket-masks/ilford-hp5-plus.png',
    );
  });

  it('preserves source colors until an explicit override exists', () => {
    expect(getReal135SprocketColor({})).toBeNull();
    expect(getReal135SprocketColor({ real135SprocketColor: '#112233' })).toBe('#112233');
  });

  it('isolates mask tint compositing inside a saved canvas state', () => {
    const calls: string[] = [];
    const context = {
      save: vi.fn(() => calls.push('save')),
      clearRect: vi.fn(() => calls.push('clear')),
      drawImage: vi.fn(() => calls.push('mask')),
      fillRect: vi.fn(() => calls.push('fill')),
      restore: vi.fn(() => calls.push('restore')),
      globalCompositeOperation: 'source-over',
      fillStyle: '#000000',
    } as unknown as CanvasRenderingContext2D;

    paintTintedSprocketMask(context, {} as CanvasImageSource, '#112233', 1307, 1203);

    expect(calls).toEqual(['save', 'clear', 'mask', 'fill', 'restore']);
    expect(context.globalCompositeOperation).toBe('source-in');
    expect(context.fillStyle).toBe('#112233');
  });
});
