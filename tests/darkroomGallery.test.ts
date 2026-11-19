import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DARKROOM_GALLERY_BATCH_SIZE,
  DARKROOM_GALLERY_SPEED_PX_PER_SECOND,
  DARKROOM_GALLERY_TTL_MS,
  decodeDarkroomGalleryImage,
  fetchDarkroomGalleryBatch,
  fetchDarkroomGalleryImage,
  parseDarkroomGalleryCandidates,
  refreshDarkroomGallery,
  type DarkroomGalleryCache,
  type DarkroomGalleryBatch,
  type DarkroomGalleryCachedBatch,
  type DarkroomGalleryAsset,
  type DarkroomGalleryPhoto,
} from '../services/darkroomGallery';

const NOW = 1_800_000_000_000;

const REVIEWED_IDS = [
  52734, 1287239, 2245704, 11161355, 177688553, 3290916,
  11161368, 121434779, 11160803, 16852192, 177688554, 33722198,
  42870426, 177688560, 20002812, 134068417, 177688566, 27937180,
  11161340, 177688569, 121435038, 49179423, 177688571, 86051738,
];
const reviewedId = (index: number) => REVIEWED_IDS[(index - 1) % REVIEWED_IDS.length];

function candidate(pageid: number, license = 'CC BY 4.0') {
  return {
    pageid,
    title: `File:Landscape ${pageid}.jpg`,
    imageinfo: [{
      descriptionurl: `https://commons.wikimedia.org/wiki/File:Landscape_${pageid}.jpg`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/${pageid}/1280px-Landscape_${pageid}.jpg`,
      thumbwidth: 1280,
      thumbheight: 853,
      mime: 'image/jpeg',
      extmetadata: {
        Artist: { value: `<a href="https://commons.wikimedia.org/wiki/User:Example">Photographer ${pageid}</a>` },
        LicenseShortName: { value: license },
        ...(license === 'Public domain' ? {} : {
          LicenseUrl: { value: license === 'CC0'
            ? 'http://creativecommons.org/publicdomain/zero/1.0/'
            : license === 'CC BY-SA 4.0'
              ? 'https://creativecommons.org/licenses/by-sa/4.0/'
              : 'https://creativecommons.org/licenses/by/4.0/' },
        }),
      },
    }],
  };
}

function apiResponse(entries: unknown[]) {
  return new Response(JSON.stringify({ query: { pages: entries } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function imageResponse(pageid: number, mime = 'image/jpeg') {
  const signature = mime === 'image/png'
    ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    : [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];
  return new Response(new Uint8Array([...signature, pageid]), {
    status: 200,
    headers: { 'Content-Type': mime, 'Content-Length': '9' },
  });
}

function createCache(initial?: DarkroomGalleryCachedBatch) {
  let stored = initial ? structuredClone(initial) : undefined;
  const deletedBatchIds: string[] = [];
  const deletedAssetIds: string[] = [];
  const cache: DarkroomGalleryCache = {
    loadLatestBatch: vi.fn(async () => stored ? structuredClone(stored) : null),
    saveBatch: vi.fn(async (batch: DarkroomGalleryBatch, assets: DarkroomGalleryAsset[]) => {
      if (batch.id === 'fail-write') throw new Error('write failed');
      stored = structuredClone({ ...batch, assets });
    }),
    deleteBatch: vi.fn(async (batchId: string, assetIds: string[]) => {
      deletedBatchIds.push(batchId);
      deletedAssetIds.push(...assetIds);
      if (stored?.id === batchId) stored = undefined;
    }),
  };
  return { cache, deletedBatchIds, deletedAssetIds };
}

function photo(id: string): DarkroomGalleryPhoto {
  return {
    id,
    title: `Landscape ${id}`,
    artist: `Photographer ${id}`,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    width: 1280,
    height: 853,
    imageUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/${id}/1280px-${id}.jpg`,
    assetId: `${id}-asset`,
  };
}

function oldBatch(): DarkroomGalleryCachedBatch {
  const photos = Array.from({ length: 12 }, (_, index) => index + 1)
    .map(id => ({ ...photo(`old-${id}`), assetId: `old-asset-${id}` }));
  return {
    id: 'old-batch',
    fetchedAt: NOW - DARKROOM_GALLERY_TTL_MS,
    expiresAt: NOW,
    photos,
    assets: photos.map(item => ({
      id: item.assetId,
      batchId: 'old-batch',
      mime: 'image/jpeg',
      blob: new Blob(['cached image'], { type: 'image/jpeg' }),
    })),
  };
}

const defaultDecode = async (_blob: Blob, signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('aborted');
  return { width: 1280, height: 853 };
};
const decodeImage = vi.fn(defaultDecode);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  decodeImage.mockReset();
  decodeImage.mockImplementation(defaultDecode);
});

describe('Wikimedia 公共摄影批次', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
  });

  it('只收集十二张具有真实署名和允许许可的摄影，不发出认证或来源请求', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/w/api.php')) {
        return apiResponse([
          candidate(1, 'CC BY-SA 3.0'),
          candidate(reviewedId(1), 'CC BY-SA 3.0'),
          ...REVIEWED_IDS.slice(1, 13).map((id, index) => candidate(id,
            ['CC BY-SA 4.0', 'CC0', 'Public domain'][index] ?? 'CC BY 4.0')),
        ]);
      }
      const match = String(url).match(/thumb\/a\/(\d+)\//);
      return imageResponse(Number(match?.[1]));
    });
    const { cache, deletedBatchIds } = createCache();

    const result = await fetchDarkroomGalleryBatch({
      fetch: fetchMock,
      cache,
      now: () => NOW,
      decodeImage,
    });
    expect(fetchMock).toHaveBeenCalledTimes(13);

    expect(DARKROOM_GALLERY_BATCH_SIZE).toBe(12);
    expect(DARKROOM_GALLERY_SPEED_PX_PER_SECOND).toBe(24);
    expect(result.photos).toHaveLength(12);
    expect(result.photos.map(item => item.licenseName)).toEqual([
      'CC BY-SA 4.0', 'CC0', 'Public domain',
      ...Array.from({ length: 9 }, () => 'CC BY 4.0'),
    ]);
    expect(result.photos.map(item => item.artist)).toEqual(
      REVIEWED_IDS.slice(1, 13).map(id => `Photographer ${id}`),
    );
    expect(result.photos[2].licenseUrl).toBe('https://commons.wikimedia.org/wiki/Commons:Licensing#Public_domain');
    expect(result.photos[1].licenseUrl).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
    expect(result.expiresAt).toBe(NOW + DARKROOM_GALLERY_TTL_MS);
    expect(requests).toHaveLength(13);
    expect(requests.every(request => request.init?.credentials === 'omit')).toBe(true);
    expect(requests.every(request => request.init?.referrerPolicy === 'no-referrer')).toBe(true);
    expect(requests[0].url).toContain('pageids=');
    expect(requests[0].url).not.toContain('gcmtitle');
    expect(deletedBatchIds).toEqual([]);
  });

  it.each([
    ['未知许可', candidate(1, 'All rights reserved')],
    ['缺少作者', (() => { const value = candidate(1); value.imageinfo[0].extmetadata.Artist.value = ''; return value; })()],
    ['任意图片主机', (() => { const value = candidate(1); value.imageinfo[0].thumburl = 'https://example.com/photo.jpg'; return value; })()],
    ['不安全来源', (() => { const value = candidate(1); value.imageinfo[0].descriptionurl = 'http://commons.wikimedia.org/wiki/File:x.jpg'; return value; })()],
    ['错误 MIME', (() => { const value = candidate(1); value.imageinfo[0].mime = 'image/svg+xml'; return value; })()],
    ['许可链接不匹配', (() => {
      const value = candidate(1);
      value.imageinfo[0].extmetadata = {
        ...value.imageinfo[0].extmetadata,
        LicenseUrl: { value: 'https://example.com/license' },
      };
      return value;
    })()],
  ])('拒绝%s且不会下载其内容', async (_name, entry) => {
    const fetchMock = vi.fn(async () => apiResponse([entry]));
    const { cache } = createCache();
    await expect(fetchDarkroomGalleryBatch({ fetch: fetchMock, cache, decodeImage })).rejects.toThrow(/完整|候选/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.saveBatch).not.toHaveBeenCalled();
  });

  it('只接受匹配许可名称的官方链接，拒绝伪造的许可回退', () => {
    const publicDomain = candidate(REVIEWED_IDS[0], 'Public domain');
    const parsed = parseDarkroomGalleryCandidates({ query: { pages: [publicDomain] } }, true);
    expect(parsed[0].licenseUrl).toBe('https://commons.wikimedia.org/wiki/Commons:Licensing#Public_domain');
    const forged = candidate(REVIEWED_IDS[0], 'Public domain') as ReturnType<typeof candidate> & {
      imageinfo: Array<{ extmetadata: Record<string, { value: string }> }>;
    };
    forged.imageinfo[0].extmetadata.LicenseUrl = { value: 'https://example.com/public-domain' };
    expect(parseDarkroomGalleryCandidates({ query: { pages: [forged] } }, true)).toEqual([]);
  });

  it('接受 Commons 为 TIFF 档案生成的 JPEG 缩略图，不直接下载 TIFF 原图', () => {
    const archive = candidate(42870426);
    archive.title = 'File:Dorothea Lange - Migrant Family in Salinas, CA.tif';
    archive.imageinfo[0].mime = 'image/tiff';
    archive.imageinfo[0].thumburl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Dorothea_Lange_-_Migrant_Family_in_Salinas%2C_CA.tif/lossy-page1-960px-Dorothea_Lange_-_Migrant_Family_in_Salinas%2C_CA.tif.jpg';
    const [parsed] = parseDarkroomGalleryCandidates({ query: { pages: [archive] } }, true);
    expect(parsed.imageUrl).toContain('.tif.jpg');
    expect(parsed.title).toBe('Dorothea Lange - Migrant Family in Salinas, CA');
  });

  it('限制 API 主机、响应 JSON 和图片响应 URL，并验证 MIME 与文件签名', async () => {
    const { cache } = createCache();
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const value = String(url);
      if (value.includes('/w/api.php')) return apiResponse([1, 2, 3, 4].map(id => candidate(reviewedId(id))));
      if (value.includes(`/${reviewedId(1)}/`)) return new Response('not json', { status: 200, headers: { 'Content-Type': 'text/html' } });
      if (value.includes(`/${reviewedId(2)}/`)) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png' } });
      if (value.includes(`/${reviewedId(3)}/`)) return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
      return imageResponse(reviewedId(4));
    });

    await expect(fetchDarkroomGalleryBatch({ fetch: fetchMock, cache, decodeImage })).rejects.toThrow(/完整|图片/);
    expect(cache.saveBatch).not.toHaveBeenCalled();
    const calls = fetchMock.mock.calls;
    const oversized = await fetchDarkroomGalleryBatch({
      fetch: vi.fn(async (url: RequestInfo | URL) => String(url).includes('/w/api.php')
        ? apiResponse([candidate(1)])
        : new Response(new Uint8Array(4 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'image/jpeg' } })),
      cache,
      decodeImage,
    }).catch(error => error);
    expect(oversized).toBeInstanceOf(Error);
    expect(cache.saveBatch).not.toHaveBeenCalled();
    expect(calls.every(([url]) => String(url).startsWith('https://commons.wikimedia.org/w/api.php?')
      || String(url).startsWith('https://upload.wikimedia.org/'))).toBe(true);
  });

  it('要求图片真实解码并限制异常尺寸', async () => {
    const { cache } = createCache();
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => String(url).includes('/w/api.php')
      ? apiResponse([1, 2, 3, 4].map(id => candidate(reviewedId(id))))
      : imageResponse(Number(String(url).match(/thumb\/a\/(\d+)\//)?.[1])));
    decodeImage.mockResolvedValueOnce({ width: 0, height: 100 });
    await expect(fetchDarkroomGalleryBatch({ fetch: fetchMock, cache, decodeImage })).rejects.toThrow(/完整|解码/);
    expect(cache.saveBatch).not.toHaveBeenCalled();
  });

  it('响应体超时会取消读取，而不是挂起共享请求', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() { cancelled = true; },
    });
    const pending = fetchDarkroomGalleryImage(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/1/photo.jpg',
      vi.fn(async () => new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })),
    );
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(12_001);
    await assertion;
    expect(cancelled).toBe(true);
  });

  it('图片解码卡住时会按超时结束', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise(() => undefined)));
    const pending = decodeDarkroomGalleryImage(new Blob(['photo'], { type: 'image/jpeg' }));
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(12_001);
    await assertion;
  });

  it('到期换批先持久化完整十二张，再发布新批次', async () => {
    const previous = oldBatch();
    const { cache } = createCache(previous);
    const calls: string[] = [];
    const saveBatch = cache.saveBatch;
    cache.saveBatch = vi.fn(async (batch, assets) => {
      calls.push(`save:${batch.id}`);
      expect(assets).toHaveLength(12);
      await saveBatch(batch, assets);
    });
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => String(url).includes('/w/api.php')
      ? apiResponse(REVIEWED_IDS.map(id => candidate(id)))
      : imageResponse(Number(String(url).match(/thumb\/a\/(\d+)\//)?.[1])));

    const result = await refreshDarkroomGallery({ fetch: fetchMock, cache, decodeImage, now: () => NOW });
    expect(fetchMock).toHaveBeenCalledTimes(13);
    expect(result.previousBatchId).toBe(previous.id);
    expect(result.batch.photos).toHaveLength(12);
    expect(calls).toEqual([`save:${result.batch.id}`]);
  });

  it('下载或写入不完整时保留旧批次且不删除资源', async () => {
    for (const mode of ['download', 'write'] as const) {
      const previous = oldBatch();
      const { cache } = createCache(previous);
      const fetchMock = vi.fn(async (url: RequestInfo | URL) => String(url).includes('/w/api.php')
        ? apiResponse(REVIEWED_IDS.map(id => candidate(id)))
        : mode === 'download' ? new Response('bad image', { status: 200, headers: { 'Content-Type': 'text/html' } }) : imageResponse(99));
      if (mode === 'write') (cache.saveBatch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disk full'));
      const result = await refreshDarkroomGallery({ fetch: fetchMock, cache, decodeImage, now: () => NOW });
      expect(result.batch).toEqual(previous);
      expect(cache.deleteBatch).not.toHaveBeenCalled();
    }
  });

  it('当前审核池到期后换到另一组不重复的十二张', async () => {
    const first = REVIEWED_IDS.slice(0, 12);
    const previous: DarkroomGalleryCachedBatch = {
      id: 'first-batch',
      fetchedAt: NOW - DARKROOM_GALLERY_TTL_MS,
      expiresAt: NOW,
      photos: first.map(id => photo(`commons-${id}`)),
      assets: [],
    };
    const { cache } = createCache(previous);
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => String(url).includes('/w/api.php')
      ? apiResponse(REVIEWED_IDS.map(id => candidate(id)))
      : imageResponse(1));
    const result = await refreshDarkroomGallery({ fetch: fetchMock, cache, decodeImage, now: () => NOW });
    expect(result.batch.photos.map(photo => photo.id)).toEqual(REVIEWED_IDS.slice(12).map(id => `commons-${id}`));
    expect(result.batch.photos.some(photo => previous.photos.some(old => old.id === photo.id))).toBe(false);
  });

  it('同批与历史批次的资源 ID 互不覆盖', async () => {
    const { cache } = createCache();
    const entries = [1, 1, ...Array.from({ length: 13 }, (_, index) => index + 2)].map(id => candidate(reviewedId(id)));
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => String(url).includes('/w/api.php')
      ? apiResponse(entries)
      : imageResponse(Number(String(url).match(/thumb\/a\/(\d+)\//)?.[1])));
    const result = await fetchDarkroomGalleryBatch({ fetch: fetchMock, cache, decodeImage, now: () => NOW });
    expect(new Set(result.photos.map(item => item.id)).size).toBe(12);
    expect(new Set(result.assets.map(asset => asset.id)).size).toBe(12);
    expect(result.assets.map(asset => asset.id)).toEqual(result.photos.map(item => item.assetId));
  });

  it('IndexedDB 不可用时不下载无法持久化的公共图片', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const fetchMock = vi.fn();
    await expect(refreshDarkroomGallery({ fetch: fetchMock, decodeImage, now: () => NOW }))
      .rejects.toThrow(/IndexedDB/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('单页内去重刷新，且不依赖 navigator.locks', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const { cache } = createCache();
    let releaseApi!: (response: Response) => void;
    const waiting = new Promise<Response>(resolve => { releaseApi = resolve; });
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => String(url).includes('/w/api.php')
      ? waiting : imageResponse(Number(String(url).match(/thumb\/a\/(\d+)\//)?.[1])));
    const first = refreshDarkroomGallery({ fetch: fetchMock, cache, decodeImage, now: () => NOW });
    const second = refreshDarkroomGallery({ fetch: fetchMock, cache, decodeImage, now: () => NOW });
    releaseApi(apiResponse(REVIEWED_IDS.map(id => candidate(id))));
    await Promise.all([first, second]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/w/api.php'))).toHaveLength(1);
    expect(cache.saveBatch).toHaveBeenCalledTimes(1);
  });

  it('一个订阅者卸载不会中止仍在等待的共享请求', async () => {
    const { cache } = createCache();
    const firstController = new AbortController();
    let releaseApi!: (response: Response) => void;
    const waiting = new Promise<Response>(resolve => { releaseApi = resolve; });
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/w/api.php')) return waiting;
      return imageResponse(Number(String(url).match(/thumb\/a\/(\d+)\//)?.[1]));
    });
    const first = refreshDarkroomGallery({ fetch: fetchMock, cache, decodeImage, signal: firstController.signal, now: () => NOW });
    const second = refreshDarkroomGallery({ fetch: fetchMock, cache, decodeImage, now: () => NOW });
    firstController.abort(new DOMException('first page unmounted', 'AbortError'));
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise<void>(resolve => { setTimeout(resolve, 0); });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    releaseApi(apiResponse(REVIEWED_IDS.map(id => candidate(id))));
    await expect(second).resolves.toMatchObject({ batch: { photos: expect.any(Array) } });
    expect(cache.saveBatch).toHaveBeenCalledTimes(1);
  });

  it('最后一个订阅者卸载会中止未完成的公共请求', async () => {
    const { cache } = createCache();
    const controller = new AbortController();
    let requestSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    });
    const pending = refreshDarkroomGallery({ fetch: fetchMock, cache, decodeImage, signal: controller.signal, now: () => NOW });
    await vi.waitFor(() => expect(requestSignal).toBeDefined());
    controller.abort(new DOMException('page unmounted', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(requestSignal?.aborted).toBe(true));
    expect(cache.saveBatch).not.toHaveBeenCalled();
  });

  it('过期缓存在新批次失败时继续显示且不删除任何资源', async () => {
    const previous = oldBatch();
    const { cache } = createCache(previous);
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    const result = await refreshDarkroomGallery({ fetch: fetchMock, cache, now: () => NOW });
    expect(result.batch).toEqual(previous);
    expect(cache.deleteBatch).not.toHaveBeenCalled();
    expect(cache.saveBatch).not.toHaveBeenCalled();
  });

  it('未过期缓存直接返回，零网络请求且不删除任何批次', async () => {
    const cachedPhotos = REVIEWED_IDS.slice(0, 12).map(id => ({
      ...photo(`commons-${id}`),
      assetId: `cached-asset-${id}`,
    }));
    const fresh: DarkroomGalleryCachedBatch = {
      ...oldBatch(),
      id: 'reviewed-batch',
      expiresAt: NOW + 1,
      photos: cachedPhotos,
      assets: cachedPhotos.map(item => ({
        id: item.assetId,
        batchId: 'reviewed-batch',
        mime: 'image/jpeg',
        blob: new Blob(['cached image'], { type: 'image/jpeg' }),
      })),
    };
    const { cache } = createCache(fresh);
    const fetchMock = vi.fn();
    const result = await refreshDarkroomGallery({ fetch: fetchMock, cache, now: () => NOW });
    expect(result.batch).toEqual(fresh);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cache.deleteBatch).not.toHaveBeenCalled();
    expect(cache.saveBatch).not.toHaveBeenCalled();
  });

  it('未过期但不在当前审核池的旧缓存仍触发完整刷新', async () => {
    const stale = { ...oldBatch(), expiresAt: NOW + DARKROOM_GALLERY_TTL_MS };
    const { cache } = createCache(stale);
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => String(url).includes('/w/api.php')
      ? apiResponse(REVIEWED_IDS.map(id => candidate(id)))
      : imageResponse(1));
    const result = await refreshDarkroomGallery({ fetch: fetchMock, cache, decodeImage, now: () => NOW });
    expect(fetchMock).toHaveBeenCalledTimes(13);
    expect(result.batch.photos.map(item => item.id)).toEqual(REVIEWED_IDS.slice(0, 12).map(id => `commons-${id}`));
  });

  it('取消刷新时传播中止，不继续下载或保存候选', async () => {
    const { cache } = createCache();
    const controller = new AbortController();
    const abortError = new DOMException('Unmounted', 'AbortError');
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/w/api.php')) return apiResponse(REVIEWED_IDS.map(id => candidate(id)));
      controller.abort(abortError);
      return Promise.reject(abortError);
    });
    await expect(refreshDarkroomGallery({
      fetch: fetchMock,
      cache,
      decodeImage,
      signal: controller.signal,
      now: () => NOW,
    })).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cache.saveBatch).not.toHaveBeenCalled();
  });

  it('不可联网时不请求，并保留当前缓存', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const previous = oldBatch();
    const { cache } = createCache(previous);
    const fetchMock = vi.fn();
    await expect(refreshDarkroomGallery({ fetch: fetchMock, cache, decodeImage })).rejects.toThrow(/离线/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cache.deleteBatch).not.toHaveBeenCalled();
  });
});
