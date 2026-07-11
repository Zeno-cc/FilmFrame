export interface PreviewRenderController<Request> {
  schedule(request: Request): number;
  dispose(): void;
}

export interface PreviewRenderControllerDependencies<Request> {
  render: (request: Request) => Promise<string>;
  onResult: (url: string) => void;
  onError?: (error: Error) => void;
  revokeObjectURL: (url: string) => void;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  debounceMs: number;
}

const defaultTimerDependencies = {
  setTimeout: ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
    globalThis.setTimeout(handler, timeout, ...args)) as typeof globalThis.setTimeout,
  clearTimeout: ((timeout?: ReturnType<typeof globalThis.setTimeout>) =>
    globalThis.clearTimeout(timeout)) as typeof globalThis.clearTimeout,
  debounceMs: 300,
};

export function createPreviewRenderController<Request>(
  dependencies: Omit<
    PreviewRenderControllerDependencies<Request>,
    'setTimeout' | 'clearTimeout' | 'debounceMs'
  > & Partial<Pick<
    PreviewRenderControllerDependencies<Request>,
    'setTimeout' | 'clearTimeout' | 'debounceMs'
  >>
): PreviewRenderController<Request> {
  const deps = { ...defaultTimerDependencies, ...dependencies };
  let generation = 0;
  let disposed = false;
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let currentUrl: string | null = null;

  const schedule = (request: Request): number => {
    if (disposed) return generation;
    generation += 1;
    const requestGeneration = generation;

    if (timer !== null) {
      deps.clearTimeout(timer);
    }

    timer = deps.setTimeout(() => {
      timer = null;
      let renderPromise: Promise<string>;
      try {
        renderPromise = deps.render(request);
      } catch (error) {
        if (!disposed && requestGeneration === generation) {
          deps.onError?.(error instanceof Error ? error : new Error('Preview render failed'));
        }
        return;
      }
      void renderPromise.then(
        url => {
          if (disposed || requestGeneration !== generation) {
            deps.revokeObjectURL(url);
            return;
          }
          if (currentUrl && currentUrl !== url) {
            deps.revokeObjectURL(currentUrl);
          }
          currentUrl = url;
          deps.onResult(url);
        },
        error => {
          if (disposed || requestGeneration !== generation) return;
          deps.onError?.(error instanceof Error ? error : new Error('Preview render failed'));
        }
      );
    }, deps.debounceMs);

    return requestGeneration;
  };

  return {
    schedule,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      generation += 1;
      if (timer !== null) {
        deps.clearTimeout(timer);
        timer = null;
      }
      if (currentUrl) {
        deps.revokeObjectURL(currentUrl);
        currentUrl = null;
      }
    },
  };
}
