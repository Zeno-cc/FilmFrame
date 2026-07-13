import { describe, expect, it } from 'vitest';
import {
  getIncludedImageCount,
  getIncludedImages,
  getIncludedStripImages,
  isImageIncluded,
  setAllImagesIncluded,
  setImageIncluded,
  toggleImageIncluded,
} from '../services/batchCuration';

describe('batch curation', () => {
  const items = [
    { id: 'one', artifact: 'one' },
    { id: 'two', included: false, artifact: 'two' },
    { id: 'three', included: true, artifact: 'three' },
  ];

  it('treats items without an explicit flag as included for existing rolls', () => {
    expect(isImageIncluded(items[0])).toBe(true);
    expect(getIncludedImages(items).map(item => item.id)).toEqual(['one', 'three']);
    expect(getIncludedImageCount(items)).toBe(2);
  });

  it('changes only the selected item and preserves its artifact data', () => {
    const next = toggleImageIncluded(items, 'one');

    expect(next).not.toBe(items);
    expect(next[0]).toMatchObject({ id: 'one', included: false, artifact: 'one' });
    expect(next[1]).toBe(items[1]);
    expect(next[2]).toBe(items[2]);
    expect(setImageIncluded(next, 'one', false)).toBe(next);
  });

  it('selects and clears every image without changing their relative order', () => {
    const selected = setAllImagesIncluded(items, true);
    const cleared = setAllImagesIncluded(selected, false);

    expect(getIncludedImages(selected).map(item => item.id)).toEqual(['one', 'two', 'three']);
    expect(cleared.map(item => item.id)).toEqual(['one', 'two', 'three']);
    expect(getIncludedImageCount(cleared)).toBe(0);
    expect(setAllImagesIncluded(cleared, false)).toBe(cleared);
  });

  it('carries full-roll positions into a curated strip subset', () => {
    expect(getIncludedStripImages(items)).toEqual([
      { id: 'one', artifact: 'one', rollIndex: 0 },
      { id: 'three', included: true, artifact: 'three', rollIndex: 2 },
    ]);
  });
});
