// Captures physical-135 raster digests so the UI-only change can be proven to
// leave rendering untouched. Run with vite-node from the repo root.
import { createHash } from 'node:crypto';
import { createPhysicalStripPlan, physicalStripFramePlan } from '../../../../services/physical135/strip.ts';
import { createPhysicalRaster } from '../../../../services/physical135/canvas.ts';

const base = {
  brandText: 'KODAK GOLD 200',
  frameNumber: 1,
  frameRenderMode: 'real135',
  imagingMode: 'spectral',
  edgeRenderMode: 'physical135',
  processingMode: 'preview',
  physicalFog: 1,
  physicalLeaks: 1,
  physicalBacking: 'open',
} as const;

function digest(values: Float32Array): string {
  return createHash('sha256').update(Buffer.from(values.buffer, values.byteOffset, values.byteLength)).digest('hex').slice(0, 16);
}

const results: Record<string, unknown> = {};
for (const straighten of [0, 1.5]) {
  const settings = { ...base, physicalStraighten: straighten };
  const strip = createPhysicalStripPlan(settings, 3);
  for (const index of [0, 1, 2]) {
    // No per-photo seed: this is the state after the controls are removed.
    const plan = physicalStripFramePlan(strip, index, {}, settings);
    const raster = createPhysicalRaster(plan);
    results[`strip-s${straighten}-i${index}`] = {
      frameSeed: plan.frameSeed,
      size: [raster.width, raster.height],
      presence: digest(raster.presence),
      backing: digest(raster.backing),
      filmBase: digest(raster.filmBase),
      wall: digest(raster.wall),
    };
  }
}
console.log(JSON.stringify(results, null, 2));
