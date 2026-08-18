import type { FilmSettings, ImageItem, RenderTransform } from '../types';
import * as mainThreadEngine from './filmEngine';
import { supportsReal135Template } from './filmOverlay';
import type { RenderBudgetLimits } from './renderBudget';
import type { CanvasObjectUrlResult } from './canvasRuntime';

type WorkerResponse =
  | { id: number; ok: true; blob: Blob }
  | { id: number; ok: false; error: string };

type WorkerRequestPayload =
  | {
    type: 'processImage';
    file: File;
    settings: FilmSettings;
    dateOverride?: string;
    transform?: RenderTransform;
    renderBudgetLimits?: RenderBudgetLimits;
  }
  | {
    type: 'generateFilmStrip';
    images: ImageItem[];
    settings: FilmSettings;
    renderBudgetLimits?: RenderBudgetLimits;
  };

type WorkerLike = {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage: (message: WorkerRequestPayload & { id: number }) => void;
  terminate: () => void;
};

export type WorkerRenderer = {
  processImage: (
    file: File,
    settings: FilmSettings,
    dateOverride?: string,
    transform?: RenderTransform,
    renderBudgetLimits?: RenderBudgetLimits,
  ) => Promise<RenderOutput>;
  generateFilmStrip: (
    images: ImageItem[],
    settings: FilmSettings,
    renderBudgetLimits?: RenderBudgetLimits,
  ) => Promise<RenderOutput>;
  dispose: () => void;
};

export type RenderOutput = CanvasObjectUrlResult;

export type WorkerRendererDependencies = {
  hasCapabilities: () => boolean;
  createWorker: () => WorkerLike;
  createObjectURL: (blob: Blob) => string;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  timeoutMs: number;
};

type PendingRequest = {
  resolve: (output: RenderOutput) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof globalThis.setTimeout>;
};

const DEFAULT_WORKER_TIMEOUT_MS = 120_000;

const hasWorkerCapabilities = (): boolean => {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof OffscreenCanvas.prototype.convertToBlob === 'function' &&
    typeof createImageBitmap !== 'undefined'
  );
};

const defaultDependencies: WorkerRendererDependencies = {
  hasCapabilities: hasWorkerCapabilities,
  createWorker: () => new Worker(new URL('./filmWorker.ts', import.meta.url), { type: 'module' }),
  createObjectURL: blob => URL.createObjectURL(blob),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  timeoutMs: DEFAULT_WORKER_TIMEOUT_MS,
};

export class WorkerCancelledError extends Error {
  constructor(message = 'Worker renderer disposed') {
    super(message);
    this.name = 'WorkerCancelledError';
  }
}

export function isWorkerCancelledError(error: unknown): error is WorkerCancelledError {
  return error instanceof WorkerCancelledError;
}

export function shouldUseWorkerForSettings(settings: FilmSettings): boolean {
  return (
    (settings.frameRenderMode ?? 'real135') === 'real135' &&
    supportsReal135Template(settings.brandText) &&
    settings.useFilmOverlayTemplate !== false
  );
}

export function createWorkerRenderer(
  overrides: Partial<WorkerRendererDependencies> = {}
): WorkerRenderer | null {
  const deps = { ...defaultDependencies, ...overrides };
  if (!deps.hasCapabilities()) return null;

  let worker: WorkerLike;
  try {
    worker = deps.createWorker();
  } catch {
    return null;
  }

  let nextId = 1;
  let disposed = false;
  let unavailableError: Error | null = null;
  const pending = new Map<number, PendingRequest>();

  const takePending = (id: number): PendingRequest | undefined => {
    const request = pending.get(id);
    if (!request) return undefined;
    pending.delete(id);
    deps.clearTimeout(request.timeout);
    return request;
  };

  const rejectAll = (error: Error) => {
    for (const id of pending.keys()) {
      takePending(id)?.reject(error);
    }
  };

  const makeUnavailable = (error: Error) => {
    if (disposed || unavailableError) return;
    unavailableError = error;
    rejectAll(error);
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
  };

  worker.onmessage = (event) => {
    const response = event.data;
    const request = takePending(response.id);
    if (!request || disposed) return;

    if (!response.ok) {
      request.reject(new Error(response.error));
      return;
    }

    try {
      request.resolve({
        url: deps.createObjectURL(response.blob),
        byteSize: response.blob.size,
      });
    } catch (error) {
      request.reject(error instanceof Error ? error : new Error('Failed to create result URL'));
    }
  };

  worker.onerror = (event) => {
    makeUnavailable(new Error(event.message || 'Worker image processing failed'));
  };

  worker.onmessageerror = () => {
    makeUnavailable(new Error('Worker response could not be deserialized'));
  };

  const request = (message: WorkerRequestPayload): Promise<RenderOutput> => {
    if (disposed) return Promise.reject(new WorkerCancelledError());
    if (unavailableError) return Promise.reject(unavailableError);

    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timeout = deps.setTimeout(() => {
        if (!pending.has(id)) return;
        makeUnavailable(new Error(`Worker request timed out after ${deps.timeoutMs}ms`));
      }, deps.timeoutMs);

      pending.set(id, { resolve, reject, timeout });
      try {
        worker.postMessage({ ...message, id });
      } catch (error) {
        takePending(id)?.reject(
          error instanceof Error ? error : new Error('Failed to post worker request')
        );
      }
    });
  };

  return {
    processImage: (file, settings, dateOverride, transform, renderBudgetLimits) =>
      request({ type: 'processImage', file, settings, dateOverride, transform, renderBudgetLimits }),
    generateFilmStrip: (images, settings, renderBudgetLimits) =>
      request({ type: 'generateFilmStrip', images, settings, renderBudgetLimits }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      rejectAll(new WorkerCancelledError());
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    },
  };
}

let workerRenderer: WorkerRenderer | null | undefined;

function getWorkerRenderer(): WorkerRenderer | null {
  if (workerRenderer === undefined) {
    workerRenderer = createWorkerRenderer();
  }
  return workerRenderer;
}

export function disposeFilmWorkerClient() {
  workerRenderer?.dispose();
  workerRenderer = undefined;
}

export function cancelFilmRendering() {
  disposeFilmWorkerClient();
}

const withImageSourceUrl = async <T>(
  fileOrSource: File | string,
  previewUrlFallback: string | undefined,
  run: (sourceUrl: string) => Promise<T>
): Promise<T> => {
  if (typeof fileOrSource === 'string') {
    return run(fileOrSource);
  }

  if (previewUrlFallback) {
    return run(previewUrlFallback);
  }

  const objectUrl = URL.createObjectURL(fileOrSource);
  try {
    return await run(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const processImage = async (
  fileOrSource: File | string,
  settings: FilmSettings,
  dateOverride?: string,
  previewUrlFallback?: string,
  transform?: RenderTransform,
  renderBudgetLimits?: RenderBudgetLimits,
): Promise<RenderOutput> => {
  const canSendFile = typeof File !== 'undefined' && fileOrSource instanceof File;
  if (canSendFile && shouldUseWorkerForSettings(settings)) {
    const renderer = getWorkerRenderer();
    if (renderer) {
      try {
        return await renderer.processImage(
          fileOrSource,
          settings,
          dateOverride,
          transform,
          renderBudgetLimits,
        );
      } catch (error) {
        if (isWorkerCancelledError(error)) throw error;
        console.warn('Worker image processing failed; falling back to main thread.', error);
      }
    }
  }

  return withImageSourceUrl(fileOrSource, previewUrlFallback, async (sourceUrl) => {
    return mainThreadEngine.processImage(
      sourceUrl,
      settings,
      dateOverride,
      transform,
      renderBudgetLimits,
    );
  });
};

export const generateFilmStrip = async (
  images: ImageItem[],
  settings: FilmSettings,
  renderBudgetLimits?: RenderBudgetLimits,
): Promise<RenderOutput> => {
  if (shouldUseWorkerForSettings(settings)) {
    const renderer = getWorkerRenderer();
    if (renderer) {
      try {
        return await renderer.generateFilmStrip(images, settings, renderBudgetLimits);
      } catch (error) {
        if (isWorkerCancelledError(error)) throw error;
        console.warn('Worker film strip generation failed; falling back to main thread.', error);
      }
    }
  }

  return mainThreadEngine.generateFilmStrip(images, settings, renderBudgetLimits);
};
