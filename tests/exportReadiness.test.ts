import { describe, expect, it } from 'vitest';
import { evaluateExportReadiness } from '../services/exportReadiness';

const artifact = { url: 'blob:result' };

describe('export readiness', () => {
  it('reports an empty selection without export entries', () => {
    const result = evaluateExportReadiness([
      { item: { id: 'one' }, index: 0, included: false, artifact },
    ]);

    expect(result).toEqual({
      status: 'empty',
      totalCount: 0,
      readyCount: 0,
      pendingCount: 0,
      pendingIds: [],
      readyEntries: [],
    });
  });

  it('reports a complete selection and preserves roll indexes', () => {
    const result = evaluateExportReadiness([
      { item: { id: 'one' }, index: 0, included: true, artifact },
      { item: { id: 'two' }, index: 2, included: true, artifact: { url: 'blob:two' } },
    ]);

    expect(result.status).toBe('complete');
    expect(result.readyCount).toBe(2);
    expect(result.pendingIds).toEqual([]);
    expect(result.readyEntries.map(entry => entry.index)).toEqual([0, 2]);
  });

  it('reports missing and stale artifacts as pending', () => {
    const result = evaluateExportReadiness([
      { item: { id: 'ready' }, index: 0, included: true, artifact },
      { item: { id: 'missing' }, index: 1, included: true, artifact: null },
      { item: { id: 'stale' }, index: 2, included: true, artifact: null },
      { item: { id: 'excluded' }, index: 3, included: false, artifact: null },
    ]);

    expect(result).toMatchObject({
      status: 'incomplete',
      totalCount: 3,
      readyCount: 1,
      pendingCount: 2,
      pendingIds: ['missing', 'stale'],
    });
    expect(result.readyEntries.map(entry => entry.item.id)).toEqual(['ready']);
  });
});
