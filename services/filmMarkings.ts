import { FilmSettings, FILM_PRESETS } from '../types';
import { getFrameNumberColor } from './filmFrameNumber';
import { Film135SideLayout } from './filmGeometry';

export function draw135SideMarkings(
  ctx: CanvasRenderingContext2D,
  layout: Film135SideLayout,
  settings: FilmSettings
) {
  const preset = FILM_PRESETS[settings.brandText] || FILM_PRESETS['KODAK GOLD 200'];
  const brandText = settings.customText.trim() !== '' ? settings.customText : settings.brandText;
  const color = settings.textColor || preset.brandColor;
  const fontSize = Math.max(22, Math.round(layout.sideRailW * 0.24));

  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.font = `${preset.fontWeight} ${fontSize}px ${preset.fontFamily}`;

  // Real negative scans read the film stock along the side rebate, not across the top.
  ctx.save();
  ctx.translate(Math.round(layout.sideRailW * 0.34), Math.round(layout.filmH * 0.18));
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'right';
  ctx.fillText(brandText, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(Math.round(layout.sideRailW * 0.34), Math.round(layout.filmH * 0.74));
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'right';
  ctx.fillText('200-8', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(Math.round(layout.filmW - layout.sideRailW * 0.28), Math.round(layout.filmH * 0.5));
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.font = `${preset.fontWeight} ${Math.round(fontSize * 0.72)}px ${preset.fontFamily}`;
  ctx.fillStyle = getFrameNumberColor(settings, color);
  ctx.fillText(`${settings.frameNumber}A`, 0, 0);
  ctx.restore();

  drawSideDxBlocks(ctx, layout, color);
  ctx.restore();
}

function drawSideDxBlocks(ctx: CanvasRenderingContext2D, layout: Film135SideLayout, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;

  const blockH = Math.max(6, Math.round(layout.pxPerMm * 0.32));
  const gap = Math.max(5, Math.round(layout.pxPerMm * 0.22));
  const shortW = Math.round(layout.sideRailW * 0.34);
  const longW = Math.round(layout.sideRailW * 0.62);
  const x = Math.round(layout.filmW - layout.sideRailW * 0.82);
  const pattern = [0.5, 1, 0.5, 0.75, 1, 0.55, 0.9, 0.45, 1, 0.7, 0.5, 1, 0.5];

  let y = Math.round(layout.verticalRebateH + layout.imageH * 0.08);
  for (const factor of pattern) {
    ctx.fillRect(x, y, Math.round(shortW + (longW - shortW) * factor), blockH);
    y += blockH + gap;
  }

  ctx.fillRect(x, Math.round(layout.filmH - layout.verticalRebateH - layout.imageH * 0.12), longW, blockH);
  ctx.restore();
}
