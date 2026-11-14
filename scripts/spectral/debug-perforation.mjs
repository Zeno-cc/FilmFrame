import { createPhysicalStripPlan, physicalStripFramePlan } from '../../services/physical135/strip.ts';
import { createPhysicalRaster } from '../../services/physical135/canvas.ts';
import { FilmType } from '../../types.ts';
const settings = { brandText: FilmType.KODAK_PORTRA_400, imagingMode: 'spectral', edgeRenderMode: 'physical135', physicalBodySeed: 1, physicalFrameSeed: 1, physicalFog: 1, physicalLeaks: 0, physicalBacking: 'open', processingMode: 'preview' };
const strip = createPhysicalStripPlan(settings, 2);
const firstPlan = { ...physicalStripFramePlan(strip, 0, {}, settings), outputWidth: physicalStripFramePlan(strip, 0, {}, settings).outputWidth + 1 };
const secondPlan = physicalStripFramePlan(strip, 1, {}, settings);
console.log('centers', firstPlan.perforations.map(h => h.center), secondPlan.perforations.map(h => h.center));
const first = createPhysicalRaster(firstPlan), second = createPhysicalRaster(secondPlan);
const y = 46;
for (const [name, plan, raster, x] of [['first', firstPlan, first, firstPlan.outputWidth - 1], ['second', secondPlan, second, 0]]) {
  console.log(name, { x, y, wall: raster.wall.slice((y * raster.width + x) * 3, (y * raster.width + x) * 3 + 3), presence: raster.presence[y * raster.width + x], origin: plan.advanceOriginS, holes: plan.perforations.filter(h => Math.abs(h.center.s - (x + .5) / plan.pxPerMm) < 2 && Math.abs(h.center.t - (y + .5) / plan.pxPerMm) < 2) });
}
