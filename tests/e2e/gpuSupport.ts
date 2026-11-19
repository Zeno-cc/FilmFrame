import type { Page } from '@playwright/test';

/**
 * An explicit WebGL2 request is rejected on a software renderer, which is what
 * headless CI and the bundled Chromium report. Cases that are not about the GPU
 * backend should resolve to CPU; cases that compare GPU against CPU must skip
 * instead of pretending the software renderer is a GPU.
 */
export async function explicitWebgl2SpectralUsable(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
    return !/swiftshader|llvmpipe|software/i.test(renderer);
  });
}

export const NO_HARDWARE_WEBGL2_REASON =
  '本机只有软件渲染器，产品策略会拒绝显式 WebGL2；GPU 路径由真机门禁覆盖。';

export async function resolveSpectralBackend(page: Page, backend: 'cpu' | 'webgl2'): Promise<'cpu' | 'webgl2'> {
  if (backend !== 'webgl2') return backend;
  return (await explicitWebgl2SpectralUsable(page)) ? 'webgl2' : 'cpu';
}
