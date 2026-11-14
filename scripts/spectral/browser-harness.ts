import { createPortraPipeline, renderPortraStages, DEFAULT_SPECTRAL_LIMITS, type PortraPipeline } from '../../services/spectral/portraPipeline';
import { portraResource } from '../../services/spectral/resources/portraResource';
import { exposePaper, developPaper } from '../../services/spectral/print';
import { scanPaper } from '../../services/spectral/scan';
import type { RgbImage, SpectralStages } from '../../services/spectral/types';

interface BenchmarkRecord {
  width: number;
  height: number;
  setupMs: number;
  perSizeSetupMs: number;
  firstRenderMs: number;
  repeatedPrintMs: number[];
  repeatedPrintMeanMs: number;
  inputBytes: number;
  stageBytes: number;
  peakArrayEstimateBytes: number;
  peakArrayEstimateScope: string;
  staticSetupBytes: number;
  canvasBytes: number;
  heapBefore?: number;
  heapAfter?: number;
  wavelengthIterations: number;
  spectralIntegralIterations: number;
  outputChecksum: number;
  overBudgetRejected: boolean;
}

interface HarnessResult {
  records: BenchmarkRecord[];
  comparison: {
    left: 'legacy byte-space neutral contrast reference, not production filmEngine';
    right: 'spectral Portra 400 -> Endura pointwise pipeline';
    maxAbsoluteByteDifference: number;
    meanAbsoluteByteDifference: number;
    differentPixels: number;
    pixels: number;
    pngDataUrl: string;
  };
  errors: string[];
}

declare global {
  interface Window {
    spectralBenchmark?: (sizes: [number, number][], repeats: number) => Promise<HarnessResult>;
  }
}

function createSynthetic(width: number, height: number): RgbImage {
  const pixels = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const u = x / Math.max(width - 1, 1);
      const v = y / Math.max(height - 1, 1);
      pixels[offset] = 0.01 + 0.89 * u;
      pixels[offset + 1] = 0.01 + 0.79 * (0.3 * u + 0.7 * v);
      pixels[offset + 2] = 0.01 + 0.69 * (1 - u) * (0.25 + 0.75 * v);
    }
  }
  return { width, height, pixels };
}

function createLegacyReference(image: RgbImage): Uint8ClampedArray<ArrayBuffer> {
  // Deliberately named approximation only. It is not FilmFrame's legacy engine.
  const output = new Uint8ClampedArray(image.width * image.height * 4);
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = image.pixels[pixel * 3 + channel];
      const encoded = 1.055 * Math.max(value, 0) ** (1 / 2.4) - 0.055;
      output[pixel * 4 + channel] = Math.round(Math.min(1, Math.max(0, (encoded - 0.5) * 0.92 + 0.5)) * 255);
    }
    output[pixel * 4 + 3] = 255;
  }
  return output;
}

function toRgba(stages: SpectralStages): Uint8ClampedArray<ArrayBuffer> {
  const output = new Uint8ClampedArray(stages.width * stages.height * 4);
  for (let pixel = 0; pixel < stages.width * stages.height; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      output[pixel * 4 + channel] = Math.round(stages.printRgb[pixel * 3 + channel] * 255);
    }
    output[pixel * 4 + 3] = 255;
  }
  return output;
}

function heapUsed(): number | undefined {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory?.usedJSHeapSize;
}

function benchmarkSize(width: number, height: number, repeats: number, pipeline: PortraPipeline, setupMs: number): BenchmarkRecord {
  const image = createSynthetic(width, height);
  const heapBefore = heapUsed();
  const setupStart = performance.now();
  createPortraPipeline(portraResource);
  const perSizeSetupMs = performance.now() - setupStart;
  const start = performance.now();
  const stages = renderPortraStages(image, pipeline);
  const firstRenderMs = performance.now() - start;
  const repeatedPrintMs: number[] = [];
  for (let index = 0; index < repeats; index += 1) {
    const printStart = performance.now();
    const log = exposePaper(pipeline.setup, pipeline.print, stages.negativeDensity);
    const density = developPaper(pipeline.setup, log);
    scanPaper(pipeline.setup, density);
    repeatedPrintMs.push(performance.now() - printStart);
  }
  let checksum = 0;
  for (let index = 0; index < stages.printRgb.length; index += 1) checksum = (checksum + stages.printRgb[index] * (index + 1)) % 1e9;
  let overBudgetRejected = false;
  try {
    renderPortraStages(image, pipeline, { ...DEFAULT_SPECTRAL_LIMITS, maxPixels: width * height - 1 });
  } catch {
    overBudgetRejected = true;
  }
  const canvasBytes = width * height * 4;
  return {
    width, height, setupMs, perSizeSetupMs, firstRenderMs, repeatedPrintMs,
    repeatedPrintMeanMs: repeatedPrintMs.reduce((sum, value) => sum + value, 0) / repeats,
    inputBytes: stages.allocation.inputBytes,
    stageBytes: stages.allocation.stageBytes,
    peakArrayEstimateBytes: stages.allocation.workingArrayBytes + stages.allocation.stageBytes * 2,
    peakArrayEstimateScope: 'first render source + five stage planes, reprint log + density + scan output, and receiver; excludes fixed JSON resources, RGBA/canvas and GC overlap',
    staticSetupBytes: pipeline.setup.staticBytes,
    canvasBytes,
    ...(heapBefore === undefined ? {} : { heapBefore, heapAfter: heapUsed() }),
    wavelengthIterations: width * height * 81,
    spectralIntegralIterations: stages.allocation.wavelengthIterations,
    outputChecksum: checksum,
    overBudgetRejected,
  };
}

function createComparison(pipeline: PortraPipeline): HarnessResult['comparison'] {
  const width = 512;
  const height = 192;
  const image = createSynthetic(width, height);
  const legacy = createLegacyReference(image);
  const spectral = toRgba(renderPortraStages(image, pipeline));
  const canvas = document.querySelector<HTMLCanvasElement>('#comparison');
  if (!canvas) throw new Error('Missing synthetic comparison canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas2D unavailable');
  context.fillStyle = '#171717';
  context.fillRect(0, 0, 1024, 224);
  context.fillStyle = '#eeeeee';
  context.font = '14px system-ui';
  context.fillText('Simple byte-space reference (not production)', 8, 20);
  context.fillText('Spectral Portra / Endura', 520, 20);
  context.putImageData(new ImageData(legacy, width, height), 0, 32);
  context.putImageData(new ImageData(spectral, width, height), 512, 32);
  let maximum = 0;
  let sum = 0;
  let differentPixels = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    let changed = false;
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = Math.abs(legacy[pixel * 4 + channel] - spectral[pixel * 4 + channel]);
      maximum = Math.max(maximum, difference);
      sum += difference;
      if (difference > 0) changed = true;
    }
    if (changed) differentPixels += 1;
  }
  return {
    left: 'legacy byte-space neutral contrast reference, not production filmEngine',
    right: 'spectral Portra 400 -> Endura pointwise pipeline',
    maxAbsoluteByteDifference: maximum,
    meanAbsoluteByteDifference: sum / (width * height * 3),
    differentPixels,
    pixels: width * height,
    pngDataUrl: canvas.toDataURL('image/png'),
  };
}

window.spectralBenchmark = async (sizes, repeats) => {
  const errors: string[] = [];
  const records: BenchmarkRecord[] = [];
  const setupStart = performance.now();
  const pipeline = createPortraPipeline(portraResource);
  const setupMs = performance.now() - setupStart;
  for (const [width, height] of sizes) {
    try {
      records.push(benchmarkSize(width, height, repeats, pipeline, setupMs));
      await new Promise(resolve => setTimeout(resolve, 0));
    } catch (error) {
      errors.push(`${width}x${height}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const comparison = createComparison(pipeline);
  const result = { records, comparison, errors };
  const status = document.querySelector('#status');
  if (status) status.textContent = JSON.stringify({ records, errors }, null, 2);
  return result;
};
