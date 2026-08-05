import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_CANVAS_MIB,
  DEFAULT_RUNTIME_RENDER_CONFIG,
  MAX_MAX_CANVAS_MIB,
  MEBIBYTE,
  MIN_MAX_CANVAS_MIB,
  createRuntimeRenderConfig,
  decodeRuntimeRenderConfig,
  loadRuntimeRenderConfig,
} from '../services/runtimeConfig';

const payload = (maxCanvasMiB: number) => ({
  maxCanvasMiB,
  maxCanvasBytes: maxCanvasMiB * MEBIBYTE,
  updatedAt: 1_754_000_000_000,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runtime render configuration', () => {
  it.each([
    MIN_MAX_CANVAS_MIB,
    DEFAULT_MAX_CANVAS_MIB,
    MAX_MAX_CANVAS_MIB,
  ])('decodes %i MiB into exact RGBA pixel limits', (maxCanvasMiB) => {
    const config = decodeRuntimeRenderConfig(payload(maxCanvasMiB));
    expect(config).toEqual({
      ...payload(maxCanvasMiB),
      renderBudgetLimits: {
        maxPixels: maxCanvasMiB * MEBIBYTE / 4,
      },
    });
  });

  it.each([
    MIN_MAX_CANVAS_MIB - 1,
    MAX_MAX_CANVAS_MIB + 1,
    700.5,
    Number.NaN,
  ])('rejects an invalid MiB value (%s)', (maxCanvasMiB) => {
    expect(() => decodeRuntimeRenderConfig(payload(maxCanvasMiB))).toThrow();
  });

  it('rejects inconsistent byte and timestamp fields', () => {
    expect(() => decodeRuntimeRenderConfig({
      ...payload(700),
      maxCanvasBytes: 700 * MEBIBYTE - 1,
    })).toThrow('do not match');
    expect(() => createRuntimeRenderConfig(700, Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it('rejects missing and additional response fields', () => {
    const { updatedAt: _updatedAt, ...missing } = payload(700);
    expect(() => decodeRuntimeRenderConfig(missing)).toThrow('missing or unsupported');
    expect(() => decodeRuntimeRenderConfig({ ...payload(700), adminEmail: 'hidden@example.test' }))
      .toThrow('missing or unsupported');
  });

  it('returns a bounded 700 MiB fallback when the request fails', async () => {
    const fetchRuntimeConfig = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(loadRuntimeRenderConfig({
      fetch: fetchRuntimeConfig as unknown as typeof fetch,
    })).resolves.toEqual({
      status: 'fallback',
      config: DEFAULT_RUNTIME_RENDER_CONFIG,
      reason: 'offline',
    });
  });

  it('falls back after the bounded request timeout', async () => {
    vi.useFakeTimers();
    const fetchRuntimeConfig = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('timed out')), { once: true });
      })
    ));
    const pending = loadRuntimeRenderConfig({
      fetch: fetchRuntimeConfig as typeof fetch,
      timeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).resolves.toMatchObject({
      status: 'fallback',
      config: DEFAULT_RUNTIME_RENDER_CONFIG,
    });
  });

  it('loads same-origin JSON without using a cached response', async () => {
    const fetchRuntimeConfig = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(payload(1_024)),
    });
    const result = await loadRuntimeRenderConfig({
      fetch: fetchRuntimeConfig as unknown as typeof fetch,
    });

    expect(result.status).toBe('ready');
    expect(result.config.maxCanvasMiB).toBe(1_024);
    expect(fetchRuntimeConfig).toHaveBeenCalledWith('/api/runtime-config', expect.objectContaining({
      credentials: 'same-origin',
      cache: 'no-store',
    }));
  });
});
