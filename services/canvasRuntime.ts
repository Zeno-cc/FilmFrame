import type { RenderTransform } from '../types';
import { assertCanvasBudget, type RenderBudgetLimits } from './renderBudget';
import { getAutoQuarterTurns, normalizeRenderTransform } from './renderTransform';

const ROTATION_EPSILON = 0.0001;
const OPAQUE_ROTATION_BACKGROUND = '#e8e3d8';

export function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = src;
  });
}

export type CanvasObjectUrlResult = {
  url: string;
  byteSize: number;
};

export function exportCanvasToObjectUrl(
  canvas: HTMLCanvasElement,
  outputFormat: string,
  outputQuality: number,
  errorMessage = 'Failed to export canvas blob',
): Promise<CanvasObjectUrlResult> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(errorMessage));
          return;
        }
        resolve({
          url: URL.createObjectURL(blob),
          byteSize: blob.size,
        });
      },
      outputFormat,
      outputQuality,
    );
  });
}

export function rotateCanvas(
  canvas: HTMLCanvasElement,
  radians: number,
  limits: RenderBudgetLimits = {},
): HTMLCanvasElement {
  if (radians === 0) return canvas;

  const isQuarterTurn = Math.abs(Math.abs(radians) - Math.PI / 2) < ROTATION_EPSILON;
  const width = isQuarterTurn ? canvas.height : canvas.width;
  const height = isQuarterTurn ? canvas.width : canvas.height;
  assertCanvasBudget(width, height, limits);
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;

  const context = output.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas context not found');

  context.fillStyle = OPAQUE_ROTATION_BACKGROUND;
  context.fillRect(0, 0, output.width, output.height);
  context.translate(output.width / 2, output.height / 2);
  context.rotate(radians);
  context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return output;
}

export function restoreOutputOrientationForSource(
  canvas: HTMLCanvasElement,
  image: Pick<HTMLImageElement, 'width' | 'height'>,
  frameWidth: number,
  frameHeight: number,
  transform?: RenderTransform,
  limits: RenderBudgetLimits = {},
): HTMLCanvasElement {
  const normalized = normalizeRenderTransform(transform);
  const autoQuarterTurns = getAutoQuarterTurns(
    image.width,
    image.height,
    frameWidth,
    frameHeight,
    normalized.quarterTurns,
  );
  return rotateCanvas(canvas, -autoQuarterTurns * Math.PI / 2, limits);
}

export function createLuminanceAlphaMask(
  mask: CanvasImageSource,
  width: number,
  height: number,
  limits: RenderBudgetLimits = {},
): HTMLCanvasElement {
  assertCanvasBudget(width, height, limits);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context not found');

  context.drawImage(mask, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = Math.round(
      data[index] * 0.2126
      + data[index + 1] * 0.7152
      + data[index + 2] * 0.0722,
    );
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = alpha;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}
