import { resolve } from 'node:path';
import { STOCK_RESOURCES } from '../../services/spectral/resources/stockResources.ts';
import { createPortraPipeline, renderPortraStages } from '../../services/spectral/portraPipeline.ts';
import { readLittleEndianFloat64Npy } from '../../tests/spectralNpy.ts';

const stageNames = ['filmRaw', 'negativeDensity', 'paperLogExposure', 'paperDensity', 'printRgb'];
const tolerance = {
  filmRaw: [1e-6, 1.5e-3],
  negativeDensity: [1e-6, 1.5e-3],
  paperLogExposure: [1e-4, 0],
  paperDensity: [1e-6, 1.5e-3],
  printRgb: [1e-6, 1.5e-3],
};

function grayRamp16() {
  const pixels = new Float32Array(16 * 16 * 3);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const value = 0.01 + x * 0.99 / 15;
      pixels.fill(value, (y * 16 + x) * 3, (y * 16 + x + 1) * 3);
    }
  }
  return { width: 16, height: 16, pixels };
}

function greenPatch8() {
  const pixels = new Float32Array(8 * 8 * 3);
  for (let pixel = 0; pixel < 64; pixel += 1) pixels.set([0.05, 0.4, 0.05], pixel * 3);
  return { width: 8, height: 8, pixels };
}

for (const [id, resource] of Object.entries({
  kodak_portra_160: STOCK_RESOURCES.portra160,
  kodak_portra_800: STOCK_RESOURCES.portra800,
  kodak_portra_800_push1: STOCK_RESOURCES.portra800Push1,
  kodak_portra_800_push2: STOCK_RESOURCES.portra800Push2,
  kodak_gold_200: STOCK_RESOURCES.gold200,
  kodak_ektar_100: STOCK_RESOURCES.ektar100,
  kodak_ultramax_400: STOCK_RESOURCES.ultramax400,
  fujifilm_c200: STOCK_RESOURCES.fujiC200,
  fujifilm_xtra_400: STOCK_RESOURCES.fujiXtra400,
  fujifilm_pro_400h: STOCK_RESOURCES.fujiPro400h,
  kodak_vision3_50d: STOCK_RESOURCES.vision50d,
  kodak_vision3_200t: STOCK_RESOURCES.vision200t,
  kodak_vision3_250d: STOCK_RESOURCES.vision250d,
  kodak_vision3_500t: STOCK_RESOURCES.vision500t,
})) {
  const pipeline = createPortraPipeline(resource);
  for (const [recipe, input] of [['gray_ramp_16', grayRamp16()], ['green_patch_8', greenPatch8()]]) {
    const result = renderPortraStages(input, pipeline);
    for (const stage of stageNames) {
      const expected = readLittleEndianFloat64Npy(resolve(`tests/fixtures/spectral/${id}-${recipe}-${stage}.npy`)).values;
      let maxAbs = 0;
      let violations = 0;
      for (let index = 0; index < expected.length; index += 1) {
        const difference = Math.abs(expected[index] - result[stage][index]);
        maxAbs = Math.max(maxAbs, difference);
        if (difference > tolerance[stage][0] + tolerance[stage][1] * Math.abs(expected[index])) violations += 1;
      }
      console.log(JSON.stringify({ stock: id, recipe, stage, maxAbs, violations }));
      if (violations > 0) throw new Error(`${id} ${recipe} ${stage}: ${violations} values exceed the reference tolerance`);
    }
  }
}
