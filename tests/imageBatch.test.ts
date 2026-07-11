import { describe, expect, it } from 'vitest';
import {
  acceptImageRenderResult,
  isGenerationCurrent,
  type ImageRenderResult,
} from '../services/imageBatch';

type TestImage = {
  id: string;
  name: string;
  processedUrl?: string;
  processedMime?: string;
  processedSettingsKey?: string;
};

const result: ImageRenderResult = {
  processedUrl: 'blob:new-a',
  processedMime: 'image/png',
  processedSettingsKey: 'settings-v2',
};

describe('acceptImageRenderResult', () => {
  it('rejects a late result after its image was deleted', () => {
    const current = [{ id: 'b', name: 'B' }];

    const merged = acceptImageRenderResult(current, 'a', result);

    expect(merged).toEqual({ items: current, accepted: false });
    expect(merged.items).toBe(current);
  });

  it('preserves images added after a render batch started', () => {
    const current: TestImage[] = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ];

    const merged = acceptImageRenderResult(current, 'a', result);

    expect(merged.accepted).toBe(true);
    expect(merged.items.map(item => item.id)).toEqual(['a', 'b', 'c']);
    expect(merged.items[2]).toBe(current[2]);
  });

  it('preserves the current order while merging by image id', () => {
    const current: TestImage[] = [
      { id: 'b', name: 'B' },
      { id: 'a', name: 'A' },
    ];

    const merged = acceptImageRenderResult(current, 'a', result);

    expect(merged.items.map(item => item.id)).toEqual(['b', 'a']);
    expect(merged.items[1]).toMatchObject(result);
  });

  it('returns the replaced URL and stores result metadata', () => {
    const current: TestImage[] = [
      {
        id: 'a',
        name: 'A',
        processedUrl: 'blob:old-a',
        processedMime: 'image/jpeg',
        processedSettingsKey: 'settings-v1',
      },
    ];

    const merged = acceptImageRenderResult(current, 'a', result);

    expect(merged.replacedUrl).toBe('blob:old-a');
    expect(merged.items[0]).toEqual({ id: 'a', name: 'A', ...result });
    expect(current[0].processedUrl).toBe('blob:old-a');
  });

  it('rejects a result from a stale generation', () => {
    const current: TestImage[] = [{ id: 'a', name: 'A' }];

    const merged = acceptImageRenderResult(current, 'a', result, {
      result: 3,
      current: 4,
    });

    expect(isGenerationCurrent(3, 4)).toBe(false);
    expect(merged).toEqual({ items: current, accepted: false });
    expect(merged.items).toBe(current);
  });
});
