import { createServer } from 'vite';
import { chromium, firefox, webkit } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { arch, cpus, platform, totalmem } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const research = resolve(root, '.trellis/tasks/11-06-webgl2-spectral-migration/research');
const stock = process.argv.find(argument => argument.startsWith('--stock='))?.split('=')[1];
const quick = process.argv.includes('--quick');
const browsers = process.argv.includes('--all-browsers') ? [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]] : [['chromium', chromium]];
const port = 5193;
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true } });
const results = [];
try {
  await server.listen();
  for (const [name, type] of browsers) {
    const record = {
      browser: name, status: 'unavailable', platform: platform(), arch: arch(),
      externalRequests: [], consoleErrors: [],
    };
    let browser;
    try {
      browser = await type.launch({ headless: true, ...(name === 'chromium' ? { ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--enable-precise-memory-info'] } : {}) });
      record.browserVersion = browser.version();
      const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
      page.setDefaultTimeout(600_000);
      page.on('pageerror', error => record.consoleErrors.push(`pageerror: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') record.consoleErrors.push(`console: ${message.text()}`); });
      page.on('request', request => {
        if (!request.url().startsWith(`http://127.0.0.1:${port}/`) && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) record.externalRequests.push(request.url());
      });
      await page.goto(`http://127.0.0.1:${port}/scripts/spectral/webgl-harness.html${stock ? `?stock=${stock}` : ''}`, { waitUntil: 'networkidle' });
      const sizes = name === 'chromium' ? (quick ? [[256, 256]] : [[256, 256], [1920, 1080]]) : [];
      record.result = await page.evaluate(async ({ sizes, repeats }) => {
        if (!window.spectralWebGlHarness) throw new Error('WebGL spectral harness did not initialize');
        return window.spectralWebGlHarness(sizes, repeats);
      }, { sizes, repeats: name === 'chromium' ? 2 : 0 });
      const failures = record.result?.failures ?? [];
      const parity = record.result?.fixtures?.length === 3 && record.result.fixtures.every(fixture => fixture.passed);
      const lifecycle = record.result?.lifecycle;
      const lifecyclePassed = lifecycle && lifecycle.textureBytesAfterRelease === lifecycle.setupTextureBytes
        && lifecycle.budgetRejected && lifecycle.textureBudgetRejected && lifecycle.lostRejected && lifecycle.disposedRejected && lifecycle.finalTextureBytes === 0
        && lifecycle.readbackFormat === 'FLOAT' && lifecycle.unsupported?.noWebGl && lifecycle.unsupported?.noFloat;
      record.status = parity && lifecyclePassed && failures.length === 0 && record.consoleErrors.length === 0 && record.externalRequests.length === 0 && (name !== 'chromium' || record.result.benchmarks.length === sizes.length) ? 'passed' : 'failed';
      if (!lifecyclePassed) record.lifecycleFailure = 'Release, budget, loss or disposal assertion failed; inspect lifecycle record';
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      record.status = 'unavailable';
    } finally {
      await browser?.close();
    }
    results.push(record);
  }
  const report = {
    schema: 1,
    date: '2026-11-06',
    scope: 'Isolated pointwise WebGL2 feasibility; CPU oracle and explicit test-only GPU stage readback. No production UI, stock migration, native spatial/stochastic effects, public distribution or full-engine parity claim.',
    configuration: {
      film: stock ?? 'kodak_portra_400', paper: stock?.startsWith('fuji') ? 'fujifilm_crystal_archive_typeii' : stock?.startsWith('kodak_vision3') ? 'kodak_2383' : 'kodak_portra_endura',
      input: 'scene-linear ProPhoto including explicit synthetic sRGB transfer/primaries conversion',
      output: 'sRGB with measured OkLch compression', densityFormat: 'RGBA32F',
      spatialEffects: false, stochasticEffects: false, grain: false, templates: false,
      externalRuntimeDependencies: false, photos: false,
      licenseNotices: 'services/spectral/NOTICE.md; derived GPL-3.0-or-later and CC BY-SA 4.0; unresolved Hanatos/KG3 distribution blockers retained',
    },
    environment: {
      platform: platform(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown',
      totalMemoryBytes: totalmem(), node: process.version, playwright: '1.61.1',
    },
    results,
  };
  const file = quick ? `webgl-smoke${stock ? `-${stock}` : ''}.json` : browsers.length === 1 ? `webgl-browser-validation${stock ? `-${stock}` : ''}.json` : 'webgl-cross-browser-validation.json';
  await writeFile(resolve(research, file), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.results.map(record => ({ browser: record.browser, status: record.status, error: record.error, consoleErrors: record.consoleErrors, failures: record.result?.failures, stages: record.result?.fixtures?.map(fixture => ({ fixture: fixture.fixture, passed: fixture.passed, stages: Object.fromEntries(Object.entries(fixture.stages).map(([stage, difference]) => [stage, { maxAbs: difference.maxAbs, violations: difference.violations, firstActual: difference.firstActual, firstExpected: difference.firstExpected }])) })), lifecycle: record.result?.lifecycle })), null, 2));
  if (results.some(record => record.status !== 'passed')) process.exitCode = 1;
} finally {
  await server.close();
}
