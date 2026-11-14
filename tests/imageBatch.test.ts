import { describe, expect, it } from 'vitest';
import {
  acceptImageRenderResult,
  clearImageProcessingErrors,
  isGenerationCurrent,
  type ImageRenderResult,
} from '../services/imageBatch';
import { deriveImageWorkflowStatus } from '../services/workflowState';

type TestImage = {
  id: string;
  name: string;
  processedUrl?: string;
  processedMime?: string;
  processedSettingsKey?: string;
  processedByteSize?: number;
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

  it('retains the known artifact byte size when accepting a render result', () => {
    const merged = acceptImageRenderResult<TestImage>([{ id: 'a', name: 'A' }], 'a', {
      ...result,
      processedByteSize: 4096,
    });

    expect(merged.items[0].processedByteSize).toBe(4096);
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

describe('batch retry errors', () => {
  it('shows active and queued states without clearing errors outside this batch or losing artifacts', () => {
    const current = [
      { id: 'active', processingError: 'old failure', processedUrl: 'blob:previous', processedByteSize: 321 },
      { id: 'queued', processingError: 'old failure' },
      { id: 'excluded', processingError: 'keep this failure' },
      { id: 'complete', processedUrl: 'blob:complete' },
    ];
    const next = clearImageProcessingErrors(current, new Set(['active', 'queued']));
    const context = {
      expectedMime: 'image/png',
      expectedSettingsKey: 'current-key',
      activeImageId: 'active',
      queuedImageIds: ['queued'],
    };

    expect(deriveImageWorkflowStatus(next[0], context).kind).toBe('processing');
    expect(deriveImageWorkflowStatus(next[1], context).kind).toBe('queued');
    expect(deriveImageWorkflowStatus(next[2], context).kind).toBe('failed');
    expect(next[0]).toMatchObject({ processedUrl: 'blob:previous', processedByteSize: 321 });
    expect(next[2]).toBe(current[2]);
    expect(next[3]).toBe(current[3]);
    expect(current[0].processingError).toBe('old failure');
    expect(current[1].processingError).toBe('old failure');
  });
});
