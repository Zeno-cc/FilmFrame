import { DARKROOM_GALLERY_BATCH_SIZE } from './darkroomGallery';
import type {
  DarkroomGalleryAsset,
  DarkroomGalleryBatch,
  DarkroomGalleryCache,
  DarkroomGalleryCachedBatch,
} from './darkroomGallery';

export const DARKROOM_GALLERY_DATABASE_NAME = 'filmframe-darkroom-gallery';
const DATABASE_VERSION = 1;
const BATCHES_STORE = 'batches';
const ASSETS_STORE = 'assets';
const OPEN_TIMEOUT_MS = 5_000;

interface StoredAsset {
  id: string;
  batchId: string;
  mime: 'image/jpeg' | 'image/png';
  bytes: ArrayBuffer;
}

export interface DarkroomGalleryCacheOptions {
  indexedDB?: IDBFactory;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('公共摄影缓存读取失败'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('公共摄影缓存写入失败'));
    transaction.onabort = () => reject(transaction.error ?? new Error('公共摄影缓存事务已回滚'));
  });
}

function openDatabase(indexedDB: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DARKROOM_GALLERY_DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    const timeout = globalThis.setTimeout(() => reject(new Error('公共摄影 IndexedDB 打开超时')), OPEN_TIMEOUT_MS);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BATCHES_STORE)) {
        database.createObjectStore(BATCHES_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(ASSETS_STORE)) {
        const assets = database.createObjectStore(ASSETS_STORE, { keyPath: 'id' });
        assets.createIndex('batchId', 'batchId', { unique: false });
      }
    };
    request.onsuccess = () => {
      globalThis.clearTimeout(timeout);
      resolve(request.result);
    };
    request.onerror = () => {
      globalThis.clearTimeout(timeout);
      reject(request.error ?? new Error('公共摄影 IndexedDB 不可用'));
    };
    request.onblocked = () => {
      globalThis.clearTimeout(timeout);
      reject(new Error('公共摄影 IndexedDB 被阻止'));
    };
  });
}

function validImageSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/png') {
    return bytes.length >= 8
      && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  }
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function validateBatch(value: DarkroomGalleryBatch | undefined): value is DarkroomGalleryBatch {
  return Boolean(
    value
    && typeof value.id === 'string'
    && Number.isFinite(value.fetchedAt)
    && Number.isFinite(value.expiresAt)
    && Array.isArray(value.photos)
    && value.photos.length === DARKROOM_GALLERY_BATCH_SIZE
    && value.photos.every(photo => (
      typeof photo.id === 'string'
      && typeof photo.assetId === 'string'
      && typeof photo.title === 'string'
      && typeof photo.artist === 'string'
      && typeof photo.sourceUrl === 'string'
      && typeof photo.licenseName === 'string'
      && typeof photo.licenseUrl === 'string'
      && photo.width > 0
      && photo.height > 0
    )),
  );
}

export function createDarkroomGalleryCache(
  options: DarkroomGalleryCacheOptions = {},
): DarkroomGalleryCache {
  const getFactory = () => options.indexedDB ?? globalThis.indexedDB;
  let available = true;

  async function withDatabase<T>(
    action: (database: IDBDatabase) => Promise<T>,
    unavailable: () => T,
  ): Promise<T> {
    let indexedDB: IDBFactory | undefined;
    try {
      indexedDB = getFactory();
    } catch {
      available = false;
      return unavailable();
    }
    if (!indexedDB) {
      available = false;
      return unavailable();
    }
    let database: IDBDatabase | undefined;
    try {
      database = await openDatabase(indexedDB);
      available = true;
      return await action(database);
    } catch (error) {
      if (!database) available = false;
      throw error;
    } finally {
      database?.close();
    }
  }

  return {
    isAvailable: () => available,
    async loadLatestBatch(): Promise<DarkroomGalleryCachedBatch | null> {
      return withDatabase(async database => {
        const transaction = database.transaction([BATCHES_STORE, ASSETS_STORE], 'readonly');
        const batches = await requestResult(
          transaction.objectStore(BATCHES_STORE).getAll(),
        ) as DarkroomGalleryBatch[];
        const assets = await requestResult(
          transaction.objectStore(ASSETS_STORE).getAll(),
        ) as Array<DarkroomGalleryAsset | StoredAsset>;
        const assetMap = new Map<string, DarkroomGalleryAsset>((await Promise.all(
          assets.map(async record => {
            if ('blob' in record && record.blob instanceof Blob && record.blob.size > 0) {
              const head = new Uint8Array(await record.blob.slice(0, 8).arrayBuffer());
              return validImageSignature(head, record.mime) ? [record.id, record] as const : null;
            }
            if (
              'bytes' in record
              && record.bytes instanceof ArrayBuffer
              && record.bytes.byteLength > 0
              && (record.mime === 'image/jpeg' || record.mime === 'image/png')
              && validImageSignature(new Uint8Array(record.bytes), record.mime)
            ) {
              return [record.id, { ...record, blob: new Blob([record.bytes], { type: record.mime }) }] as const;
            }
            return null;
          }),
        )).filter((entry): entry is readonly [string, DarkroomGalleryAsset] => entry !== null));
        const candidates = batches
          .filter(validateBatch)
          .sort((left, right) => right.fetchedAt - left.fetchedAt);
        for (const batch of candidates) {
          const batchAssets = batch.photos.map(photo => assetMap.get(photo.assetId));
          if (batchAssets.every((asset): asset is DarkroomGalleryAsset => Boolean(
            asset && asset.batchId === batch.id && asset.blob instanceof Blob && asset.blob.size > 0,
          ))) {
            return { ...batch, assets: batchAssets };
          }
        }
        return null;
      }, () => null);
    },

    async saveBatch(batch: DarkroomGalleryBatch, assets: DarkroomGalleryAsset[]): Promise<void> {
      if (batch.photos.length !== DARKROOM_GALLERY_BATCH_SIZE || assets.length !== DARKROOM_GALLERY_BATCH_SIZE) {
        throw new Error('公共摄影缓存只保存完整十二图批次');
      }
      const assetIds = batch.photos.map(photo => photo.assetId);
      if (new Set(assetIds).size !== DARKROOM_GALLERY_BATCH_SIZE || assets.some((asset, index) => (
        asset.id !== assetIds[index]
        || asset.batchId !== batch.id
        || !(asset.blob instanceof Blob)
        || asset.blob.size === 0
      ))) {
        throw new Error('公共摄影缓存元数据与资源不匹配');
      }
      const storedAssets: StoredAsset[] = await Promise.all(assets.map(async asset => ({
        id: asset.id,
        batchId: asset.batchId,
        mime: asset.mime,
        bytes: await asset.blob.arrayBuffer(),
      })));
      await withDatabase(async database => {
        const transaction = database.transaction([BATCHES_STORE, ASSETS_STORE], 'readwrite');
        const done = transactionDone(transaction);
        try {
          transaction.objectStore(BATCHES_STORE).put(batch);
          for (const asset of storedAssets) transaction.objectStore(ASSETS_STORE).put(asset);
          await done;
        } catch (error) {
          try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
          await done.catch(() => undefined);
          throw new Error(`公共摄影缓存保存失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }, () => { throw new Error('公共摄影 IndexedDB 不可用'); });

      // A second transaction bounds owned storage without risking transaction
      // auto-commit while the new batch writes. Failure remains visible.
      await withDatabase(async database => {
        const transaction = database.transaction([BATCHES_STORE, ASSETS_STORE], 'readwrite');
        const done = transactionDone(transaction);
        try {
          const batches = transaction.objectStore(BATCHES_STORE);
          for (const item of await requestResult(batches.getAll()) as DarkroomGalleryBatch[]) {
            if (item.id === batch.id) continue;
            batches.delete(item.id);
            const owned = await requestResult(
              transaction.objectStore(ASSETS_STORE).index('batchId').getAll(item.id),
            ) as Array<{ id: string }>;
            for (const asset of owned) transaction.objectStore(ASSETS_STORE).delete(asset.id);
          }
          await done;
        } catch (error) {
          try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
          await done.catch(() => undefined);
          throw new Error(`公共摄影旧批次清理失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }, () => undefined);
    },

    async deleteBatch(batchId: string, assetIds: string[]): Promise<void> {
      await withDatabase(async database => {
        const transaction = database.transaction([BATCHES_STORE, ASSETS_STORE], 'readwrite');
        const done = transactionDone(transaction);
        const batches = transaction.objectStore(BATCHES_STORE);
        const assets = transaction.objectStore(ASSETS_STORE);
        try {
          const previous = await requestResult(batches.get(batchId)) as DarkroomGalleryBatch | undefined;
          // A stale request cannot delete IDs from a batch that no longer exists.
          const ownedIds = previous ? new Set(previous.photos.map(photo => photo.assetId)) : new Set<string>();
          for (const asset of await requestResult(assets.index('batchId').getAll(batchId)) as DarkroomGalleryAsset[]) {
            ownedIds.add(asset.id);
          }
          for (const assetId of assetIds) {
            if (!ownedIds.has(assetId)) continue;
            const asset = await requestResult(assets.get(assetId)) as DarkroomGalleryAsset | undefined;
            if (asset?.batchId === batchId) assets.delete(assetId);
          }
          if (previous) batches.delete(batchId);
          await done;
        } catch (error) {
          try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
          await done.catch(() => undefined);
          throw error;
        }
      }, () => undefined);
    },
  };
}

export const darkroomGalleryCache = createDarkroomGalleryCache();
