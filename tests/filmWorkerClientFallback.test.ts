import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilmType } from '../types';
import type { FilmSettings, ImageItem } from '../types';

const engine = vi.hoisted(() => ({
  processImage: vi.fn(),
  generateFilmStrip: vi.fn(),
}));

vi.mock('../services/filmEngine', () => engine);

import {
  disposeFilmWorkerClient,
  generateFilmStrip,
  processImage,
} from '../services/filmWorkerClient';

const settings: FilmSettings = {
  brandText: FilmType.ILFORD_HP5,
  customText: '',
  frameNumber: 1,
  showDate: false,
  dateStr: '2026/07/12',
  borderColor: '#111111',
  holeColor: '#eeeeee',
  textColor: '#eab308',
  borderSize: 12,
  grainIntensity: 15,
  holeType: 'square',
  outputFormat: 'image/jpeg',
  outputQuality: 0.95,
  processingMode: 'preview',
  frameRenderMode: 'classic',
  scanOutputAspect: 'native',
  autoCropToFilmRatio: true,
  enableRealisticRebate: true,
  maxRollFrames: 36,
  useFilmOverlayTemplate: false,
};

const image: ImageItem = {
  id: 'one',
  file: {} as File,
  previewUrl: 'blob:source',
  included: true,
  sourceWidth: 1200,
  sourceHeight: 800,
};

type WorkerMessage = { id: number; type: string } & Record<string, unknown>;

class FailingWorker {
  static instances: FailingWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  messages: WorkerMessage[] = [];
  terminated = false;
  autoFail = true;
  autoSucceed = false;

  constructor() {
    FailingWorker.instances.push(this);
  }

  postMessage(message: WorkerMessage) {
    this.messages.push(message);
    if (this.autoSucceed) {
      queueMicrotask(() => {
        this.onmessage?.({
          data: { id: message.id, ok: true, blob: new Blob(['complete strip']) },
        } as MessageEvent);
      });
      return;
    }
    if (!this.autoFail) return;
    queueMicrotask(() => {
      this.onmessage?.({
        data: { id: message.id, ok: false, error: 'forced worker render failure' },
      } as MessageEvent);
    });
  }

  terminate() {
    this.terminated = true;
  }
}

function useFailingWorker() {
  FailingWorker.instances = [];
  vi.stubGlobal('Worker', FailingWorker);
}

function suspendNextWorkerResponse() {
  const worker = new FailingWorker();
  worker.autoFail = false;
  vi.stubGlobal('Worker', function PendingWorker() {
    return worker;
  });
  return worker;
}

const eligibleSettings: FilmSettings = {
  ...settings,
  frameRenderMode: 'real135',
  useFilmOverlayTemplate: true,
};

function enableWorkerCapabilities() {
  useFailingWorker();
  vi.stubGlobal('OffscreenCanvas', class {
    convertToBlob() {
      return Promise.resolve(new Blob());
    }
  });
  vi.stubGlobal('createImageBitmap', vi.fn());
}

afterEach(() => {
  disposeFilmWorkerClient();
  vi.resetModules();
  vi.useRealTimers();
  engine.processImage.mockReset();
  engine.generateFilmStrip.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('main-thread render output metadata', () => {
  it('uses Blob metadata returned by the canvas export without refetching its object URL', async () => {
    const output = { url: 'blob:image-result', byteSize: 321 };
    engine.processImage.mockResolvedValue(output);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(processImage('blob:source', settings)).resolves.toEqual(output);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes the render budget to the main-thread fallback', async () => {
    engine.processImage.mockResolvedValue({ url: 'blob:image-result', byteSize: 6 });
    const renderBudgetLimits = { maxPixels: 32_000_000 };

    await processImage(
      'blob:source',
      settings,
      undefined,
      undefined,
      undefined,
      renderBudgetLimits,
    );

    expect(engine.processImage).toHaveBeenCalledWith(
      'blob:source',
      settings,
      undefined,
      undefined,
      renderBudgetLimits,
    );
  });

  it('returns strip Blob metadata without refetching its object URL', async () => {
    const output = { url: 'blob:strip-result', byteSize: 654 };
    engine.generateFilmStrip.mockResolvedValue(output);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(generateFilmStrip([image], settings)).resolves.toEqual(output);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('started Worker failure fallback', () => {
  it('returns the main-thread single-image result with every original input preserved', async () => {
    enableWorkerCapabilities();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const output = { url: 'blob:single-fallback', byteSize: 712 };
    const file = new File(['source'], 'source.jpg', { type: 'image/jpeg' });
    const transform = { focusX: 0.2, focusY: 0.7, zoom: 1.4, quarterTurns: 1 } as const;
    const renderBudgetLimits = { maxPixels: 32_000_000 };
    engine.processImage.mockResolvedValue(output);

    await expect(processImage(
      file,
      eligibleSettings,
      '2026/08/20',
      'blob:source-preview',
      transform,
      renderBudgetLimits,
    )).resolves.toBe(output);

    expect(FailingWorker.instances).toHaveLength(1);
    expect(FailingWorker.instances[0].messages).toHaveLength(1);
    expect(FailingWorker.instances[0].messages[0]).toMatchObject({
      type: 'processImage',
      file,
      settings: eligibleSettings,
      dateOverride: '2026/08/20',
      transform,
      renderBudgetLimits,
    });
    expect(engine.processImage).toHaveBeenCalledTimes(1);
    expect(engine.processImage).toHaveBeenCalledWith(
      'blob:source-preview',
      eligibleSettings,
      '2026/08/20',
      transform,
      renderBudgetLimits,
    );
    expect(warn).toHaveBeenCalledWith(
      'Worker image processing failed; falling back to main thread.',
      expect.objectContaining({ message: 'forced worker render failure' }),
    );
  });

  it('returns the main-thread strip result with the original items and budget preserved', async () => {
    enableWorkerCapabilities();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const output = { url: 'blob:strip-fallback', byteSize: 1024 };
    const images: ImageItem[] = [{
      ...image,
      file: new File(['source'], 'source.jpg', { type: 'image/jpeg' }),
      rollIndex: 4,
    }];
    const renderBudgetLimits = { maxPixels: 48_000_000 };
    engine.generateFilmStrip.mockResolvedValue(output);

    await expect(generateFilmStrip(
      images,
      eligibleSettings,
      renderBudgetLimits,
    )).resolves.toBe(output);

    expect(FailingWorker.instances).toHaveLength(1);
    expect(FailingWorker.instances[0].messages).toHaveLength(1);
    expect(FailingWorker.instances[0].messages[0]).toMatchObject({
      type: 'generateFilmStrip',
      images,
      settings: eligibleSettings,
      renderBudgetLimits,
    });
    expect(engine.generateFilmStrip).toHaveBeenCalledTimes(1);
    expect(engine.generateFilmStrip).toHaveBeenCalledWith(
      images,
      eligibleSettings,
      renderBudgetLimits,
    );
  });

  it('accepts spectral template strips and reaches the Worker before falling back', async () => {
    enableWorkerCapabilities();
    const output = { url: 'blob:spectral-strip', byteSize: 2048 };
    engine.generateFilmStrip.mockResolvedValue(output);
    const spectralSettings: FilmSettings = {
      ...eligibleSettings,
      brandText: FilmType.KODAK_PORTRA_400,
      imagingMode: 'spectral',
    };

    await expect(generateFilmStrip([image], spectralSettings)).resolves.toBe(output);

    expect(FailingWorker.instances).toHaveLength(1);
    expect(FailingWorker.instances[0].messages[0]).toMatchObject({
      type: 'generateFilmStrip',
      settings: spectralSettings,
    });
    expect(engine.generateFilmStrip).toHaveBeenCalledTimes(1);
  });

  it('rejects spectral template strips when the 135 template path is disabled', async () => {
    enableWorkerCapabilities();
    await expect(generateFilmStrip([image], {
      ...eligibleSettings,
      brandText: FilmType.KODAK_PORTRA_400,
      imagingMode: 'spectral',
      useFilmOverlayTemplate: false,
    })).rejects.toThrow('Spectral template strips need the 135 overlay template');
    expect(FailingWorker.instances).toHaveLength(0);
    expect(engine.generateFilmStrip).not.toHaveBeenCalled();
  });

  it('rejects spectral template strips for a stock without a spectral resource', async () => {
    enableWorkerCapabilities();
    await expect(generateFilmStrip([image], {
      ...eligibleSettings,
      brandText: FilmType.FUJI_SUPERIA,
      imagingMode: 'spectral',
    })).rejects.toThrow('has none');
    expect(FailingWorker.instances).toHaveLength(0);
    expect(engine.generateFilmStrip).not.toHaveBeenCalled();
  });

  it('rejects a strip timeout without a main-thread retry and suppresses late output', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { WorkerTimeoutError, generateFilmStrip } = await import('../services/filmWorkerClient');
    enableWorkerCapabilities();
    const worker = suspendNextWorkerResponse();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:late-strip');

    const pending = generateFilmStrip([image], eligibleSettings);
    const outcome = pending.catch(error => error);
    await vi.advanceTimersByTimeAsync(120_000);

    const timeout = await outcome;
    expect(timeout).toBeInstanceOf(WorkerTimeoutError);
    expect(timeout.message).toBe('Worker request timed out after 120000ms');
    expect(worker.terminated).toBe(true);
    expect(worker.messages).toHaveLength(1);
    expect(engine.generateFilmStrip).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();

    worker.onmessage?.({
      data: { id: worker.messages[0].id, ok: true, blob: new Blob(['partial strip']) },
    } as MessageEvent);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    vi.stubGlobal('Worker', class SuccessfulWorker extends FailingWorker {
      autoSucceed = true;
    });
    const retry = await generateFilmStrip([image], eligibleSettings);
    expect(retry.url).toBe('blob:late-strip');
    expect(FailingWorker.instances).toHaveLength(2);
    expect(FailingWorker.instances[0].terminated).toBe(true);
    expect(engine.generateFilmStrip).not.toHaveBeenCalled();
  });

  it('keeps the single-image main-thread retry after a Worker timeout', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { WorkerTimeoutError, processImage } = await import('../services/filmWorkerClient');
    enableWorkerCapabilities();
    const worker = suspendNextWorkerResponse();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:late-image');
    const output = { url: 'blob:single-timeout-fallback', byteSize: 712 };
    engine.processImage.mockResolvedValue(output);
    const file = new File(['source'], 'source.jpg', { type: 'image/jpeg' });

    const pending = processImage(file, eligibleSettings, undefined, 'blob:source-preview');
    await vi.advanceTimersByTimeAsync(120_000);

    await expect(pending).resolves.toBe(output);
    expect(worker.terminated).toBe(true);
    expect(worker.messages).toHaveLength(1);
    expect(engine.processImage).toHaveBeenCalledTimes(1);
    expect(engine.processImage).toHaveBeenCalledWith(
      'blob:source-preview',
      eligibleSettings,
      undefined,
      undefined,
      undefined,
    );
    expect(warn).toHaveBeenCalledWith(
      'Worker image processing failed; falling back to main thread.',
      expect.any(WorkerTimeoutError),
    );

    worker.onmessage?.({
      data: { id: worker.messages[0].id, ok: true, blob: new Blob(['late image']) },
    } as MessageEvent);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
