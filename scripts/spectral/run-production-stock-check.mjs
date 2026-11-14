import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4174';
const executablePath = process.env.CHROME_PATH || undefined;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });

async function capture({ forceMain = false, backend = 'cpu', stock = 'KODAK GOLD 200', fixture = 'public/film-overlays/film-base.png' }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const resources = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/-setup\.json/.test(request.url())) resources.push(request.url());
  });
  if (forceMain) await page.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const inspector = page.getByRole('complementary', { name: '暗房配方' });
  await inspector.getByLabel('胶片型号').selectOption(stock);
  await inspector.getByLabel('成像方式').selectOption('spectral');
  await inspector.getByLabel('光谱计算').selectOption(backend);
  await inspector.getByLabel('颗粒强度').fill('0');
  await inspector.getByRole('button', { name: 'PNG', exact: true }).click();
  const name = fixture.split('/').pop();
  await page.locator('input[type=file]').setInputFiles(fixture);
  await page.getByRole('button', { name: /冲洗待更新照片/ }).click();
  await page.getByRole('img', { name: '已出片' }).waitFor({ timeout: 60000 });
  const result = await page.getByRole('img', { name }).evaluate(element => {
    if (!(element instanceof HTMLImageElement)) throw new Error('Expected developed image');
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing test canvas');
    context.drawImage(element, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      aperture: Array.from(context.getImageData(150, 400, 100, 100).data),
    };
  });
  await page.close();
  return { ...result, resources, errors };
}

function compare(actual, expected) {
  let maxDifference = 0;
  let differingValues = 0;
  for (let index = 0; index < actual.aperture.length; index += 1) {
    const difference = Math.abs(actual.aperture[index] - expected.aperture[index]);
    maxDifference = Math.max(maxDifference, difference);
    if (difference > 1) differingValues += 1;
  }
  return { maxDifference, differingValues, dimensions: [actual.width, actual.height] };
}

try {
  const cpuWorker = await capture({});
  const cpuMain = await capture({ forceMain: true });
  const report = {
    schema: 1,
    date: '2026-11-07',
    scope: 'Actual Gold 200 layered FilmFrame production path; zero grain, PNG output, aperture interior only. No full-frame legacy texture parity or 1080p performance claim.',
    browser: browser.version(),
    executablePath: executablePath ?? 'Playwright Chromium',
    cpuWorkerMain: compare(cpuWorker, cpuMain),
    resources: { worker: cpuWorker.resources, main: cpuMain.resources },
    errors: [...cpuWorker.errors, ...cpuMain.errors],
  };
  if (executablePath) {
    const gpuWorker = await capture({ backend: 'webgl2' });
    const gpuMain = await capture({ backend: 'webgl2', forceMain: true });
    report.gpuWorkerMain = compare(gpuWorker, gpuMain);
    report.gpuCpuWorker = compare(gpuWorker, cpuWorker);
    report.errors.push(...gpuWorker.errors, ...gpuMain.errors);
  }
  await writeFile('.trellis/tasks/11-06-spectral-negative-stock-rollout/research/gold-production-validation.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length || report.cpuWorkerMain.maxDifference > 0 || (report.gpuWorkerMain && (report.gpuWorkerMain.maxDifference > 0 || report.gpuCpuWorker.maxDifference > 0))) process.exitCode = 1;
} finally {
  await browser.close();
}
