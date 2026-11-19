import { darkroomGalleryCache } from './darkroomGalleryCache';

export const DARKROOM_GALLERY_BATCH_SIZE = 12;
export const DARKROOM_GALLERY_SPEED_PX_PER_SECOND = 24;
export const DARKROOM_GALLERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DARKROOM_GALLERY_MAX_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;
const IMAGE_WIDTH = 1280;
const MAX_IMAGE_PIXELS = 40_000_000;
const WIKIMEDIA_API_URL = 'https://commons.wikimedia.org/w/api.php';
const IMAGE_HOSTS = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org']);
// Every file has been visually reviewed and individually checked for attribution.
// Two disjoint sets of twelve make a seven-day replacement a real new batch.
const REVIEWED_DOCUMENTARY_PAGE_IDS = [
  52734, 1287239, 2245704, 11161355, 177688553, 3290916,
  11161368, 121434779, 11160803, 16852192, 177688554, 33722198,
  42870426, 177688560, 20002812, 134068417, 177688566, 27937180,
  11161340, 177688569, 121435038, 49179423, 177688571, 86051738,
] as const;
const REVIEWED_DOCUMENTARY_IDS = new Set(REVIEWED_DOCUMENTARY_PAGE_IDS.map(id => `commons-${id}`));
const REVIEWED_ARTIST_OVERRIDES: Record<number, string> = {
  20002812: 'Walker Evans',
  49179423: 'Dorothea Lange / Adam Cuerden',
};
const LICENSE_URLS: Record<string, string> = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'Public domain': 'https://commons.wikimedia.org/wiki/Commons:Licensing#Public_domain',
};
const LICENSE_NAMES = Object.keys(LICENSE_URLS);

export interface DarkroomGalleryPhoto {
  id: string;
  assetId: string;
  title: string;
  artist: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  width: number;
  height: number;
  imageUrl: string;
}

export interface DarkroomGalleryBatch {
  id: string;
  fetchedAt: number;
  expiresAt: number;
  photos: DarkroomGalleryPhoto[];
}

export interface DarkroomGalleryAsset {
  id: string;
  batchId: string;
  mime: 'image/jpeg' | 'image/png';
  blob: Blob;
}

export interface DarkroomGalleryCachedBatch extends DarkroomGalleryBatch {
  assets: DarkroomGalleryAsset[];
}

export interface DarkroomGalleryCache {
  loadLatestBatch(): Promise<DarkroomGalleryCachedBatch | null>;
  saveBatch(batch: DarkroomGalleryBatch, assets: DarkroomGalleryAsset[]): Promise<void>;
  deleteBatch(batchId: string, assetIds: string[]): Promise<void>;
  isAvailable?(): boolean;
}

export interface DarkroomGalleryFetchOptions {
  fetch?: typeof globalThis.fetch;
  cache?: DarkroomGalleryCache;
  signal?: AbortSignal;
  now?: () => number;
  decodeImage?: (blob: Blob, signal?: AbortSignal) => Promise<{ width: number; height: number }>;
  previousIds?: ReadonlySet<string>;
}

export interface RefreshDarkroomGalleryResult {
  batch: DarkroomGalleryCachedBatch;
  previousBatchId?: string;
}

interface NavigatorWithLocks {
  locks?: {
    request<T>(name: string, callback: (lock: unknown) => Promise<T>): Promise<T>;
  };
}

interface SharedRefresh {
  controller: AbortController;
  subscriberCount: number;
  cancelTimer?: ReturnType<typeof globalThis.setTimeout>;
  promise: Promise<RefreshDarkroomGalleryResult>;
}

let localRefresh: SharedRefresh | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('公共摄影请求已取消', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function metadataValue(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  if (!isRecord(value) || typeof value.value !== 'string') return '';
  return value.value.trim();
}

function trustedHttpsUrl(value: string, hosts?: ReadonlySet<string>): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (hosts && !hosts.has(url.hostname))) {
    throw new Error('公共摄影来源地址不受信任');
  }
  return url;
}

function htmlToText(value: string): string {
  if (typeof document !== 'undefined') {
    const template = document.createElement('template');
    template.innerHTML = value;
    return (template.content.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  }
  // Metadata is untrusted HTML. Strip tags and decode common character entities;
  // it is only ever exposed as plain attribution text in the component.
  const namedEntities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return namedEntities[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function parseDarkroomGalleryCandidates(payload: unknown, reviewedOnly = false): DarkroomGalleryPhoto[] {
  // formatversion=2 deliberately returns an array, not the legacy page-ID map.
  if (!isRecord(payload) || !isRecord(payload.query) || !Array.isArray(payload.query.pages)) {
    throw new Error('Wikimedia 返回的候选结构无效');
  }
  const photos: DarkroomGalleryPhoto[] = [];
  const ids = new Set<string>();
  for (const page of payload.query.pages) {
    if (!isRecord(page) || !Array.isArray(page.imageinfo) || !isRecord(page.imageinfo[0])) continue;
    const info = page.imageinfo[0];
    if (typeof info.descriptionurl !== 'string' || typeof info.thumburl !== 'string') continue;
    // A TIFF archive may be delivered as an official JPEG derivative.
    const thumbMime = typeof info.thumbmime === 'string' ? info.thumbmime
      : /\/lossy-page\d+-[^/]+\.tiff?\.jpg$/i.test(info.thumburl) ? 'image/jpeg' : info.mime;
    if (thumbMime !== 'image/jpeg' && thumbMime !== 'image/png') continue;
    const metadata = isRecord(info.extmetadata) ? info.extmetadata : {};
    const licenseName = metadataValue(metadata, 'LicenseShortName');
    const artist = htmlToText(metadataValue(metadata, 'Artist'));
    if (!LICENSE_NAMES.includes(licenseName) || !artist) continue;
    try {
      const sourceUrl = trustedHttpsUrl(info.descriptionurl, new Set(['commons.wikimedia.org']));
      const imageUrl = trustedHttpsUrl(info.thumburl, IMAGE_HOSTS);
      const canonicalLicense = new URL(LICENSE_URLS[licenseName]);
      const declaredLicenseUrl = metadataValue(metadata, 'LicenseUrl');
      if (declaredLicenseUrl) {
        const licenseUrl = new URL(declaredLicenseUrl);
        if (
          (licenseUrl.protocol !== 'https:' && !(licenseUrl.protocol === 'http:' && licenseUrl.hostname === canonicalLicense.hostname))
          || licenseUrl.username || licenseUrl.password
          || licenseUrl.hostname !== canonicalLicense.hostname
          || licenseUrl.pathname.replace(/\/$/, '') !== canonicalLicense.pathname.replace(/\/$/, '')
        ) continue;
      }
      // Public-domain Commons records often omit LicenseUrl. The accepted
      // license name determines this fixed official link, never arbitrary input.
      if (typeof page.title !== 'string' || !page.title.startsWith('File:') || !Number.isSafeInteger(page.pageid)) continue;
      if (reviewedOnly && !REVIEWED_DOCUMENTARY_PAGE_IDS.includes(Number(page.pageid) as typeof REVIEWED_DOCUMENTARY_PAGE_IDS[number])) continue;
      const id = `commons-${page.pageid}`;
      if (ids.has(id)) continue;
      const width = typeof info.thumbwidth === 'number' ? info.thumbwidth
        : typeof info.width === 'number' ? info.width : 0;
      const height = typeof info.thumbheight === 'number' ? info.thumbheight
        : typeof info.height === 'number' ? info.height : 0;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
      ids.add(id);
      photos.push({
        id,
        assetId: `${id}-${imageUrl.pathname.split('/').pop()?.slice(0, 100) ?? 'image'}`,
        title: page.title.slice(5).replace(/\.(?:jpe?g|png|tiff?)$/i, '').replaceAll('_', ' ').slice(0, 200),
        artist: REVIEWED_ARTIST_OVERRIDES[Number(page.pageid)] ?? artist,
        sourceUrl: sourceUrl.href,
        licenseName,
        licenseUrl: canonicalLicense.href,
        width,
        height,
        imageUrl: imageUrl.href,
      });
    } catch {
      // Invalid external URLs are not gallery candidates.
    }
  }
  return photos;
}

function timeoutSignal(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort, { once: true });
  const timer = globalThis.setTimeout(() => controller.abort(new DOMException('公共摄影请求超时', 'TimeoutError')), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timer);
      parent?.removeEventListener('abort', abort);
    },
  };
}

async function publicRequest<T>(
  fetchGallery: typeof globalThis.fetch,
  url: string,
  signal: AbortSignal | undefined,
  accept: string,
  consume: (response: Response, requestSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeout = timeoutSignal(signal, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchGallery(url, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: accept },
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error(`公共摄影请求失败: ${response.status}`);
    const result = await consume(response, timeout.signal);
    if (timeout.signal.aborted) {
      throw timeout.signal.reason ?? new DOMException('公共摄影请求已取消', 'AbortError');
    }
    return result;
  } finally {
    timeout.cleanup();
  }
}

export async function fetchDarkroomGalleryImage(
  url: string,
  fetchGallery: typeof globalThis.fetch,
  signal?: AbortSignal,
): Promise<Blob> {
  trustedHttpsUrl(url, IMAGE_HOSTS);
  return publicRequest(fetchGallery, url, signal, 'image/jpeg,image/png', async (response, requestSignal) => {
    trustedHttpsUrl(response.url || url, IMAGE_HOSTS);
    const mime = response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
    if (mime !== 'image/jpeg' && mime !== 'image/png') throw new Error('公共摄影响应不是 JPEG 或 PNG');
    const declaredSize = Number(response.headers.get('Content-Length'));
    if (Number.isFinite(declaredSize) && declaredSize > DARKROOM_GALLERY_MAX_BYTES) {
      await response.body?.cancel();
      throw new Error('公共摄影图片超过体积限制');
    }
    if (!response.body) {
      const blob = await response.blob();
      if (blob.size > DARKROOM_GALLERY_MAX_BYTES) throw new Error('公共摄影图片超过体积限制');
      return validateImageSignature(blob, mime);
    }
    const reader = response.body.getReader();
    const cancelReader = () => { void reader.cancel().catch(() => undefined); };
    requestSignal.addEventListener('abort', cancelReader, { once: true });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > DARKROOM_GALLERY_MAX_BYTES) {
          await reader.cancel();
          throw new Error('公共摄影图片超过体积限制');
        }
        chunks.push(value);
      }
    } finally {
      requestSignal.removeEventListener('abort', cancelReader);
      reader.releaseLock();
    }
    if (requestSignal.aborted) {
      throw requestSignal.reason ?? new DOMException('公共摄影请求已取消', 'AbortError');
    }
    return validateImageSignature(new Blob(chunks as BlobPart[], { type: mime }), mime);
  });
}

async function validateImageSignature(blob: Blob, mime: string): Promise<Blob> {
  if (blob.size < 8) throw new Error('公共摄影图片为空或已损坏');
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const valid = mime === 'image/png'
    ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!valid) throw new Error('公共摄影图片内容与 MIME 不一致');
  return blob;
}

export async function decodeDarkroomGalleryImage(
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ width: number; height: number }> {
  const timeout = timeoutSignal(signal, REQUEST_TIMEOUT_MS);
  let objectUrl: string | undefined;
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await new Promise<ImageBitmap>((resolve, reject) => {
        const abort = () => reject(timeout.signal.reason ?? new DOMException('公共摄影图片解码已取消', 'AbortError'));
        timeout.signal.addEventListener('abort', abort, { once: true });
        createImageBitmap(blob).then(value => {
          timeout.signal.removeEventListener('abort', abort);
          if (timeout.signal.aborted) {
            value.close();
            reject(timeout.signal.reason ?? new DOMException('公共摄影图片解码已取消', 'AbortError'));
          } else {
            resolve(value);
          }
        }, error => {
          timeout.signal.removeEventListener('abort', abort);
          reject(error);
        });
      });
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    }
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
      throw new Error('当前环境无法解码公共摄影图片');
    }
    objectUrl = URL.createObjectURL(blob);
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
        timeout.signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        cleanup();
        image.src = '';
        reject(timeout.signal.reason ?? new DOMException('公共摄影图片解码已取消', 'AbortError'));
      };
      image.onload = () => { cleanup(); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = () => { cleanup(); reject(new Error('公共摄影图片解码失败')); };
      timeout.signal.addEventListener('abort', abort, { once: true });
      if (timeout.signal.aborted) abort();
      else image.src = objectUrl!;
    });
    return dimensions;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    timeout.cleanup();
  }
}

export async function fetchDarkroomGalleryBatch(
  options: DarkroomGalleryFetchOptions = {},
): Promise<DarkroomGalleryCachedBatch> {
  const fetchGallery = options.fetch ?? globalThis.fetch;
  if (typeof fetchGallery !== 'function') throw new Error('当前环境无法获取公共摄影');
  const now = options.now ?? Date.now;
  const decodeImage = options.decodeImage ?? decodeDarkroomGalleryImage;
  const apiUrl = new URL(WIKIMEDIA_API_URL);
  apiUrl.search = new URLSearchParams({
    action: 'query',
    pageids: REVIEWED_DOCUMENTARY_PAGE_IDS.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(IMAGE_WIDTH),
    format: 'json',
    formatversion: '2',
    origin: '*',
  }).toString();
  const payload = await publicRequest(fetchGallery, apiUrl.href, options.signal, 'application/json', async response => {
    trustedHttpsUrl(response.url || apiUrl.href, new Set(['commons.wikimedia.org']));
    const mime = response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
    if (mime !== 'application/json') throw new Error('Wikimedia 响应不是 JSON');
    return response.json();
  });
  const candidates = parseDarkroomGalleryCandidates(payload, true);
  const candidateById = new Map(candidates.map(photo => [photo.id, photo]));
  const ordered = REVIEWED_DOCUMENTARY_PAGE_IDS.flatMap(id => {
    const candidate = candidateById.get(`commons-${id}`);
    return candidate ? [candidate] : [];
  });
  const fresh = ordered.filter(photo => !options.previousIds?.has(photo.id));
  // Legacy caches must be upgraded once a complete reviewed batch is durable.
  // Two reviewed, disjoint batches then alternate without repeating old IDs.
  const selected = fresh.length >= DARKROOM_GALLERY_BATCH_SIZE ? fresh : ordered;
  if (selected.length < DARKROOM_GALLERY_BATCH_SIZE) {
    throw new Error('Wikimedia 没有足够的完整许可候选');
  }

  // Bound the number of downloads; never publish a partially downloaded group.
  const photos: DarkroomGalleryPhoto[] = [];
  const assets: DarkroomGalleryAsset[] = [];
  for (const candidate of selected.slice(0, 12)) {
    throwIfAborted(options.signal);
    try {
      const blob = await fetchDarkroomGalleryImage(candidate.imageUrl, fetchGallery, options.signal);
      const dimensions = await decodeImage(blob, options.signal);
      if (
        !Number.isSafeInteger(dimensions.width)
        || !Number.isSafeInteger(dimensions.height)
        || dimensions.width <= 0
        || dimensions.height <= 0
        || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
      ) {
        throw new Error('公共摄影图片解码尺寸无效');
      }
      photos.push({ ...candidate, ...dimensions });
      assets.push({
        id: candidate.assetId,
        batchId: '',
        mime: blob.type as DarkroomGalleryAsset['mime'],
        blob,
      });
      if (photos.length === DARKROOM_GALLERY_BATCH_SIZE) break;
    } catch (error) {
      if (options.signal?.aborted || isAbortError(error)) throw error;
      // Try the next already validated candidate.
    }
  }
  if (photos.length !== DARKROOM_GALLERY_BATCH_SIZE) {
    throw new Error('公共摄影完整十二图批次未就绪');
  }
  const fetchedAt = now();
  const batchId = `batch-${fetchedAt}-${photos.map(photo => photo.id).join('-')}`;
  const ownedPhotos = photos.map(photo => ({
    ...photo,
    assetId: `${batchId}-${photo.assetId}`,
  }));
  assets.forEach((asset, index) => {
    asset.id = ownedPhotos[index].assetId;
    asset.batchId = batchId;
  });
  const batch: DarkroomGalleryBatch = {
    id: batchId,
    fetchedAt,
    expiresAt: fetchedAt + DARKROOM_GALLERY_TTL_MS,
    photos: ownedPhotos,
  };
  const cache = options.cache ?? darkroomGalleryCache;
  await cache.saveBatch(batch, assets);
  return { ...batch, assets };
}

async function startDarkroomGalleryRefresh(
  options: DarkroomGalleryFetchOptions,
): Promise<RefreshDarkroomGalleryResult> {
  const cache = options.cache ?? darkroomGalleryCache;
  const now = options.now ?? Date.now;
  const isCurrentPool = (batch: DarkroomGalleryCachedBatch | null) => Boolean(
    batch
    && batch.photos.length === DARKROOM_GALLERY_BATCH_SIZE
    && batch.photos.every(photo => REVIEWED_DOCUMENTARY_IDS.has(photo.id)),
  );
  const previous = await cache.loadLatestBatch();
  const validPrevious = previous?.photos.length === DARKROOM_GALLERY_BATCH_SIZE ? previous : null;
  throwIfAborted(options.signal);
  if (isCurrentPool(validPrevious) && validPrevious && validPrevious.expiresAt > now()) {
    return { batch: validPrevious };
  }
  const run = async (): Promise<RefreshDarkroomGalleryResult> => {
    // Re-read after acquiring the lock: another tab may already have finished.
    const stored = await cache.loadLatestBatch();
    const latest = stored?.photos.length === DARKROOM_GALLERY_BATCH_SIZE ? stored : null;
    throwIfAborted(options.signal);
    if (isCurrentPool(latest) && latest && latest.expiresAt > now()) {
      return { batch: latest, previousBatchId: latest.id === validPrevious?.id ? undefined : validPrevious?.id };
    }
    if (cache === darkroomGalleryCache && cache.isAvailable?.() === false) {
      throw new Error('公共摄影 IndexedDB 不可用');
    }
    const batch = await fetchDarkroomGalleryBatch({
      ...options,
      previousIds: new Set(latest?.photos.map(photo => photo.id) ?? validPrevious?.photos.map(photo => photo.id)),
    }).catch(error => {
      if (latest && !isAbortError(error) && !options.signal?.aborted) {
        return { ...latest, assets: latest.assets };
      }
      throw error;
    });
    if (latest && batch.id !== latest.id) {
      return { batch, previousBatchId: latest.id };
    }
    return { batch, previousBatchId: latest?.id };
  };
  const lockNavigator = typeof navigator !== 'undefined'
    ? (navigator as NavigatorWithLocks).locks
    : undefined;
  return lockNavigator ? lockNavigator.request('filmframe-darkroom-gallery-refresh', run) : run();
}

export function refreshDarkroomGallery(
  options: DarkroomGalleryFetchOptions = {},
): Promise<RefreshDarkroomGalleryResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.reject(new Error('当前离线，保留已有公共摄影'));
  }
  throwIfAborted(options.signal);
  let shared = localRefresh;
  if (!shared) {
    const controller = new AbortController();
    const promise = startDarkroomGalleryRefresh({ ...options, signal: controller.signal });
    shared = { controller, subscriberCount: 0, promise };
    localRefresh = shared;
    void promise.then(() => {
      if (localRefresh === shared) localRefresh = undefined;
    }, () => {
      if (localRefresh === shared) localRefresh = undefined;
    });
  }
  const current = shared;
  current.subscriberCount += 1;
  if (current.cancelTimer !== undefined) {
    globalThis.clearTimeout(current.cancelTimer);
    current.cancelTimer = undefined;
  }
  let subscribed = true;
  const unsubscribe = () => {
    if (!subscribed) return;
    subscribed = false;
    current.subscriberCount -= 1;
    if (current.subscriberCount === 0 && localRefresh === current) {
      current.cancelTimer = globalThis.setTimeout(() => {
        if (current.subscriberCount === 0 && localRefresh === current) {
          current.controller.abort(new DOMException('公共摄影页面已卸载', 'AbortError'));
        }
      }, 0);
    }
  };
  return new Promise<RefreshDarkroomGalleryResult>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', onAbort);
      unsubscribe();
      complete();
    };
    const onAbort = () => finish(() => {
      reject(options.signal?.reason ?? new DOMException('公共摄影订阅已取消', 'AbortError'));
    });
    current.promise.then(
      batch => finish(() => resolve(batch)),
      error => finish(() => reject(error)),
    );
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
  });
}
