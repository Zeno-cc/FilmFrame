import {
  DEFAULT_MAX_CANVAS_MIB,
  MEBIBYTE,
  RGBA_BYTES_PER_PIXEL,
  type RenderBudgetLimits,
} from './renderBudget';

export const MIN_MAX_CANVAS_MIB = 128;
export const MAX_MAX_CANVAS_MIB = 2_048;
export { DEFAULT_MAX_CANVAS_MIB, MEBIBYTE, RGBA_BYTES_PER_PIXEL };

export interface RuntimeRenderConfig {
  maxCanvasMiB: number;
  maxCanvasBytes: number;
  updatedAt: number | null;
  renderBudgetLimits: RenderBudgetLimits;
}

export type RuntimeConfigState =
  | { status: 'loading'; config: RuntimeRenderConfig }
  | { status: 'ready'; config: RuntimeRenderConfig }
  | { status: 'fallback'; config: RuntimeRenderConfig; reason: string };

type RuntimeConfigPayload = {
  maxCanvasMiB: number;
  maxCanvasBytes: number;
  updatedAt: number;
};

export const createRuntimeRenderConfig = (
  maxCanvasMiB: number,
  updatedAt: number | null,
): RuntimeRenderConfig => {
  if (
    !Number.isSafeInteger(maxCanvasMiB)
    || maxCanvasMiB < MIN_MAX_CANVAS_MIB
    || maxCanvasMiB > MAX_MAX_CANVAS_MIB
  ) {
    throw new RangeError(
      `Canvas budget must be an integer from ${MIN_MAX_CANVAS_MIB} to ${MAX_MAX_CANVAS_MIB} MiB`,
    );
  }
  if (updatedAt !== null && (!Number.isSafeInteger(updatedAt) || updatedAt < 0)) {
    throw new RangeError('Runtime configuration timestamp must be a non-negative integer');
  }

  const maxCanvasBytes = maxCanvasMiB * MEBIBYTE;
  return {
    maxCanvasMiB,
    maxCanvasBytes,
    updatedAt,
    renderBudgetLimits: {
      maxPixels: maxCanvasBytes / RGBA_BYTES_PER_PIXEL,
    },
  };
};

export const DEFAULT_RUNTIME_RENDER_CONFIG = createRuntimeRenderConfig(
  DEFAULT_MAX_CANVAS_MIB,
  null,
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeRuntimeRenderConfig(value: unknown): RuntimeRenderConfig {
  if (!isRecord(value)) throw new TypeError('Runtime configuration must be an object');
  const expectedKeys = ['maxCanvasBytes', 'maxCanvasMiB', 'updatedAt'];
  const keys = Object.keys(value).sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new TypeError('Runtime configuration contains missing or unsupported fields');
  }

  const payload: RuntimeConfigPayload = {
    maxCanvasMiB: value.maxCanvasMiB as number,
    maxCanvasBytes: value.maxCanvasBytes as number,
    updatedAt: value.updatedAt as number,
  };
  const config = createRuntimeRenderConfig(payload.maxCanvasMiB, payload.updatedAt);

  if (!Number.isSafeInteger(payload.maxCanvasBytes) || payload.maxCanvasBytes !== config.maxCanvasBytes) {
    throw new TypeError('Runtime configuration Canvas bytes do not match its MiB value');
  }

  return config;
}

export interface LoadRuntimeConfigOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function loadRuntimeRenderConfig(
  options: LoadRuntimeConfigOptions = {},
): Promise<Exclude<RuntimeConfigState, { status: 'loading' }>> {
  const fetchRuntimeConfig = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchRuntimeConfig('/api/runtime-config', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Runtime configuration request failed with status ${response.status}`);
    }

    return {
      status: 'ready',
      config: decodeRuntimeRenderConfig(await response.json()),
    };
  } catch (error) {
    return {
      status: 'fallback',
      config: DEFAULT_RUNTIME_RENDER_CONFIG,
      reason: error instanceof Error ? error.message : 'Runtime configuration is unavailable',
    };
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}
