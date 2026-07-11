export type BatchGeneration = string | number;

export interface RenderableImageItem {
  id: string;
  processedUrl?: string;
  processedMime?: string;
  processedSettingsKey?: string;
  processingError?: string;
}

export interface ImageRenderResult {
  processedUrl: string;
  processedMime: string;
  processedSettingsKey: string;
  processingError?: string;
}

export interface GenerationGate {
  result: BatchGeneration;
  current: BatchGeneration;
}

export interface ImageRenderAcceptance<T> {
  items: T[];
  accepted: boolean;
  replacedUrl?: string;
}

export function isGenerationCurrent(
  resultGeneration: BatchGeneration,
  currentGeneration: BatchGeneration,
): boolean {
  return resultGeneration === currentGeneration;
}

export function acceptImageRenderResult<T extends RenderableImageItem>(
  currentItems: readonly T[],
  imageId: string,
  result: ImageRenderResult,
  generation?: GenerationGate,
): ImageRenderAcceptance<T> {
  if (generation && !isGenerationCurrent(generation.result, generation.current)) {
    return { items: currentItems as T[], accepted: false };
  }

  const index = currentItems.findIndex(item => item.id === imageId);
  if (index === -1) {
    return { items: currentItems as T[], accepted: false };
  }

  const currentItem = currentItems[index];
  const items = [...currentItems];
  items[index] = { ...currentItem, ...result };

  return {
    items,
    accepted: true,
    replacedUrl:
      currentItem.processedUrl && currentItem.processedUrl !== result.processedUrl
        ? currentItem.processedUrl
        : undefined,
  };
}
