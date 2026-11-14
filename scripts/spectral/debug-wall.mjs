import { createPhysicalStripPlan, physicalStripFramePlan } from '../../services/physical135/strip.ts';
import { createPhysicalRaster } from '../../services/physical135/canvas.ts';
import { FilmType } from '../../types.ts';
const settings = { brandText: FilmType.KODAK_PORTRA_400, imagingMode: 'spectral', edgeRenderMode: 'physical135', physicalBodySeed: 1, physicalFrameSeed: 1, physicalFog: 1, physicalLeaks: 0, physicalBacking: 'open', processingMode: 'preview' };
const strip = createPhysicalStripPlan(settings, 2);
const base = physicalStripFramePlan(strip, 0, {}, settings);
const variants = [
  ['base', base],
  ['origin', { ...base, advanceOriginS: 38 }],
  ['second', physicalStripFramePlan(strip, 1, {}, settings)],
  ['extra', { ...base, outputWidth: base.outputWidth + 1 }],
];
for (const [name, plan] of variants) {
 const raster = createPhysicalRaster(plan);
 for (const x of [0, 949, 950]) {
  const y = 46;
  console.log(name, { x, y, wall: [...raster.wall.slice((y * raster.width + x) * 3, (y * raster.width + x) * 3 + 3)], presence: raster.presence[y * raster.width + x] });
 }
}
