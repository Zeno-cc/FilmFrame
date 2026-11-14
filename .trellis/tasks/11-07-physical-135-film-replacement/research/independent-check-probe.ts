import assert from 'node:assert/strict';
import { FilmType } from '../../../../types';
import { createPhysicalRaster } from '../../../../services/physical135/canvas';
import { canvasToFilm, filmToRollPoint } from '../../../../services/physical135/plan';
import { createPhysicalStripPlan, physicalStripFramePlan } from '../../../../services/physical135/strip';
import { physicalEdgeExposureAtPoint } from '../../../../services/physical135/spectralAdapter';
import { STOCK_RESOURCES } from '../../../../services/spectral/resources/stockResources';
import { solveBaseCancelingHoleDensity } from '../../../../services/physical135/density';

const settings = {
  brandText: FilmType.KODAK_GOLD_200,
  frameNumber: 1,
  frameRenderMode: 'real135' as const,
  imagingMode: 'spectral' as const,
  edgeRenderMode: 'physical135' as const,
  processingMode: 'preview' as const,
  physicalBodySeed: 1,
  physicalFrameSeed: 1,
  physicalFog: 1,
  physicalLeaks: 1,
  physicalStraighten: 1.5,
};
const strip = createPhysicalStripPlan(settings, 2);
const first = physicalStripFramePlan(strip, 0, { physicalFrameSeed: 1 }, settings);
const second = physicalStripFramePlan(strip, 1, { physicalFrameSeed: 1 }, settings);
const extended = { ...first, outputWidth: first.outputWidth + 1 };
const left = createPhysicalRaster(extended);
const right = createPhysicalRaster(second);
const leftPixel = { x: left.width - 1, y: Math.floor(left.height / 2) };
const rightPixel = { x: 0, y: leftPixel.y };
const leftLocal = canvasToFilm(extended, (leftPixel.x + 0.5) / extended.pxPerMm, (leftPixel.y + 0.5) / extended.pxPerMm);
const rightLocal = canvasToFilm(second, (rightPixel.x + 0.5) / second.pxPerMm, (rightPixel.y + 0.5) / second.pxPerMm);
const leftRoll = filmToRollPoint(extended, leftLocal);
const rightRoll = filmToRollPoint(second, rightLocal);
const coordinateResidual = { s: rightRoll.s - leftRoll.s, t: rightRoll.t - leftRoll.t };
const l = leftPixel.y * left.width + leftPixel.x;
const r = rightPixel.y * right.width + rightPixel.x;
const fields = ['presence', 'backing', 'filmBase', 'wall'] as const;
const differences = Object.fromEntries(fields.map(field => {
  const channels = field === 'presence' ? 1 : 3;
  return [field, Array.from({ length: channels }, (_, channel) => right[field][r * channels + channel] - left[field][l * channels + channel])];
}));
const leftExposure = physicalEdgeExposureAtPoint(extended, leftLocal.s, leftLocal.t);
const rightExposure = physicalEdgeExposureAtPoint(second, rightLocal.s, rightLocal.t);
const result = { sameSeed: 1, leftPixel, rightPixel, leftRoll, rightRoll, coordinateResidual, differences, exposureDifference: { fog: rightExposure.fog - leftExposure.fog, leak: rightExposure.leak - leftExposure.leak } };
console.log(JSON.stringify(result, null, 2));
assert.ok(Math.abs(coordinateResidual.s) < 0.00001);
assert.ok(Math.abs(coordinateResidual.t) < 0.001);
for (const values of Object.values(differences)) for (const value of values) assert.ok(Math.abs(value) < 0.0001);
assert.ok(Math.abs(rightExposure.fog - leftExposure.fog) < 0.0001);
assert.ok(Math.abs(rightExposure.leak - leftExposure.leak) < 0.0001);
const pro = solveBaseCancelingHoleDensity(
  STOCK_RESOURCES.fujiPro400h.arrays.filmChannelDensity.values,
  STOCK_RESOURCES.fujiPro400h.arrays.filmBaseDensity.values,
  STOCK_RESOURCES.fujiPro400h.arrays.filmSpectralValidMask.values,
);
console.log(JSON.stringify({ pro400hResidual: pro.maxBaseResidual }));
assert.ok(pro.maxBaseResidual >= 0.5);
