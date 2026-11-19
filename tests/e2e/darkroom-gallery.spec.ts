import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const NOW = new Date('2026-11-17T00:00:00Z');
const TTL = 7 * 24 * 60 * 60 * 1000;
const fixture = path.resolve(process.cwd(), 'public/images/darkroom-demo-landscape.jpg');
const photoBytes = await readFile(fixture);

interface GalleryMetadata {
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

const FIRST_IDS = [
  52734, 1287239, 2245704, 11161355, 177688553, 3290916,
  11161368, 121434779, 11160803, 16852192, 177688554, 33722198,
];
const SECOND_IDS = [
  42870426, 177688560, 20002812, 134068417, 177688566, 27937180,
  11161340, 177688569, 121435038, 49179423, 177688571, 86051738,
];
const POOL_IDS = [...FIRST_IDS, ...SECOND_IDS];
const PUBLIC_DOMAIN = 'https://commons.wikimedia.org/wiki/Commons:Licensing#Public_domain';
const ARTISTS: Record<number, string> = Object.fromEntries(POOL_IDS.map(id => [
  id,
  FIRST_IDS.indexOf(id) % 3 === 0 || SECOND_IDS.indexOf(id) % 3 === 0 ? 'Dorothea Lange'
    : FIRST_IDS.indexOf(id) % 3 === 1 || SECOND_IDS.indexOf(id) % 3 === 1 ? 'Gordon Parks'
      : 'Walker Evans',
]));

function candidate(id: number, licenseName = 'Public domain') {
  return {
    pageid: id,
    title: `File:Human document ${id}.jpg`,
    imageinfo: [{
      descriptionurl: `https://commons.wikimedia.org/wiki/File:Human_document_${id}.jpg`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/${id}/1280px-Human_document_${id}.jpg`,
      thumbwidth: 1280,
      thumbheight: 853,
      mime: 'image/jpeg',
      extmetadata: {
        Artist: { value: `<a href="https://commons.wikimedia.org/wiki/User:Example">${ARTISTS[id]}</a>` },
        LicenseShortName: { value: licenseName },
        ...(licenseName === 'Public domain' ? {} : { LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' } }),
      },
    }],
  };
}

function metadata(id: number, batchId: string, fetchedAt: number): GalleryMetadata {
  return {
    id: `commons-${id}`,
    assetId: `asset-${id}`,
    title: `Landscape ${id}`,
    artist: `${ARTISTS[id]}`,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:Landscape_${id}.jpg`,
    licenseName: 'Public domain',
    licenseUrl: PUBLIC_DOMAIN,
    width: 1280,
    height: 853,
    imageUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/${id}/1280px-Landscape_${id}.jpg`,
  };
}

async function routeGallery(page: Page, ids: number[]) {
  const apiRequests: string[] = [];
  const imageRequests: string[] = [];
  await page.route('https://commons.wikimedia.org/w/api.php?**', async route => {
    apiRequests.push(route.request().url());
    expect(route.request().headers()['cookie']).toBeUndefined();
    expect(route.request().headers()['referer']).toBeUndefined();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ query: { pages: ids.map(id => candidate(id)) } }),
    });
  });
  await page.route('https://upload.wikimedia.org/**', async route => {
    imageRequests.push(route.request().url());
    expect(route.request().headers()['cookie']).toBeUndefined();
    expect(route.request().headers()['referer']).toBeUndefined();
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Length': String(photoBytes.length),
      },
      body: photoBytes,
    });
  });
  await page.route(/https:\/\/(?:www\.)?(?:magnumphotos|hasselblad)\.com\/.*/, route => route.abort());
  return { apiRequests, imageRequests };
}

async function seedBatch(page: Page, batchId: string, ids: number[], fetchedAt: number) {
  await page.goto('/images/darkroom-demo-landscape.jpg');
  await page.evaluate(async ({ batchId, ids, fetchedAt, bytes }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('filmframe-darkroom-gallery', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('batches', { keyPath: 'id' });
        const assets = request.result.createObjectStore('assets', { keyPath: 'id' });
        assets.createIndex('batchId', 'batchId', { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(['batches', 'assets'], 'readwrite');
    const existing = await new Promise<unknown>((resolve, reject) => {
      const request = transaction.objectStore('batches').get(batchId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (existing) {
      database.close();
      return;
    }
    const photos = ids.map(id => ({
      id: `commons-${id}`,
      assetId: `asset-${id}`,
      title: `Landscape ${id}`,
      artist: `Photographer ${id}`,
      sourceUrl: `https://commons.wikimedia.org/wiki/File:Landscape_${id}.jpg`,
      licenseName: 'Public domain',
      licenseUrl: 'https://commons.wikimedia.org/wiki/Commons:Licensing#Public_domain',
      width: 1280,
      height: 853,
      imageUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/${id}/1280px-Landscape_${id}.jpg`,
    }));
    transaction.objectStore('batches').put({
      id: batchId,
      fetchedAt,
      expiresAt: fetchedAt + 7 * 24 * 60 * 60 * 1000,
      photos,
    });
    const bytesArray = new Uint8Array(bytes);
    for (const photo of photos) {
      transaction.objectStore('assets').put({
        id: photo.assetId,
        batchId,
        mime: 'image/jpeg',
        bytes: bytesArray.buffer,
      });
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, { batchId, ids, fetchedAt, bytes: Array.from(photoBytes) });
}

async function cachedRecords(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('filmframe-darkroom-gallery', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(['batches', 'assets'], 'readonly');
    const read = (store: string) => new Promise<Array<{ id: string }>>((resolve, reject) => {
      const request = transaction.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const batches = await read('batches');
    const assets = await read('assets');
    database.close();
    return { batches: batches.map(item => item.id), assets: assets.map(item => item.id) };
  });
}

test('twelve real JPEG responses move continuously and pause without changing import controls', async ({ page }) => {
  const requests = await routeGallery(page, POOL_IDS);
  await page.goto('/');
  const images = page.locator('.ff-empty-darkroom__photo');
  const track = page.getByTestId('empty-darkroom-film-track');
  const darkroom = page.locator('.ff-empty-darkroom');

  await expect(images.first()).toHaveAttribute('data-gallery-photo-id', 'commons-52734');
  await expect(images).toHaveCount(24);
  await expect.poll(() => images.first().evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth)).toBe(1200);
  await expect(images.first()).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('.ff-empty-darkroom__visual')).toHaveAttribute('data-gallery-batch-size', '12');
  await expect(page.getByRole('link', { name: 'Dorothea Lange / Wikimedia Commons' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Public domain', exact: true })).toBeVisible();
  await expect(darkroom.getByRole('button', { name: '选择照片', exact: true })).toHaveCount(1);
  expect(requests.apiRequests).toHaveLength(1);
  expect(requests.imageRequests).toHaveLength(12);
  expect(requests.apiRequests[0]).toContain('pageids=');
  expect(requests.apiRequests[0]).not.toContain('gcmtitle');

  const readX = () => track.evaluate(element => ({
    x: new DOMMatrix(getComputedStyle(element).transform).m41,
    time: performance.now(),
  }));
  const samples: Array<{ x: number; time: number }> = [];
  for (let index = 0; index < 4; index += 1) {
    await page.waitForTimeout(250);
    samples.push(await readX());
  }
  expect(samples.every((sample, index) => index === 0 || sample.x < samples[index - 1].x)).toBe(true);
  for (let index = 1; index < samples.length; index += 1) {
    const speed = (samples[index - 1].x - samples[index].x) / (samples[index].time - samples[index - 1].time) * 1000;
    expect(speed).toBeGreaterThan(20);
    expect(speed).toBeLessThan(28);
  }
  await darkroom.hover();
  await expect(darkroom).toHaveAttribute('data-gallery-paused', 'true');
  await page.waitForTimeout(50);
  const pausedX = (await readX()).x;
  await page.waitForTimeout(350);
  expect((await readX()).x).toBeCloseTo(pausedX, 1);
  await page.mouse.move(0, 0);
  await page.getByRole('link', { name: 'Dorothea Lange / Wikimedia Commons' }).focus();
  await expect(darkroom).toHaveAttribute('data-gallery-paused', 'true');
  await page.getByRole('heading', { name: '让这一卷，慢慢显影' }).click();
  await page.mouse.move(0, 0);
  await expect(darkroom).toHaveAttribute('data-gallery-paused', 'false');
  await page.waitForTimeout(200);
  expect((await readX()).x).toBeLessThan(pausedX);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(darkroom).toHaveAttribute('data-gallery-paused', 'true');
  const hiddenX = (await readX()).x;
  await page.waitForTimeout(250);
  expect((await readX()).x).toBeCloseTo(hiddenX, 1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(darkroom).toHaveAttribute('data-gallery-paused', 'false');

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const bounds = await images.first().boundingBox();
  expect(bounds!.width / bounds!.height).toBeCloseTo(1.5, 3);
});

test('pause preserves actual position and reduced motion shows the first static frame', async ({ page }) => {
  await page.route('https://commons.wikimedia.org/w/api.php?**', route => route.abort('failed'));
  await page.goto('/');
  await page.locator('header').click({ position: { x: 4, y: 4 } });
  await page.mouse.move(0, 0);
  const track = page.getByTestId('empty-darkroom-film-track');
  const darkroom = page.locator('.ff-empty-darkroom');
  const readX = () => track.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m41);

  await page.waitForTimeout(700);
  await darkroom.hover();
  await expect(darkroom).toHaveAttribute('data-gallery-paused', 'true');
  const pausedX = await readX();
  await page.waitForTimeout(300);
  expect(await readX()).toBeCloseTo(pausedX, 1);
  await page.mouse.move(0, 0);
  await expect(darkroom).toHaveAttribute('data-gallery-paused', 'false');
  await page.waitForTimeout(200);
  expect(await readX()).toBeLessThan(pausedX);
  await track.evaluate(element => {
    const animation = element.getAnimations({ subtree: false })[0];
    animation.currentTime = Number(animation.effect?.getComputedTiming().duration) * 0.45;
  });
  await expect(track).toHaveAttribute('data-photo-index', '5');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(darkroom).toHaveAttribute('data-gallery-paused', 'true');
  await expect(track).toHaveAttribute('data-photo-index', '0');
  await expect(page.locator('.ff-empty-darkroom__attribution a').first()).toContainText('Dorothea Lange');
  await expect.poll(readX).toBe(0);
  await page.waitForTimeout(400);
  expect(await readX()).toBe(0);
});

test('continuous film joins the duplicate frames without a blank gap or reverse jump', async ({ page }) => {
  await page.route('https://commons.wikimedia.org/w/api.php?**', route => route.abort('failed'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.locator('header').click({ position: { x: 4, y: 4 } });
  await page.mouse.move(0, 0);
  const track = page.getByTestId('empty-darkroom-film-track');
  await expect(page.locator('.ff-empty-darkroom')).toHaveAttribute('data-gallery-paused', 'false');

  const snapshot = () => track.evaluate(element => {
    const viewport = element.closest('.ff-empty-darkroom__film')!.getBoundingClientRect();
    return {
      x: new DOMMatrix(getComputedStyle(element).transform).m41,
      visibleBounds: Array.from(element.querySelectorAll<HTMLElement>('[data-testid="empty-darkroom-exposure-frame"]'))
        .filter(frame => {
          const bounds = frame.getBoundingClientRect();
          return bounds.right - viewport.left >= bounds.width * 0.5 && bounds.left < viewport.right;
        }).map(frame => ({ id: frame.dataset.galleryPhotoId, x: frame.getBoundingClientRect().x })),
      cycle: Number(element.getAnimations({ subtree: false })[0]?.effect?.getComputedTiming().duration) / 1000 * 24,
      currentTime: element.getAnimations({ subtree: false })[0]?.currentTime,
      frameRows: new Set(Array.from(element.querySelectorAll<HTMLElement>('[data-testid="empty-darkroom-exposure-frame"]'))
        .map(frame => frame.offsetTop)).size,
      visible: Array.from(element.querySelectorAll<HTMLElement>('[data-testid="empty-darkroom-exposure-frame"]'))
        .filter(frame => {
          const bounds = frame.getBoundingClientRect();
          return bounds.right - viewport.left >= bounds.width * 0.5 && bounds.left < viewport.right;
        }).map(frame => frame.dataset.galleryPhotoId),
    };
  });
  await track.evaluate(element => {
    const animation = element.getAnimations({ subtree: false })[0];
    animation.pause();
    animation.currentTime = Number(animation.effect?.getComputedTiming().duration) - 1;
  });
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const before = await snapshot();
  expect(before.frameRows).toBe(1);
  expect(before.visible[0]).toBe('bundled-documentary-52734');
  await track.evaluate(element => {
    const animation = element.getAnimations({ subtree: false })[0];
    animation.currentTime = Number(animation.effect?.getComputedTiming().duration) + 1;
  });
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const after = await snapshot();
  expect(before.visible).toEqual(['bundled-documentary-52734', 'bundled-documentary-1287239']);
  expect(after.visible).toEqual(before.visible);
  expect(after.visibleBounds.map((frame, index) => frame.id)).toEqual(before.visibleBounds.map(frame => frame.id));
  after.visibleBounds.forEach((frame, index) => {
    expect(frame.x).toBeCloseTo(before.visibleBounds[index].x, 0);
  });
  expect(after.x).toBeCloseTo(before.x + before.cycle, 0);
});

test('twelve reviewed photographs are replaced by a disjoint twelve-photo batch after expiry', async ({ page }) => {
  await page.clock.install({ time: NOW });
  const requests = await routeGallery(page, POOL_IDS);
  await seedBatch(page, 'first-batch', FIRST_IDS, NOW.getTime() - TTL);
  await page.goto('/');
  await expect(page.locator('.ff-empty-darkroom__photo').first()).toHaveAttribute('data-gallery-photo-id', `commons-${SECOND_IDS[0]}`);
  await expect.poll(async () => (await cachedRecords(page)).batches).toEqual([expect.stringMatching(/^batch-/)]);
  expect((await cachedRecords(page)).assets).toHaveLength(12);
  expect(requests.imageRequests).toHaveLength(12);
  await page.reload();
  await expect(page.locator('.ff-empty-darkroom__photo').first()).toHaveAttribute('data-gallery-photo-id', `commons-${SECOND_IDS[0]}`);
  expect(requests.apiRequests).toHaveLength(1);
  expect(requests.imageRequests).toHaveLength(12);
});

test('expired cached photographs are replaced only after all twelve new images persist, then old IDs are deleted', async ({ page }) => {
  const requests = await routeGallery(page, POOL_IDS);
  await seedBatch(page, 'old-batch', Array.from({ length: 12 }, (_, index) => index + 1), NOW.getTime() - TTL);
  await page.goto('/');

  const image = page.locator('.ff-empty-darkroom__photo').first();
  await expect(image).toHaveAttribute('data-gallery-photo-id', 'commons-52734');
  await expect.poll(async () => (await cachedRecords(page)).batches).toEqual([
    expect.stringMatching(/^batch-/),
  ]);
  expect((await cachedRecords(page)).assets).toHaveLength(12);
  expect((await cachedRecords(page)).assets.every(id => id.startsWith('batch-'))).toBe(true);
  expect(requests.apiRequests).toHaveLength(1);
  expect(requests.imageRequests).toHaveLength(12);

  await page.reload();
  await expect(image).toHaveAttribute('data-gallery-photo-id', 'commons-52734');
  expect(requests.apiRequests).toHaveLength(1);
  expect(requests.imageRequests).toHaveLength(12);
});

test('failed replacement preserves the expired cached batch and backs off retries', async ({ page }) => {
  await page.clock.install({ time: NOW });
  let apiRequests = 0;
  await page.route('https://commons.wikimedia.org/w/api.php?**', route => {
    apiRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ query: { pages: POOL_IDS.map(id => candidate(id)) } }),
    });
  });
  await page.route('https://upload.wikimedia.org/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: 'not a photograph',
  }));
  await seedBatch(page, 'old-batch', Array.from({ length: 12 }, (_, index) => index + 1), NOW.getTime() - TTL);
  await page.goto('/');

  await expect.poll(async () => (await cachedRecords(page)).batches).toEqual(['old-batch']);
  expect((await cachedRecords(page)).assets).toEqual([...Array.from({ length: 12 }, (_, index) => `asset-${index + 1}`)].sort());
  await expect(page.locator('.ff-empty-darkroom__photo').first()).toHaveAttribute('data-gallery-photo-id', 'commons-1');
  await expect.poll(async () => (await cachedRecords(page)).batches).toEqual(['old-batch']);
  expect((await cachedRecords(page)).assets).toEqual([...Array.from({ length: 12 }, (_, index) => `asset-${index + 1}`)].sort());
  await page.clock.runFor(3_000);
  expect(apiRequests).toBe(1);
});

test('reduced motion stays static and network failure keeps twelve bundled documentary photographs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: NOW });
  await page.route('https://commons.wikimedia.org/w/api.php?**', route => route.abort('failed'));
  await page.goto('/');
  const image = page.locator('.ff-empty-darkroom__photo').first();
  await expect(image).toHaveAttribute('data-gallery-photo-id', 'bundled-documentary-52734');
  await expect(image).toHaveJSProperty('complete', true);
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(960);
  await expect(page.locator('.ff-empty-darkroom__photo')).toHaveCount(24);
  await page.clock.fastForward(48_000);
  await expect(image).toHaveAttribute('data-gallery-photo-id', 'bundled-documentary-52734');
  await expect(page.locator('.ff-empty-darkroom')).toHaveAttribute('data-gallery-paused', 'true');
  await expect(page.locator('.ff-empty-darkroom__demo-frame').first()).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('link', { name: 'Dorothea Lange / Wikimedia Commons' })).toBeVisible();
});
