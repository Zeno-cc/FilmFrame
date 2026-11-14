import { expect, test } from '@playwright/test';
import { FilmType } from '../../types';

const stocks = [
  FilmType.KODAK_GOLD_200, FilmType.KODAK_PORTRA_400, FilmType.KODAK_EKTAR_100,
  FilmType.FUJI_C200, FilmType.FUJI_XTRA_400, FilmType.FUJI_PRO_400H, FilmType.KODAK_VISION3_500T,
];

for (const stock of stocks) {
  test(`${stock} physical GPU stages match the shared CPU reference`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.baseURL !== 'http://127.0.0.1:4174', 'Direct source-module numerical diagnostics require the development server.');
    await page.goto('/');
    const result = await page.evaluate(async stock => {
      const { loadSpectralStockResource } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/stockResourceLoader.ts`) as typeof import('../../services/spectral/stockResourceLoader');
      const { createPortraPipeline } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/portraPipeline.ts`) as typeof import('../../services/spectral/portraPipeline');
      const { WebGlSpectralRenderer } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/webgl/renderer.ts`) as typeof import('../../services/spectral/webgl/renderer');
      const { solveBaseCancelingHoleDensity, blendFilmPresence } = await import(/* @vite-ignore */ `${location.origin}/services/physical135/density.ts`) as typeof import('../../services/physical135/density');
      const { exposeFilm, developFilm } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/film.ts`) as typeof import('../../services/spectral/film');
      const { exposePaper, developPaper } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/print.ts`) as typeof import('../../services/spectral/print');
      const { scanPaper } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/scan.ts`) as typeof import('../../services/spectral/scan');
      const { multiply3 } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/math.ts`) as typeof import('../../services/spectral/math');
      const common = createPortraPipeline(await loadSpectralStockResource('FUJI PRO 400H' as FilmType));
      const pipeline = createPortraPipeline(await loadSpectralStockResource(stock));
      const a = pipeline.setup.arrays;
      const hole = solveBaseCancelingHoleDensity(a.filmChannelDensity, a.filmBaseDensity, a.filmSpectralValidMask);
      const pixels = new Float32Array(16 * 3);
      const presence = new Float32Array(16);
      for (let pixel = 0; pixel < 16; pixel++) {
        pixels.set(multiply3(common.setup.arrays.srgbToProPhoto, [pixel % 4 / 3, Math.floor(pixel / 4) / 3, 0.4]), pixel * 3);
        presence[pixel] = pixel % 5 === 0 ? 0 : pixel % 5 === 1 ? 0.5 : 1;
      }
      const image = { width: 4, height: 4, pixels };
      const expectedFilm = blendFilmPresence(developFilm(pipeline.setup, exposeFilm(pipeline.setup, image)), presence, hole.cmy);
      const expectedPrint = scanPaper(pipeline.setup, developPaper(pipeline.setup, exposePaper(pipeline.setup, pipeline.print, expectedFilm)));
      // This is numerical acceptance of the actual GL implementation, including software GL.
      // It deliberately does not exercise or weaken application backend-selection policy.
      const renderer = new WebGlSpectralRenderer(new OffscreenCanvas(4, 4), pipeline);
      try {
        const { frame } = renderer.render(image, presence, hole.cmy);
        try {
          const actualFilm = renderer.readStage(frame, 'filmRaw').rgb; // Physical rendering reuses filmRaw for compensated density.
          const actualPrint = renderer.readStage(frame, 'printRgb').rgb;
          let maximumFilmDifference = 0, maximumPrintDifference = 0, worstPrintChannel = -1;
          for (let index = 0; index < expectedFilm.length; index++) {
            maximumFilmDifference = Math.max(maximumFilmDifference, Math.abs(actualFilm[index] - expectedFilm[index]));
            const difference = Math.abs(actualPrint[index] - expectedPrint[index]);
            if (difference > maximumPrintDifference) { maximumPrintDifference = difference; worstPrintChannel = index; }
          }
          return { stock, maximumFilmDifference, maximumPrintDifference, worstPrintChannel,
            renderer: renderer.info.capabilities.unmaskedRenderer, highp: renderer.info.capabilities.fragmentHighp };
        } finally { renderer.releaseFrame(frame); }
      } finally { renderer.dispose(); }
    }, stock);
    await testInfo.attach('spectral-physical-numeric.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result.maximumFilmDifference).toBeLessThan(1e-5);
    expect(result.maximumPrintDifference).toBeLessThan(1e-4);
  });
}

test('GPU scan returns finite black for zero OkLab chroma', async ({ page }, testInfo) => {
  test.skip(testInfo.project.use.baseURL !== 'http://127.0.0.1:4174', 'Direct source-module numerical diagnostics require the development server.');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { loadSpectralStockResource } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/stockResourceLoader.ts`) as typeof import('../../services/spectral/stockResourceLoader');
    const { createPortraPipeline } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/portraPipeline.ts`) as typeof import('../../services/spectral/portraPipeline');
    const { WebGlSpectralRenderer } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/webgl/renderer.ts`) as typeof import('../../services/spectral/webgl/renderer');
    const { scanPaper } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/scan.ts`) as typeof import('../../services/spectral/scan');
    const pipeline = createPortraPipeline(await loadSpectralStockResource('KODAK GOLD 200' as FilmType));
    const renderer = new WebGlSpectralRenderer(new OffscreenCanvas(1, 1), pipeline);
    try {
      const { frame } = renderer.createFrame({ width: 1, height: 1, pixels: new Float32Array(3) });
      try {
        // All transmitted light underflows to zero, so XYZ, LMS and OkLab chroma are exactly zero.
        const density = new Float32Array(3).fill(10000);
        const gl = renderer.device.gl;
        gl.bindTexture(gl.TEXTURE_2D, frame.paperDensity);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.FLOAT, new Float32Array([10000, 10000, 10000, 1]));
        gl.bindTexture(gl.TEXTURE_2D, null);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Neutral-density texture upload failed');
        renderer.scanPrint(frame);
        const actual = renderer.readStage(frame, 'printRgb').rgb;
        return { actual: Array.from(actual), expected: Array.from(scanPaper(pipeline.setup, density)) };
      } finally { renderer.releaseFrame(frame); }
    } finally { renderer.dispose(); }
  });
  expect(result.actual.every(Number.isFinite)).toBe(true);
  expect(result.expected).toEqual([0, 0, 0]);
  expect(result.actual).toEqual(result.expected);
});

for (const family of ['positive', 'monochrome'] as const) {
  test(`${family} GPU scan matches its own CPU family reference`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.baseURL !== 'http://127.0.0.1:4174', 'Direct source-module numerical diagnostics require the development server.');
    await page.goto('/');
    const result = await page.evaluate(async family => {
      const { WebGlSpectralRenderer } = await import(/* @vite-ignore */ `${location.origin}/services/spectral/webgl/renderer.ts`) as typeof import('../../services/spectral/webgl/renderer');
      const positive = await import(/* @vite-ignore */ `${location.origin}/services/spectral/positive.ts`) as typeof import('../../services/spectral/positive');
      const monochrome = await import(/* @vite-ignore */ `${location.origin}/services/spectral/monochrome.ts`) as typeof import('../../services/spectral/monochrome');
      const pixels = new Float32Array(16 * 3);
      for (let pixel = 0; pixel < 16; pixel++) pixels.set([pixel % 4 / 3, Math.floor(pixel / 4) / 3, 0.4], pixel * 3);
      const image = { width: 4, height: 4, pixels };
      const pipeline = family === 'positive'
        ? await positive.loadPositiveStockResource('FUJI PROVIA 100F' as FilmType)
        : await monochrome.loadMonochromeStockResource('ILFORD HP5 PLUS' as FilmType);
      const expected = 'densityMax' in pipeline
        ? positive.renderPositiveStages(image, pipeline).scanRgb
        : monochrome.renderMonochromeStages(image, pipeline).printRgb;
      const renderer = new WebGlSpectralRenderer(new OffscreenCanvas(4, 4), pipeline);
      try {
        const { frame } = renderer.render(image);
        try {
          const actual = renderer.readStage(frame, 'printRgb').rgb;
          let maximumDifference = 0;
          for (let index = 0; index < expected.length; index++) maximumDifference = Math.max(maximumDifference, Math.abs(actual[index] - expected[index]));
          return { family, maximumDifference, finite: expected.every(Number.isFinite) && actual.every(Number.isFinite),
            stock: pipeline.setup.resource.configuration.filmId, renderer: renderer.info.capabilities.unmaskedRenderer };
        } finally { renderer.releaseFrame(frame); }
      } finally { renderer.dispose(); }
    }, family);
    await testInfo.attach('spectral-family-numeric.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result.finite).toBe(true);
    expect(result.maximumDifference).toBeLessThan(1e-4);
  });
}
