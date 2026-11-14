import { createPortraPipeline, renderPortraStages, type PortraPipeline } from '../../services/spectral/portraPipeline';
import { portraResource } from '../../services/spectral/resources/portraResource';
import { STOCK_RESOURCES } from '../../services/spectral/resources/stockResources';
import { srgbByteToLinearProPhoto } from '../../services/spectral/inputColor';
import type { RgbImage, SpectralStages } from '../../services/spectral/types';
import { WebGlSpectralError } from '../../services/spectral/webgl/device';
import { WebGlSpectralRenderer, type GpuFrame } from '../../services/spectral/webgl/renderer';

const STAGES = ['filmRaw', 'negativeDensity', 'paperLogExposure', 'paperDensity', 'printRgb'] as const;
type StageName = typeof STAGES[number];
type Tolerances = Record<StageName, { absolute: number; relative: number; reason: string }>;

// Chosen from FP32 arithmetic and the two spectral accumulators, before observing GPU errors.
// No half-float density or error-dependent threshold relaxation is permitted.
const TOLERANCES: Tolerances = {
  filmRaw: { absolute: 2e-5, relative: 2e-6, reason: 'highp FP32 RGB/XYZ and Mitchell polynomial/log arithmetic; no storage precision loss' },
  negativeDensity: { absolute: 2e-5, relative: 2e-6, reason: 'highp FP32 curve/DIR arithmetic; RGBA32F density storage' },
  paperLogExposure: { absolute: 2e-5, relative: 2e-6, reason: '81 highp spectral transmissions, float receiver table and logarithm' },
  paperDensity: { absolute: 3e-5, relative: 2e-6, reason: 'paper log-exposure error propagated through explicit 256-entry fitted curves' },
  printRgb: { absolute: 3e-5, relative: 2e-6, reason: 'second 81-term integral, FP32 OkLab/OkLch and sRGB encoding; RGBA32F output' },
};

interface Difference {
  maxAbs: number;
  meanAbs: number;
  maxRelative: number;
  violations: number;
  worstIndex: number;
  actual: number;
  expected: number;
  firstActual: number[];
  firstExpected: number[];
  tolerance: { absolute: number; relative: number; reason: string };
  finite: boolean;
  passed: boolean;
}

interface FixtureResult {
  fixture: 'gray-ramp16' | 'green8' | 'srgb-synthetic64';
  width: number;
  height: number;
  stages: Record<StageName, Difference>;
  passed: boolean;
  readback: { calls: number; bytes: number };
  timingsMs: { cpu: number; gpuRender: number; gpuReadback: number };
}

interface BenchmarkRecord {
  width: number;
  height: number;
  format: 'RGBA32F';
  setupMs: number;
  uploadMs: number;
  packInputMs: number;
  filmMs: number;
  paperMs: number;
  scanMs: number;
  firstRenderMs: number;
  outputReadbackMs: number;
  repeatPrintMs: number[];
  repeatPrintStagesMs: { paperMs: number; scanMs: number }[];
  textureBytes: number;
  setupTextureBytes: number;
  frameTextureBytes: number;
  cpuPackedInputBytes: number;
  readbackBytesPerStage: number;
  readbackCalls: number;
  repeatPrintReadbackCalls: number;
  cpuFirstRenderMs: number;
  memoryScope: string;
  outputChecksum: number;
  finite: boolean;
  releasedTextureBytes: number;
}

interface HarnessReport {
  capabilities: unknown;
  tolerances: Tolerances;
  textureLayouts: unknown;
  fixtures: FixtureResult[];
  benchmarks: BenchmarkRecord[];
  lifecycle: unknown;
  failures: string[];
}

declare global {
  interface Window {
    spectralWebGlHarness?: (benchmarkSizes: [number, number][], repeats: number) => Promise<HarnessReport>;
  }
}

function grayRamp(): RgbImage {
  const pixels = new Float32Array(16 * 16 * 3);
  for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) pixels.fill(0.01 + 0.99 * x / 15, (y * 16 + x) * 3, (y * 16 + x + 1) * 3);
  return { width: 16, height: 16, pixels };
}

function green(): RgbImage {
  const pixels = new Float32Array(8 * 8 * 3);
  for (let pixel = 0; pixel < 64; pixel += 1) pixels.set([0.05, 0.4, 0.05], pixel * 3);
  return { width: 8, height: 8, pixels };
}

function syntheticSrgb(pipeline: PortraPipeline): RgbImage {
  const width = 64;
  const height = 64;
  const bytes = new Uint8ClampedArray(width * height * 4);
  // Locally generated ordinary sRGB-like colors, including neutrals, skin-like and saturated samples.
  const palette = [[238, 217, 198], [32, 43, 62], [128, 128, 128], [248, 248, 241], [18, 110, 71], [178, 59, 42], [55, 103, 177], [190, 154, 83]];
  const pixels = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const pixel = y * width + x;
    const base = palette[(Math.floor(x / 8) + Math.floor(y / 8) * 3) % palette.length];
    const factor = 0.45 + 0.55 * (x % 8) / 7;
    for (let channel = 0; channel < 3; channel += 1) bytes[pixel * 4 + channel] = Math.round(base[channel] * factor);
    bytes[pixel * 4 + 3] = 255;
    pixels.set(srgbByteToLinearProPhoto(pipeline.setup, bytes[pixel * 4], bytes[pixel * 4 + 1], bytes[pixel * 4 + 2]), pixel * 3);
  }
  return { width, height, pixels };
}

function compare(actual: Float32Array, expected: Float32Array, tolerance: Tolerances[StageName]): Difference {
  let maxAbs = 0;
  let meanAbs = 0;
  let maxRelative = 0;
  let violations = 0;
  let worstIndex = -1;
  let finite = true;
  for (let index = 0; index < expected.length; index += 1) {
    const difference = Math.abs(actual[index] - expected[index]);
    const allowed = tolerance.absolute + tolerance.relative * Math.abs(expected[index]);
    if (!Number.isFinite(actual[index])) finite = false;
    if (difference > allowed || !Number.isFinite(difference)) violations += 1;
    if (difference >= maxAbs) { maxAbs = difference; worstIndex = index; }
    maxRelative = Math.max(maxRelative, difference / Math.max(Math.abs(expected[index]), 1e-12));
    meanAbs += difference;
  }
  return {
    maxAbs, meanAbs: meanAbs / expected.length, maxRelative, violations, worstIndex,
    actual: worstIndex < 0 ? 0 : actual[worstIndex], expected: worstIndex < 0 ? 0 : expected[worstIndex],
    firstActual: Array.from(actual.slice(0, 3)), firstExpected: Array.from(expected.slice(0, 3)),
    tolerance, finite, passed: finite && violations === 0,
  };
}

function createSynthetic(width: number, height: number): RgbImage {
  const pixels = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 3;
    const u = x / Math.max(width - 1, 1);
    const v = y / Math.max(height - 1, 1);
    pixels[offset] = 0.01 + 0.89 * u;
    pixels[offset + 1] = 0.01 + 0.79 * (0.3 * u + 0.7 * v);
    pixels[offset + 2] = 0.01 + 0.69 * (1 - u) * (0.25 + 0.75 * v);
  }
  return { width, height, pixels };
}

function checkFixture(image: RgbImage, name: FixtureResult['fixture'], renderer: WebGlSpectralRenderer, pipeline: PortraPipeline): FixtureResult {
  const cpuStart = performance.now();
  const cpu: SpectralStages = renderPortraStages(image, pipeline);
  const cpuMs = performance.now() - cpuStart;
  const { frame, timings } = renderer.render(image);
  const differences = {} as Record<StageName, Difference>;
  let readbackMs = 0;
  const readbackBefore = renderer.measurements;
  try {
    for (const stage of STAGES) {
      const start = performance.now();
      const output = renderer.readStage(frame, stage);
      readbackMs += performance.now() - start;
      differences[stage] = compare(output.rgb, cpu[stage], TOLERANCES[stage]);
    }
    const stagesPassed = STAGES.every(stage => differences[stage].passed);
    const readbackAfter = renderer.measurements;
    return {
      fixture: name, width: image.width, height: image.height, stages: differences,
      passed: stagesPassed,
      readback: { calls: readbackAfter.readbackCount - readbackBefore.readbackCount, bytes: readbackAfter.readbackBytes - readbackBefore.readbackBytes },
      timingsMs: { cpu: cpuMs, gpuRender: timings.renderMs, gpuReadback: readbackMs },
    };
  } finally {
    renderer.releaseFrame(frame);
  }
}

function benchmark(renderer: WebGlSpectralRenderer, width: number, height: number, repeats: number, pipeline: PortraPipeline): BenchmarkRecord {
  const image = createSynthetic(width, height);
  const cpuStart = performance.now();
  renderPortraStages(image, pipeline);
  const cpuFirstRenderMs = performance.now() - cpuStart;
  const { frame, timings } = renderer.render(image);
  const repeatPrintMs: number[] = [];
  const repeatPrintStagesMs: { paperMs: number; scanMs: number }[] = [];
  let outputChecksum = 0;
  let finite = true;
  let outputReadbackMs = 0;
  const setupTextureBytes = renderer.info.setupTextureBytes;
  const frameTextureBytes = frame.bytes;
  const textureBytes = renderer.info.textureBytes;
  try {
    const start = performance.now();
    const output = renderer.readStage(frame, 'printRgb');
    outputReadbackMs = performance.now() - start;
    for (let index = 0; index < output.rgb.length; index += 1) {
      if (!Number.isFinite(output.rgb[index])) finite = false;
      outputChecksum = (outputChecksum + output.rgb[index] * (index + 1)) % 1e9;
    }
    const readbackCallsBeforeRepeat = renderer.measurements.readbackCount;
    for (let index = 0; index < repeats; index += 1) {
      const printStart = performance.now();
      const paperMs = renderer.printPaper(frame);
      const scanMs = renderer.scanPrint(frame);
      repeatPrintMs.push(performance.now() - printStart);
      repeatPrintStagesMs.push({ paperMs, scanMs });
    }
    const repeatPrintReadbackCalls = renderer.measurements.readbackCount - readbackCallsBeforeRepeat;
    const readbackCalls = renderer.measurements.readbackCount;
    const packedInputBytes = width * height * 3 * 4;
    return {
      width, height, format: 'RGBA32F', setupMs: 0, uploadMs: timings.uploadMs, packInputMs: timings.packInputMs,
      filmMs: timings.filmMs, paperMs: timings.paperMs, scanMs: timings.scanMs,
      firstRenderMs: timings.renderMs, outputReadbackMs, repeatPrintMs, repeatPrintStagesMs,
      repeatPrintReadbackCalls, cpuFirstRenderMs,
      textureBytes, setupTextureBytes, frameTextureBytes, cpuPackedInputBytes: packedInputBytes,
      readbackBytesPerStage: width * height * 4 * 4, readbackCalls,
      memoryScope: 'Exact logical RGBA texture allocation plus the temporary packed upload; excludes driver alignment, shader/program overhead, browser GC and process RSS. Readback is separate and explicit.',
      outputChecksum, finite, releasedTextureBytes: 0,
    };
  } finally {
    renderer.releaseFrame(frame);
  }
}

async function unsupportedChecks(pipeline: PortraPipeline): Promise<unknown> {
  let noWebGl = false;
  let noFloat = false;
  const canvas = document.createElement('canvas');
  const original = canvas.getContext.bind(canvas);
  canvas.getContext = ((type: string, options?: unknown) => type === 'webgl2' ? null : original(type as '2d', options)) as typeof canvas.getContext;
  try { new WebGlSpectralRenderer(canvas, pipeline); } catch (error) { noWebGl = error instanceof WebGlSpectralError && error.code === 'unsupported'; }
  const floatCanvas = document.createElement('canvas');
  const originalFloat = floatCanvas.getContext.bind(floatCanvas);
  floatCanvas.getContext = ((type: string, options?: unknown) => {
    const context = originalFloat(type as 'webgl2', options);
    if (type === 'webgl2' && context) {
      const gl = context as WebGL2RenderingContext;
      const extension = gl.getExtension.bind(gl);
      gl.getExtension = (name: string) => name === 'EXT_color_buffer_float' ? null : extension(name);
    }
    return context;
  }) as typeof floatCanvas.getContext;
  try { new WebGlSpectralRenderer(floatCanvas, pipeline); } catch (error) { noFloat = error instanceof WebGlSpectralError && error.code === 'unsupported'; }
  return { noWebGl, noFloat, noSilentFallback: true };
}

async function lifecycleChecks(pipeline: PortraPipeline): Promise<unknown> {
  const canvas = document.createElement('canvas');
  canvas.width = 4; canvas.height = 4;
  let lostMessage = '';
  const renderer = new WebGlSpectralRenderer(canvas, pipeline, { onContextLost: message => { lostMessage = message; } });
  const { frame } = renderer.render({ width: 4, height: 4, pixels: new Float32Array(4 * 4 * 3).fill(0.18) });
  const before = renderer.info.textureBytes;
  renderer.releaseFrame(frame);
  const afterRelease = renderer.info.textureBytes;
  const constrained = new WebGlSpectralRenderer(document.createElement('canvas'), pipeline, { maxPixels: 15, maxTextureBytes: 1_500_000 });
  const constrainedBytes = renderer.resources.bytes;
  let budgetRejected = false;
  try {
    constrained.createFrame(grayRamp());
  } catch (error) {
    budgetRejected = error instanceof WebGlSpectralError && error.code === 'invalid-input';
  }
  let textureBudgetRejected = false;
  const textureConstrained = new WebGlSpectralRenderer(document.createElement('canvas'), pipeline, { maxTextureBytes: constrainedBytes + 16 * 16 * 16 * 5 });
  try { textureConstrained.createFrame(grayRamp()); } catch (error) { textureBudgetRejected = error instanceof WebGlSpectralError && error.code === 'allocation'; }
  textureConstrained.dispose();
  constrained.dispose();
  const extension = renderer.device.gl.getExtension('WEBGL_lose_context');
  extension?.loseContext();
  await new Promise(resolve => setTimeout(resolve, 100));
  let lostRejected = false;
  try { renderer.printPaper(frame); } catch (error) { lostRejected = error instanceof WebGlSpectralError && (error.code === 'context-lost' || error.code === 'disposed'); }
  renderer.dispose();
  let disposedRejected = false;
  try { renderer.readStage(frame, 'printRgb'); } catch (error) { disposedRejected = error instanceof WebGlSpectralError && error.code === 'disposed'; }
  return { textureBytesBeforeRelease: before, textureBytesAfterRelease: afterRelease, setupTextureBytes: constrainedBytes, budgetRejected, textureBudgetRejected, contextLossEvent: lostMessage, lostRejected, disposedRejected, lostExtension: Boolean(extension), finalTextureBytes: renderer.info.textureBytes, readbackFormat: renderer.info.readbackFormat, unsupported: await unsupportedChecks(pipeline) };
}

window.spectralWebGlHarness = async (benchmarkSizes, repeats) => {
  const failures: string[] = [];
  const canvas = document.querySelector<HTMLCanvasElement>('#gpu');
  if (!canvas) throw new Error('Missing WebGL harness canvas');
  const setupStart = performance.now();
  const stockKey = new URLSearchParams(location.search).get('stock') as keyof typeof STOCK_RESOURCES | null;
  const pipeline = createPortraPipeline(stockKey ? STOCK_RESOURCES[stockKey] : portraResource);
  const renderer = new WebGlSpectralRenderer(canvas, pipeline);
  const setupMs = performance.now() - setupStart;
  const fixtures: FixtureResult[] = [];
  const benchmarks: BenchmarkRecord[] = [];
  let lifecycle: unknown;
  try {
    for (const [name, image] of [['gray-ramp16', grayRamp()], ['green8', green()], ['srgb-synthetic64', syntheticSrgb(pipeline)]] as const) {
      try {
        const result = checkFixture(image, name, renderer, pipeline);
        fixtures.push(result);
        if (!result.passed) failures.push(`${name}: one or more stages exceeded their declared tolerance`);
      } catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    for (const [width, height] of benchmarkSizes) {
      try {
        const record = benchmark(renderer, width, height, repeats, pipeline);
        record.setupMs = setupMs;
        record.releasedTextureBytes = renderer.info.textureBytes;
        if (!record.finite) failures.push(`${width}x${height}: non-finite output`);
        benchmarks.push(record);
      } catch (error) { failures.push(`${width}x${height}: ${error instanceof Error ? error.message : String(error)}`); }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    try {
      lifecycle = await lifecycleChecks(pipeline);
    } catch (error) {
      lifecycle = { error: error instanceof Error ? error.message : String(error) };
      failures.push(`lifecycle: ${error instanceof Error ? error.message : String(error)}`);
    }
  } finally {
    renderer.dispose();
  }
  const report: HarnessReport = {
    capabilities: renderer.info.capabilities, tolerances: TOLERANCES,
    textureLayouts: renderer.info.textureLayouts, fixtures, benchmarks, lifecycle, failures,
  };
  const status = document.querySelector('#status');
  if (status) status.textContent = JSON.stringify(report, null, 2);
  return report;
};
