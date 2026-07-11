import { describe, expect, it } from 'vitest';
import {
  getNextPreviewImageId,
  getPreviewImageIndex,
} from '../services/previewNavigation';

const images = [
  { id: 'a', previewUrl: 'preview-a' },
  { id: 'b', previewUrl: 'preview-b', processedUrl: 'processed-b' },
  { id: 'c', previewUrl: 'preview-c' },
];

describe('preview navigation', () => {
  it('finds preview images by id', () => {
    expect(getPreviewImageIndex(images, 'b')).toBe(1);
    expect(getPreviewImageIndex(images, 'missing')).toBe(-1);
  });

  it('navigates in current order and wraps at either end', () => {
    expect(getNextPreviewImageId(images, 'a', 'next')).toBe('b');
    expect(getNextPreviewImageId(images, 'a', 'previous')).toBe('c');
    expect(getNextPreviewImageId(images, 'c', 'next')).toBe('a');
  });

  it('handles empty lists and missing current images', () => {
    expect(getNextPreviewImageId([], 'a', 'next')).toBeNull();
    expect(getNextPreviewImageId(images, 'missing', 'next')).toBe('a');
  });
});
