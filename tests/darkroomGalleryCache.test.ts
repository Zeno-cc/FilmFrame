import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDarkroomGalleryCache,
  DARKROOM_GALLERY_DATABASE_NAME,
} from '../services/darkroomGalleryCache';
import type { DarkroomGalleryAsset, DarkroomGalleryBatch } from '../services/darkroomGallery';
import { DARKROOM_GALLERY_BATCH_SIZE } from '../services/darkroomGallery';

type Store = Map<string, unknown>;
type Action = () => unknown;
type CallbackRequest = IDBRequest & { __action?: Action; __transaction?: { aborted: boolean; fail: (error: unknown) => void } };

const flush = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

afterEach(() => { vi.unstubAllGlobals(); });

function createFakeIndexedDB() {
  const databases = new Map<string, {
    version: number;
    stores: Map<string, { keyPath: string; records: Store }>;
  }>();
  const openedNames: string[] = [];
  let failNextOpen = false;
  let blocked = false;
  let pendingCommit = () => {};

  function request<T>(action: () => T, transaction?: FakeTransaction): IDBRequest<T> {
    const target = {
      onsuccess: null,
      onerror: null,
      error: null,
      result: undefined,
      readyState: 'pending',
    } as unknown as CallbackRequest;
    target.__action = action;
    target.__transaction = transaction;
    queueMicrotask(() => {
      if (transaction?.aborted) return;
      try {
        (target as { result: unknown }).result = action();
        target.onsuccess?.({ target } as unknown as Event);
      } catch (error) {
        (target as { error: unknown }).error = error;
        if (transaction) {
          transaction.fail(error);
          return;
        }
        target.onerror?.({ target } as unknown as Event);
      }
    });
    return target as IDBRequest<T>;
  }

  class FakeTransaction {
    aborted = false;
    oncomplete: (() => void) | null = null;
    onerror: (() => void) | null = null;
    error: unknown = null;
    onabort: (() => void) | null = null;
    private pending = 0;
    private finished = false;
    completed = false;
    private failed: unknown = null;
    private actions: Action[] = [];

    constructor(private database: FakeDatabase) {
      queueMicrotask(() => { this.finished = true; this.commitIfIdle(); });
    }

    objectStore(name: string) {
      const definition = this.database.definition.stores.get(name);
      if (!definition) throw new Error(`Unknown store: ${name}`);
      return {
        put: (value: Record<string, unknown>) => this.addAction(() => {
          const key = String(value[definition.keyPath]);
          if (definition.records.has(key)) throw new Error('ConstraintError');
          definition.records.set(key, structuredClone(value));
          return key;
        }),
        get: (key: string) => this.addAction(() => structuredClone(definition.records.get(key))),
        getAll: () => this.addAction(() => [...definition.records.values()].map(value => structuredClone(value))),
        delete: (key: string) => this.addAction(() => { definition.records.delete(key); }),
        index: (indexName: string) => ({
          getAll: (key: string) => this.addAction(() => [...definition.records.values()]
            .filter(value => (value as Record<string, unknown>)[indexName] === key)
            .map(value => structuredClone(value))),
        }),
        clear: () => { throw new Error('Broad cache deletion is forbidden'); },
      };
    }

    private addAction(action: Action) {
      this.pending += 1;
      return request(() => {
        this.pending -= 1;
        return action();
      }, this);
    }

    fail(error: unknown) {
      this.failed = error;
      this.error = error;
      this.abort();
    }

    abort() {
      if (this.aborted) return;
      this.aborted = true;
      this.pending = 0;
      this.onabort?.();
    }

    commitIfIdle() {
      queueMicrotask(() => {
        if (!this.finished || this.pending > 0 || this.aborted) return;
        if (this.failed) {
          this.abort();
          return;
        }
        try {
          pendingCommit = () => { this.actions.forEach(action => { action(); }); };
          this.completed = true;
          this.oncomplete?.();
        } catch (error) {
          this.fail(error);
        }
      });
    }
  }

  class FakeDatabase {
    constructor(public definition: {
      version: number;
      stores: Map<string, { keyPath: string; records: Store }>;
    }) {}

    get objectStoreNames() {
      return { contains: (name: string) => this.definition.stores.has(name) };
    }

    createObjectStore(name: string, options: IDBObjectStoreParameters) {
      if (this.definition.stores.has(name)) throw new Error('Store already exists');
      const records = new Map<string, unknown>();
      this.definition.stores.set(name, { keyPath: String(options.keyPath), records });
      return {
        createIndex: () => undefined,
        __records: records,
      };
    }

    transaction(_names: string[], _mode: IDBTransactionMode) {
      const transaction = new FakeTransaction(this);
      const monitor = () => {
        transaction.commitIfIdle();
        if (!transaction.aborted && !transaction.completed) setTimeout(monitor, 0);
      };
      monitor();
      return transaction as unknown as IDBTransaction;
    }

    close() { pendingCommit(); pendingCommit = () => {}; }
  }

  return {
    openedNames,
    failNextOpen() { failNextOpen = true; },
    block() { blocked = true; },
    async putLegacyRecord(storeName: string, value: Record<string, unknown>) {
      const definition = databases.get(DARKROOM_GALLERY_DATABASE_NAME);
      const store = definition?.stores.get(storeName);
      if (!store) throw new Error('Seed database is missing');
      store.records.set(String(value[store.keyPath]), structuredClone(value));
    },
    readRecord(storeName: string, key: string) {
      return databases.get(DARKROOM_GALLERY_DATABASE_NAME)?.stores.get(storeName)?.records.get(key);
    },
    open(name: string, version = 1) {
      openedNames.push(name);
      const target = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: null,
        error: null,
      } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => {
        if (blocked || failNextOpen) {
          failNextOpen = false;
          (target as { error: unknown }).error = new Error('IndexedDB blocked');
          target.onerror?.({ target } as unknown as Event);
          return;
        }
        const isNew = !databases.has(name);
        const definition = databases.get(name) ?? { version: 0, stores: new Map() };
        databases.set(name, definition);
        const database = new FakeDatabase(definition);
        (target as { result: unknown }).result = database;
        if (isNew || definition.version < version) {
          definition.version = version;
          target.onupgradeneeded?.({ target } as unknown as IDBVersionChangeEvent);
        }
        target.onsuccess?.({ target } as unknown as Event);
      });
      return target;
    },
  };
}

function batch(id: string, fetchedAt: number): DarkroomGalleryBatch {
  return {
    id,
    fetchedAt,
    expiresAt: fetchedAt + 7 * 24 * 60 * 60 * 1000,
    photos: Array.from({ length: DARKROOM_GALLERY_BATCH_SIZE }, (_, index) => ({
      id: `${id}-photo-${index}`,
      assetId: `${id}-asset-${index}`,
      title: `Landscape ${index}`,
      artist: 'Example photographer',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
      licenseName: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      width: 1280,
      height: 853,
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/example/1280px-example.jpg',
    })),
  };
}

function assetsFor(value: DarkroomGalleryBatch): DarkroomGalleryAsset[] {
  return value.photos.map(photo => ({
    id: photo.assetId,
    batchId: value.id,
    mime: 'image/jpeg',
    blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], { type: 'image/jpeg' }),
  }));
}

async function seed(id: string, fetchedAt: number) {
  const value = batch(id, fetchedAt);
  const assets = assetsFor(value);
  const indexedDB = createFakeIndexedDB();
  const cache = createDarkroomGalleryCache({ indexedDB: indexedDB as unknown as IDBFactory });
  await cache.saveBatch(value, assets);
  return { indexedDB, cache, value, assets };
}

describe('公共摄影 IndexedDB 缓存', () => {
  function valueIds(id: string) {
    return batch(id, 0).photos.map(photo => photo.assetId);
  }

  it('只打开专用数据库，并读取最近一个完整十二图批次及 Blob', async () => {
    const { indexedDB, cache, assets } = await seed('old', 10);
    const latest = batch('latest', 20);
    await cache.saveBatch(latest, assetsFor(latest));
    const incomplete = batch('incomplete', 30);
    await indexedDB.putLegacyRecord('batches', incomplete as unknown as Record<string, unknown>);

    const loaded = await cache.loadLatestBatch();
    expect(indexedDB.openedNames.every(name => name === DARKROOM_GALLERY_DATABASE_NAME)).toBe(true);
    expect(loaded?.id).toBe('latest');
    expect(loaded?.assets).toHaveLength(DARKROOM_GALLERY_BATCH_SIZE);
    expect(loaded?.assets[0].blob.type).toBe('image/jpeg');
    expect(loaded?.assets[0].blob).toEqual(assets[0].blob);
    expect(loaded?.assets.every(asset => asset.batchId === 'latest')).toBe(true);
    expect(indexedDB.readRecord('batches', 'old')).toBeUndefined();
    expect(indexedDB.readRecord('assets', 'old-asset-0')).toBeUndefined();
    const stored = indexedDB.readRecord('assets', 'latest-asset-0') as Record<string, unknown>;
    expect(stored.bytes).toBeInstanceOf(ArrayBuffer);
    expect(stored).not.toHaveProperty('blob');
  });

  it('损坏的图片字节不会构成有效缓存批次', async () => {
    const { indexedDB, cache, value } = await seed('corrupt', 10);
    for (const asset of assetsFor(value)) {
      indexedDB.putLegacyRecord('assets', {
        id: asset.id,
        batchId: asset.batchId,
        mime: asset.mime,
        bytes: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]).buffer,
      });
    }
    await expect(cache.loadLatestBatch()).resolves.toBeNull();
  });

  it('新批次写入失败时事务回滚，旧批次仍可完整读取', async () => {
    const { cache } = await seed('old', 10);
    const replacement = batch('old', 20);
    await expect(cache.saveBatch(replacement, assetsFor(replacement))).rejects.toThrow(/Constraint|保存/);
    const loaded = await cache.loadLatestBatch();
    expect(loaded?.id).toBe('old');
    expect(loaded?.fetchedAt).toBe(10);
    expect(loaded?.assets).toHaveLength(DARKROOM_GALLERY_BATCH_SIZE);
  });

  it('只按旧批次的元数据和所属资源 ID 删除，不清空或误删其他记录', async () => {
    const { cache } = await seed('old', 10);
    const latest = batch('latest', 20);
    await cache.saveBatch(latest, assetsFor(latest));
    const unrelated = batch('unrelated', 30);
    await cache.saveBatch(unrelated, assetsFor(unrelated));
    const wrongAsset = unrelated.photos[0].assetId;

    await cache.deleteBatch('old', [...valueIds('old'), wrongAsset]);

    expect((await cache.loadLatestBatch())?.id).toBe('unrelated');
    expect((await cache.loadLatestBatch())?.photos.map(photo => photo.assetId)).toContain(wrongAsset);
  });

  it('删除旧 ID 时不误删已被新批次重新占用的资源', async () => {
    const { cache, indexedDB } = await seed('old', 10);
    const reused = batch('new', 20);
    reused.photos[0] = { ...reused.photos[0], assetId: 'old-asset-0' };
    await indexedDB.putLegacyRecord('assets', {
      ...assetsFor(reused)[0],
      id: 'old-asset-0',
      batchId: 'new',
    });

    await cache.deleteBatch('old', ['old-asset-0']);

    expect(indexedDB.readRecord('assets', 'old-asset-0')).toMatchObject({ id: 'old-asset-0', batchId: 'new' });
    expect(indexedDB.readRecord('batches', 'old')).toBeUndefined();
  });

  it('IndexedDB 不可用时读取降级为空，保存明确失败', async () => {
    const indexedDB = createFakeIndexedDB();
    indexedDB.failNextOpen();
    const cache = createDarkroomGalleryCache({ indexedDB: indexedDB as unknown as IDBFactory });
    indexedDB.block();
    await expect(cache.loadLatestBatch()).rejects.toThrow(/IndexedDB|blocked/);
    expect(cache.isAvailable?.()).toBe(false);
    const value = batch('new', 10);
    await expect(cache.saveBatch(value, assetsFor(value))).rejects.toThrow(/IndexedDB|缓存/);
  });

  it('没有 IndexedDB 的 Node 环境不会因模块加载访问浏览器全局', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const cache = createDarkroomGalleryCache();
    await expect(cache.loadLatestBatch()).resolves.toBeNull();
  });
});
