import { FilmSettings, FILM_PRESETS } from '../types';
import { getFrameNumberColor } from './filmFrameNumber';
import { Film135Layout, Film135SideLayout } from './filmGeometry';

export function draw135Markings(
  ctx: CanvasRenderingContext2D,
  layout: Film135Layout,
  settings: FilmSettings,
  dateOverride?: string
) {
  const preset = FILM_PRESETS[settings.brandText] || FILM_PRESETS['KODAK GOLD 200'];
  const brandText = settings.customText.trim() !== '' ? settings.customText : settings.brandText;
  const dateStr = dateOverride || settings.dateStr;
  const frameLabel = `${settings.frameNumber}A`;

  ctx.save();

  const fontSize = Math.max(18, Math.round(layout.topRebateH * 0.28));
  ctx.font = `${preset.fontWeight} ${fontSize}px ${preset.fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = settings.textColor || preset.brandColor;

  const padX = Math.round(layout.imageX + layout.imageW * 0.02);
  const rightX = Math.round(layout.imageX + layout.imageW - layout.imageW * 0.02);
  const topTextY = Math.round(layout.topRebateH * 0.3);
  const bottomTextY = Math.round(layout.bottomRebateY + layout.bottomRebateH * 0.72);

  ctx.textAlign = 'left';
  ctx.fillText(brandText, padX, topTextY);

  ctx.textAlign = 'right';
  ctx.save();
  ctx.fillStyle = getFrameNumberColor(settings, settings.textColor || preset.brandColor);
  ctx.fillText(frameLabel, rightX, topTextY);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.font = `normal ${Math.round(fontSize * 0.72)}px ${preset.fontFamily}`;
  ctx.fillText('SAFETY FILM', padX, bottomTextY);

  if (settings.showDate) {
    ctx.textAlign = 'right';
    ctx.fillText(dateStr, rightX, bottomTextY);
  }

  drawDxLikeBlocks(ctx, layout, settings);
  ctx.restore();
}

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

function drawDxLikeBlocks(
  ctx: CanvasRenderingContext2D,
  layout: Film135Layout,
  settings: FilmSettings
) {
  ctx.save();
  ctx.fillStyle = settings.textColor || '#eab308';

  const blockW = Math.max(3, Math.round(layout.pxPerMm * 0.35));
  const gap = Math.max(2, Math.round(layout.pxPerMm * 0.22));
  const maxH = Math.round(layout.bottomRebateH * 0.45);
  const startX = Math.round(layout.filmW - layout.imageX - layout.imageW * 0.18);
  const y = Math.round(layout.bottomRebateY + layout.bottomRebateH * 0.18);
  const pattern = [1, 3, 2, 4, 1, 5, 2, 3, 1, 4, 2, 5, 1, 3];

  let x = startX;
  for (const p of pattern) {
    const h = Math.round(maxH * (0.35 + p * 0.12));
    ctx.globalAlpha = 0.75 + Math.random() * 0.2;
    ctx.fillRect(x, y + (maxH - h), blockW, h);
    x += blockW + gap;
  }

  ctx.restore();
}
