import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilmType } from '../types';
import type { FilmSettings } from '../types';
import {
  WorkerCancelledError,
  createWorkerRenderer,
  shouldUseWorkerForSettings,
} from '../services/filmWorkerClient';

type WorkerMessage = { id: number } & Record<string, unknown>;

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  messages: WorkerMessage[] = [];
  terminated = false;

  postMessage(message: WorkerMessage) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  respond(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const settings: FilmSettings = {
  brandText: FilmType.KODAK_GOLD_200,
  customText: '',
  frameNumber: 1,
  showDate: false,
  dateStr: '2026/07/11',
  borderColor: '#111111',
  holeColor: '#eeeeee',
  textColor: '#eab308',
  borderSize: 12,
  grainIntensity: 15,
  holeType: 'rounded',
  outputFormat: 'image/jpeg',
  outputQuality: 0.95,
  processingMode: 'preview',
  frameRenderMode: 'real135',
  scanOutputAspect: 'native',
  autoCropToFilmRatio: true,
  enableRealisticRebate: true,
  maxRollFrames: 36,
  useFilmOverlayTemplate: true,
  filmOverlayUrl: '/film-overlays/kodak-gold-200.png',
};

function createHarness(timeoutMs = 1000) {
  const worker = new FakeWorker();
  const createObjectURL = vi.fn(() => 'blob:worker-result');
  const renderer = createWorkerRenderer({
    hasCapabilities: () => true,
    createWorker: () => worker,
    createObjectURL,
    timeoutMs,
  });

  if (!renderer) throw new Error('Expected a worker renderer');
  return { worker, createObjectURL, renderer };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createWorkerRenderer', () => {
  it('returns null when the Worker constructor throws', () => {
    expect(createWorkerRenderer({
      hasCapabilities: () => true,
      createWorker: () => {
        throw new Error('worker blocked');
      },
    })).toBeNull();
  });

  it('rejects pending work and terminates on dispose', async () => {
    vi.useFakeTimers();
    const { renderer, worker } = createHarness();
    const pending = renderer.processImage({} as File, settings);

    renderer.dispose();

    await expect(pending).rejects.toBeInstanceOf(WorkerCancelledError);
    expect(worker.terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not create an object URL for a success arriving after dispose', async () => {
    const { renderer, worker, createObjectURL } = createHarness();
    const pending = renderer.processImage({} as File, settings);
    const id = worker.messages[0].id;

    renderer.dispose();
    worker.respond({ id, ok: true, blob: new Blob(['late']) });

    await expect(pending).rejects.toBeInstanceOf(WorkerCancelledError);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('cleans a failed task so a late success is ignored', async () => {
    const { renderer, worker, createObjectURL } = createHarness();
    const pending = renderer.processImage({} as File, settings);
    const id = worker.messages[0].id;

    worker.respond({ id, ok: false, error: 'decode failed' });
    await expect(pending).rejects.toThrow('decode failed');

    worker.respond({ id, ok: true, blob: new Blob(['late']) });
    expect(createObjectURL).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it('times out a task and ignores its late success', async () => {
    vi.useFakeTimers();
    const { renderer, worker, createObjectURL } = createHarness(25);
    const pending = renderer.processImage({} as File, settings);
    const id = worker.messages[0].id;

    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).rejects.toThrow('timed out');
    expect(worker.terminated).toBe(true);

    worker.respond({ id, ok: true, blob: new Blob(['late']) });
    expect(createObjectURL).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it('rejects pending work when a Worker response cannot be deserialized', async () => {
    const { renderer, worker } = createHarness();
    const pending = renderer.processImage({} as File, settings);

    worker.onmessageerror?.({} as MessageEvent);

    await expect(pending).rejects.toThrow('could not be deserialized');
    expect(worker.terminated).toBe(true);
  });
});

describe('worker routing policy', () => {
  it('allows only the Kodak Gold real135 template path', () => {
    expect(shouldUseWorkerForSettings(settings)).toBe(true);
    expect(shouldUseWorkerForSettings({ ...settings, frameRenderMode: 'classic' })).toBe(false);
    expect(shouldUseWorkerForSettings({ ...settings, brandText: FilmType.ILFORD_HP5 })).toBe(false);
    expect(shouldUseWorkerForSettings({ ...settings, useFilmOverlayTemplate: false })).toBe(false);
  });
});
