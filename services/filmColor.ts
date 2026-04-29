export function applyGold200Look(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r = r * 1.045 + 3;
    g = g * 1.015 + 1;
    b = b * 0.965;

    r = softContrast(r, 1.045);
    g = softContrast(g, 1.035);
    b = softContrast(b, 1.025);

    data[i] = clamp(compressHighlights(r));
    data[i + 1] = clamp(compressHighlights(g));
    data[i + 2] = clamp(compressHighlights(b));
  }

  ctx.putImageData(imageData, x, y);
}

function softContrast(value: number, amount: number) {
  const normalized = value / 255;
  return (0.5 + (normalized - 0.5) * amount) * 255;
}

function compressHighlights(value: number) {
  const normalized = value / 255;
  return (normalized > 0.72 ? 0.72 + (normalized - 0.72) * 0.82 : normalized) * 255;
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, value));
}
