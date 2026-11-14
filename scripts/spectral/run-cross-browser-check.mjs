import { createServer } from 'vite';
import { firefox, webkit } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { arch, platform } from 'node:os';

const root = resolve(import.meta.dirname, '../..');
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5192, strictPort: true } });
const results = [];
try {
  await server.listen();
  for (const [name, type] of [['firefox', firefox], ['webkit', webkit]]) {
    const record = { browser: name, status: 'unavailable', platform: platform(), arch: arch(), externalRequests: [], consoleErrors: [] };
    let browser;
    try {
      browser = await type.launch({ headless: true });
      record.browserVersion = browser.version();
      const page = await browser.newPage();
      page.on('pageerror', error => record.consoleErrors.push(error.message));
      page.on('request', request => {
        if (!request.url().startsWith('http://127.0.0.1:5192/')) record.externalRequests.push(request.url());
      });
      await page.goto('http://127.0.0.1:5192/scripts/spectral/cross-browser-harness.html', { waitUntil: 'networkidle' });
      record.result = await page.evaluate(() => {
        if (!window.spectralCrossBrowserCheck) throw new Error('Cross-browser harness failed to initialize');
        return window.spectralCrossBrowserCheck();
      });
      record.status = record.consoleErrors.length === 0 && record.externalRequests.length === 0 ? 'passed' : 'failed';
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
    } finally {
      await browser?.close();
    }
    results.push(record);
  }
  const report = {
    schema: 1,
    date: '2026-11-06',
    scope: 'Focused synthetic numeric checks at gray-ramp16 and green-patch8. No 1080p benchmark or production UI claim.',
    configuration: 'Portra 400 -> Portra Endura, Float32Array, exact two 81-wavelength integrals, OkLch output, no GPU/WASM/grain/templates',
    results,
  };
  await writeFile(resolve(root, '.trellis/tasks/11-06-spectral-negative-print-prototype/research/cross-browser-validation.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (results.some(record => record.status !== 'passed')) process.exitCode = 1;
} finally {
  await server.close();
}
