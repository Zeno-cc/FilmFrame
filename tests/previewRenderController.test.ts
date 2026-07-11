import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreviewRenderController } from '../services/previewRenderController';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('preview render controller', () => {
  it('debounces rapid changes and renders only the final request', async () => {
    vi.useFakeTimers();
    const render = vi.fn(async (request: string) => `blob:${request}`);
    const onResult = vi.fn();
    const controller = createPreviewRenderController({
      render,
      onResult,
      revokeObjectURL: vi.fn(),
      debounceMs: 300,
    });

    controller.schedule('left');
    controller.schedule('center');
    controller.schedule('right');
    await vi.advanceTimersByTimeAsync(300);

    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith('right');
    expect(onResult).toHaveBeenCalledWith('blob:right');
    controller.dispose();
  });

  it('rejects a late generation and revokes its URL', async () => {
    vi.useFakeTimers();
    const first = deferred<string>();
    const second = deferred<string>();
    const render = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onResult = vi.fn();
    const revokeObjectURL = vi.fn();
    const controller = createPreviewRenderController({
      render,
      onResult,
      revokeObjectURL,
      debounceMs: 10,
    });

    controller.schedule('first');
    await vi.advanceTimersByTimeAsync(10);
    controller.schedule('second');
    await vi.advanceTimersByTimeAsync(10);
    first.resolve('blob:late');
    await Promise.resolve();
    second.resolve('blob:current');
    await Promise.resolve();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:late');
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith('blob:current');
    controller.dispose();
  });

  it('revokes accepted and late URLs when disposed', async () => {
    vi.useFakeTimers();
    const late = deferred<string>();
    const render = vi.fn()
      .mockResolvedValueOnce('blob:accepted')
      .mockReturnValueOnce(late.promise);
    const onResult = vi.fn();
    const revokeObjectURL = vi.fn();
    const controller = createPreviewRenderController({
      render,
      onResult,
      revokeObjectURL,
      debounceMs: 5,
    });

    controller.schedule('accepted');
    await vi.advanceTimersByTimeAsync(5);
    expect(onResult).toHaveBeenCalledWith('blob:accepted');

    controller.schedule('late');
    await vi.advanceTimersByTimeAsync(5);
    controller.dispose();
    late.resolve('blob:after-close');
    await Promise.resolve();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:accepted');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:after-close');
  });

  it('reports only current errors', async () => {
    vi.useFakeTimers();
    const first = deferred<string>();
    const onError = vi.fn();
    const controller = createPreviewRenderController({
      render: vi.fn(() => first.promise),
      onResult: vi.fn(),
      onError,
      revokeObjectURL: vi.fn(),
      debounceMs: 1,
    });

    controller.schedule('first');
    await vi.advanceTimersByTimeAsync(1);
    controller.schedule('replacement');
    first.reject(new Error('stale failure'));
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();
    controller.dispose();
  });
});

