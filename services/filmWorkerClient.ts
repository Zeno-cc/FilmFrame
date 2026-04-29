import type { FilmSettings, ImageItem } from '../types';
import * as mainThreadEngine from './filmEngine';

type WorkerRenderer = {
  processImage?: (
    fileOrSource: File | string,
    settings: FilmSettings,
    dateOverride?: string,
    previewUrlFallback?: string
  ) => Promise<string>;
  generateFilmStrip?: (images: ImageItem[], settings: FilmSettings) => Promise<string>;
};

const hasWorkerCapabilities = (): boolean => {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
  );
};

const createWorkerRenderer = (): WorkerRenderer | null => {
  if (!hasWorkerCapabilities()) return null;

  // No worker module is wired yet. Keeping this as the single plug-in point
  // lets a later filmWorker.ts implementation land without changing callers.
  return null;
};

const workerRenderer = createWorkerRenderer();

const withImageSourceUrl = async <T>(
  fileOrSource: File | string,
  previewUrlFallback: string | undefined,
  run: (sourceUrl: string) => Promise<T>
): Promise<T> => {
  if (typeof fileOrSource === 'string') {
    return run(fileOrSource);
  }

  if (previewUrlFallback) {
    return run(previewUrlFallback);
  }

  const objectUrl = URL.createObjectURL(fileOrSource);
  try {
    return await run(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const processImage = async (
  fileOrSource: File | string,
  settings: FilmSettings,
  dateOverride?: string,
  previewUrlFallback?: string
): Promise<string> => {
  if (workerRenderer?.processImage) {
    try {
      return await workerRenderer.processImage(fileOrSource, settings, dateOverride, previewUrlFallback);
    } catch (error) {
      console.warn('Worker image processing failed; falling back to main thread.', error);
    }
  }

  return withImageSourceUrl(fileOrSource, previewUrlFallback, (sourceUrl) =>
    mainThreadEngine.processImage(sourceUrl, settings, dateOverride)
  );
};

export const generateFilmStrip = async (
  images: ImageItem[],
  settings: FilmSettings
): Promise<string> => {
  if (workerRenderer?.generateFilmStrip) {
    try {
      return await workerRenderer.generateFilmStrip(images, settings);
    } catch (error) {
      console.warn('Worker film strip generation failed; falling back to main thread.', error);
    }
  }

  return mainThreadEngine.generateFilmStrip(images, settings);
};
