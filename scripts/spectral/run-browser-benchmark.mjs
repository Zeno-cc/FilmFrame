import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform, arch } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const outputDir = resolve(root, 'output/playwright/spectral');
const server = await createServer({
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 5191, strictPort: true },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.setDefaultTimeout(600_000);
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('request', request => requests.push(request.url()));
  await page.goto('http://127.0.0.1:5191/scripts/spectral/browser-harness.html', { waitUntil: 'networkidle' });
  const result = await page.evaluate(async () => {
    if (!window.spectralBenchmark) throw new Error('Spectral benchmark module did not initialize');
    return window.spectralBenchmark([[256, 256], [1920, 1080]], 2);
  });
  const externalRequests = requests.filter(url => !url.startsWith('http://127.0.0.1:5191/') && !url.startsWith('data:') && !url.startsWith('blob:'));
  const report = {
    schema: 1,
    date: '2026-11-06',
    scope: 'Isolated synthetic CPU Float32Array numeric benchmark; not production UI/render timing.',
    configuration: {
      film: 'Kodak Portra 400', paper: 'Kodak Portra Endura',
      input: 'scene-linear ProPhoto RGB', output: 'sRGB with measured OkLch compression',
      spatialEffects: false, stochasticEffects: false, grain: false, templates: false,
      gpu: false, wasm: false, runtimeImageRequests: false,
    },
    environment: {
      platform: platform(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown',
      totalMemoryBytes: totalmem(), node: process.version,
      playwright: '1.61.1', browser: browser.browserType().name(), browserVersion: browser.version(),
      userAgent: await page.evaluate(() => navigator.userAgent),
    },
    requests: { count: requests.length, external: externalRequests },
    harnessErrors: [...errors, ...result.errors],
    ...result,
  };
  const pngBase64 = result.comparison.pngDataUrl.replace(/^data:image\/png;base64,/, '');
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, 'synthetic-ab.png'), Buffer.from(pngBase64, 'base64'));
  delete report.comparison.pngDataUrl;
  await writeFile(resolve(outputDir, 'browser-benchmark.json'), `${JSON.stringify(report, null, 2)}\n`);
  await page.screenshot({ path: resolve(outputDir, 'browser-harness.png'), fullPage: true });
  console.log(JSON.stringify(report, null, 2));
  if (errors.length > 0 || result.errors.length > 0 || externalRequests.length > 0 || result.records.length !== 2) {
    throw new Error('Benchmark completed with unavailable or failed evidence; see browser-benchmark.json');
  }
} finally {
  await browser?.close();
  await server.close();
}
