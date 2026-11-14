import type { FilmSettings } from '../types';
import type { KodakGoldOverlayLayout } from './filmOverlay';
import { getFrameNumberColor } from './filmFrameNumber';

type CompatibilityContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A generic 135 edge, not a measured or branded stock scan. */
export function paintCompatibility135Frame(
  ctx: CompatibilityContext,
  layout: KodakGoldOverlayLayout,
  settings: FilmSettings,
): void {
  ctx.save();
  ctx.fillStyle = '#261c14';
  ctx.fillRect(0, 0, layout.filmW, layout.filmH);

  const holeWidth = layout.filmW * 0.044;
  const holeHeight = layout.topRebateH * 0.42;
  const pitch = layout.filmW / 8;
  for (let index = 0; index < 8; index += 1) {
    const x = (index + 0.5) * pitch - holeWidth / 2;
    for (const y of [layout.topRebateH * 0.47, layout.bottomRebateY + layout.bottomRebateH * 0.28]) {
      ctx.beginPath();
      ctx.roundRect(x, y, holeWidth, holeHeight, holeHeight * 0.2);
      ctx.fillStyle = settings.real135SprocketColor ?? '#050403';
      ctx.fill();
    }
  }

  const textColor = '#b9a68b';
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(layout.filmH * 0.017)}px Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(settings.brandText, layout.imageX, layout.topRebateH * 0.2);
  ctx.textAlign = 'right';
  ctx.fillText('135 · COMPATIBILITY', layout.imageX + layout.imageW, layout.bottomRebateY + layout.bottomRebateH * 0.82);
  ctx.textAlign = 'center';
  ctx.fillStyle = getFrameNumberColor(settings, textColor);
  ctx.font = `600 ${Math.round(layout.filmH * 0.024)}px monospace`;
  ctx.fillText(String(settings.frameNumber), layout.imageX + layout.imageW / 2, layout.topRebateH * 0.2);
  ctx.restore();
}
