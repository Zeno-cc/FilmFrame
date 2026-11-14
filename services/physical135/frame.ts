import type { PhysicalFilmPlan, PhysicalPlanInput } from './plan';
import { createPhysicalFilmPlan, FULL_FRAME_135 } from './plan';

export function physicalPlanForSettings(
  settings: PhysicalPlanInput['settings'],
  orientation: PhysicalPlanInput['orientation'],
  gateWidth: number,
  pxPerMm: number,
): PhysicalFilmPlan {
  return createPhysicalFilmPlan({
    settings,
    orientation,
    gateWidth: FULL_FRAME_135.gateWidthMm,
    gateHeight: FULL_FRAME_135.gateHeightMm,
    pxPerMm: pxPerMm * gateWidth / FULL_FRAME_135.gateWidthMm,
  });
}
