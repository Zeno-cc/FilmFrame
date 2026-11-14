import { createPortraPipeline, renderPortraStages } from '../../services/spectral/portraPipeline';
import { portraResource } from '../../services/spectral/resources/portraResource';

interface BrowserCheck {
  gray: {
    filmRawMaxAbs: number;
    negativeDensityMaxAbs: number;
    printRgbMaxAbs: number;
    printRgbMeanAbs: number;
    violations: number;
  };
  green: { maxAbs: number; meanAbs: number; violations: number };
  renderMs: number;
  finite: boolean;
}

declare global {
  interface Window {
    spectralCrossBrowserCheck?: () => BrowserCheck;
  }
}

function ramp(): { width: number; height: number; pixels: Float32Array } {
  const pixels = new Float32Array(256 * 3);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const value = 0.01 + 0.99 * x / 15;
      pixels.fill(value, (y * 16 + x) * 3, (y * 16 + x + 1) * 3);
    }
  }
  return { width: 16, height: 16, pixels };
}

function green(): { width: number; height: number; pixels: Float32Array } {
  const pixels = new Float32Array(64 * 3);
  for (let pixel = 0; pixel < 64; pixel += 1) pixels.set([0.05, 0.4, 0.05], pixel * 3);
  return { width: 8, height: 8, pixels };
}

function compare(actual: Float32Array, expected: number[]) {
  let maxAbs = 0;
  let sum = 0;
  let violations = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const difference = Math.abs(actual[index] - expected[index]);
    maxAbs = Math.max(maxAbs, difference);
    sum += difference;
    if (difference > 1e-6 + 1.5e-3 * Math.abs(expected[index])) violations += 1;
  }
  return { maxAbs, meanAbs: sum / expected.length, violations };
}

window.spectralCrossBrowserCheck = () => {
  const pipeline = createPortraPipeline(portraResource);
  const start = performance.now();
  const gray = renderPortraStages(ramp(), pipeline);
  const greenResult = renderPortraStages(green(), pipeline);
  const expectedFilmRaw = [-1.2593848487582309, -1.2694172549415974, -1.3021170737788434];
  const expectedNegative = [0.06804511351678183, 0.0964357700979269, 0.12823734544008936];
  const expectedPrint = [0.8161286588489114, 0.8201999149632995, 0.8192007371817952];
  const expectedGreen = [0.0507525205836215, 0.4673216141945819, 0.1754605268242167];
  return {
    gray: {
      filmRawMaxAbs: compare(gray.filmRaw.slice(0, 3), expectedFilmRaw).maxAbs,
      negativeDensityMaxAbs: compare(gray.negativeDensity.slice(0, 3), expectedNegative).maxAbs,
      printRgbMaxAbs: compare(gray.printRgb.slice(-3), expectedPrint).maxAbs,
      printRgbMeanAbs: compare(gray.printRgb.slice(-3), expectedPrint).meanAbs,
      violations: compare(gray.printRgb.slice(-3), expectedPrint).violations,
    },
    green: compare(greenResult.printRgb.slice(0, 3), expectedGreen),
    renderMs: performance.now() - start,
    finite: [...gray.filmRaw, ...gray.negativeDensity, ...gray.paperLogExposure, ...gray.paperDensity, ...gray.printRgb].every(Number.isFinite),
  };
};
