import { describe, expect, it } from 'vitest';
import {
  deriveImageWorkflowStatus,
  getPrimaryAction,
  isImageTaskContextCurrent,
  isImageRemovalAllowed,
  moveItem,
  selectImagesForProcessing,
} from '../services/workflowState';

const expected = { expectedMime: 'image/jpeg', expectedSettingsKey: 'current-key' } as const;

describe('image workflow status', () => {
  it('distinguishes unprocessed, current, stale, processing, and queued images', () => {
    expect(deriveImageWorkflowStatus({ id: 'a' }, expected).kind).toBe('unprocessed');
    expect(deriveImageWorkflowStatus({
      id: 'a', processedUrl: 'blob:a', processedMime: 'image/jpeg', processedSettingsKey: 'current-key',
    }, expected)).toMatchObject({ kind: 'complete', downloadable: true, label: '已完成' });
    expect(deriveImageWorkflowStatus({
      id: 'a', processedUrl: 'blob:a', processedMime: 'image/png', processedSettingsKey: 'old-key',
    }, expected)).toMatchObject({ kind: 'stale', downloadable: false, label: '待更新' });
    expect(deriveImageWorkflowStatus({ id: 'a' }, { ...expected, activeImageId: 'a' }).kind)
      .toBe('processing');
    expect(deriveImageWorkflowStatus({ id: 'a' }, { ...expected, queuedImageIds: ['a'] }).kind)
      .toBe('queued');
  });

  it('prioritizes an error and explains when a current result remains downloadable', () => {
    expect(deriveImageWorkflowStatus(
      { id: 'a', processingError: 'boom' },
      { ...expected, activeImageId: 'a', queuedImageIds: ['a'] },
    ))
      .toMatchObject({ kind: 'failed', downloadable: false, detail: '处理失败，请重试' });
    expect(deriveImageWorkflowStatus({
      id: 'a',
      processedUrl: 'blob:a',
      processedMime: 'image/jpeg',
      processedSettingsKey: 'current-key',
      processingError: 'boom',
    }, expected)).toMatchObject({
      kind: 'failed', downloadable: true, detail: '处理失败，已保留上次成片',
    });
  });
});

describe('batch selection', () => {
  const items = [
    { id: 'complete', processedUrl: 'blob:complete', processedMime: 'image/jpeg', processedSettingsKey: 'current-key' },
    { id: 'stale', processedUrl: 'blob:stale', processedMime: 'image/jpeg', processedSettingsKey: 'old-key' },
    { id: 'new' },
    { id: 'failed', processingError: 'boom' },
  ];

  it('selects only stale, unprocessed, and failed items by default', () => {
    expect(selectImagesForProcessing(items, expected).map(item => item.id))
      .toEqual(['stale', 'new', 'failed']);
  });

  it('selects every item when force is enabled', () => {
    expect(selectImagesForProcessing(items, expected, true).map(item => item.id))
      .toEqual(['complete', 'stale', 'new', 'failed']);
  });
});

describe('accessible reordering', () => {
  const a = { id: 'a', value: 1 };
  const b = { id: 'b', value: 2 };
  const c = { id: 'c', value: 3 };
  const items = [a, b, c];

  it('does not move the first item up or the last item down', () => {
    expect(moveItem(items, 'a', 'up')).toBe(items);
    expect(moveItem(items, 'c', 'down')).toBe(items);
  });

  it('moves an item without cloning or losing item data', () => {
    const movedUp = moveItem(items, 'b', 'up');
    expect(movedUp).toEqual([b, a, c]);
    expect(movedUp[0]).toBe(b);
    expect(moveItem(items, 'b', 'down')).toEqual([a, c, b]);
  });
});

describe('primary action model', () => {
  it.each([
    ['empty', { command: 'add', label: '添加照片' }],
    ['idle', { command: 'process', label: '开始冲洗' }],
    ['processing', { command: 'stop', label: '停止后续' }],
    ['ready', { command: 'download', label: '下载成片' }],
    ['exporting', { command: 'none', label: '正在打包' }],
  ] as const)('maps %s to one explicit command', (state, action) => {
    expect(getPrimaryAction(state)).toEqual({ ...action, disabled: state === 'exporting' });
  });
});

describe('async image task ownership', () => {
  it('accepts work only while mounted, on the same generation, and while the item exists', () => {
    const current = {
      mounted: true,
      resultGeneration: 3,
      currentGeneration: 3,
      itemExists: true,
    };
    expect(isImageTaskContextCurrent(current)).toBe(true);
    expect(isImageTaskContextCurrent({ ...current, mounted: false })).toBe(false);
    expect(isImageTaskContextCurrent({ ...current, currentGeneration: 4 })).toBe(false);
    expect(isImageTaskContextCurrent({ ...current, itemExists: false })).toBe(false);
  });
});

describe('image removal policy', () => {
  it('locks deletion during export and strip rendering but allows single-batch deletion', () => {
    expect(isImageRemovalAllowed(false, 'single', false)).toBe(true);
    expect(isImageRemovalAllowed(true, 'single', false)).toBe(true);
    expect(isImageRemovalAllowed(true, 'strip', false)).toBe(false);
    expect(isImageRemovalAllowed(false, 'single', true)).toBe(false);
  });
});
