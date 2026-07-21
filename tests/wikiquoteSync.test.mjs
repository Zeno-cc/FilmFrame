import { describe, expect, it, vi } from 'vitest';
import {
  buildWikiquoteApiUrl,
  collectWikiquoteCandidates,
  extractQuoteCandidates,
  fetchWikiquotePage,
  syncPhotographyQuoteCandidates,
} from '../scripts/sync-photography-quotes.mjs';

const sampleWikitext = `
== Quotes ==
* '''The camera teaches us how to see.'''
** ''A Photographer's Life'' (1978), p. vii
* A second [[photography|photographic]] thought.<ref>Reference</ref>
== Quotes about Sample Photographer ==
* This line must not be imported.
`;

function successfulResponse(title = 'Sample Photographer') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      query: {
        pages: [{
          pageid: 42,
          title,
          revisions: [{
            revid: 1234,
            timestamp: '2026-07-21T00:00:00Z',
            slots: { main: { content: sampleWikitext } },
          }],
        }],
      },
    }),
  };
}

describe('Wikiquote 同步工具', () => {
  it('构造只读取页面修订内容的官方 API 请求', () => {
    const url = new URL(buildWikiquoteApiUrl('Ansel Adams'));
    expect(url.origin).toBe('https://en.wikiquote.org');
    expect(url.searchParams.get('titles')).toBe('Ansel_Adams');
    expect(url.searchParams.get('rvprop')).toContain('content');
  });

  it('只提取 Quotes 区域的顶层名言和首条出处', () => {
    const candidates = extractQuoteCandidates({
      title: 'Sample Photographer',
      revisionId: 1234,
      revisionTimestamp: '2026-07-21T00:00:00Z',
      wikitext: sampleWikitext,
    });
    expect(candidates).toHaveLength(2);
    expect(candidates[0].originalText).toBe('The camera teaches us how to see.');
    expect(candidates[0].sourceDetail).toContain("A Photographer's Life");
    expect(candidates[1].originalText).toBe('A second photographic thought.');
    expect(candidates.some(candidate => candidate.originalText.includes('must not'))).toBe(false);
  });

  it('收集页面后记录候选和修订信息', async () => {
    const payload = await collectWikiquoteCandidates({
      pages: ['Sample Photographer'],
      fetchImpl: vi.fn(async () => successfulResponse()),
      now: () => new Date('2026-07-21T01:00:00Z'),
    });
    expect(payload.generatedAt).toBe('2026-07-21T01:00:00.000Z');
    expect(payload.pages[0].revisionId).toBe(1234);
    expect(payload.pages[0].candidates).toHaveLength(2);
  });

  it('请求失败时不会覆盖既有候选文件', async () => {
    const writeFileImpl = vi.fn();
    await expect(syncPhotographyQuoteCandidates({
      pages: ['Missing Photographer'],
      fetchImpl: vi.fn(async () => ({ ok: false, status: 503 })),
      mkdirImpl: vi.fn(),
      writeFileImpl,
    })).rejects.toThrow(/HTTP 503/);
    expect(writeFileImpl).not.toHaveBeenCalled();
  });

  it('请求超时时会中止且不会无限等待', async () => {
    vi.useFakeTimers();
    try {
      const request = fetchWikiquotePage('Slow Photographer', {
        timeoutMs: 100,
        fetchImpl: vi.fn((_url, options) => new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        })),
      });
      const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(100);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    {
      name: '页面不存在',
      response: { ok: true, status: 200, json: async () => ({ query: { pages: [{ title: 'Missing', missing: true }] } }) },
      message: /页面不存在/,
    },
    {
      name: '页面结构无效',
      response: { ok: true, status: 200, json: async () => ({ query: { pages: [{ title: 'Broken', revisions: [] }] } }) },
      message: /页面结构无效/,
    },
    {
      name: '页面没有候选',
      response: {
        ok: true,
        status: 200,
        json: async () => ({
          query: {
            pages: [{
              pageid: 9,
              title: 'Empty',
              revisions: [{
                revid: 99,
                timestamp: '2026-07-21T00:00:00Z',
                slots: { main: { content: '== External links ==\n* Nothing useful' } },
              }],
            }],
          },
        }),
      },
      message: /没有可用候选/,
    },
  ])('$name时不写候选文件', async ({ response, message }) => {
    const writeFileImpl = vi.fn();
    await expect(syncPhotographyQuoteCandidates({
      pages: ['Sample'],
      fetchImpl: vi.fn(async () => response),
      mkdirImpl: vi.fn(),
      writeFileImpl,
    })).rejects.toThrow(message);
    expect(writeFileImpl).not.toHaveBeenCalled();
  });
});
