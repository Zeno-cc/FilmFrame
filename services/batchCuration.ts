export interface CurationItem {
  id: string;
  included?: boolean;
}

/**
 * Older in-memory items predate explicit curation state. Treat them as included
 * so an existing roll keeps its original all-included behavior.
 */
export function isImageIncluded(item: CurationItem): boolean {
  return item.included !== false;
}

export function getIncludedImages<T extends CurationItem>(items: readonly T[]): T[] {
  return items.filter(isImageIncluded);
}

export function getIncludedStripImages<T extends CurationItem>(
  items: readonly T[],
): Array<T & { rollIndex: number }> {
  return items.flatMap((item, rollIndex) => isImageIncluded(item)
    ? [{ ...item, rollIndex }]
    : []);
}

export function getIncludedImageCount(items: readonly CurationItem[]): number {
  return items.reduce((count, item) => count + Number(isImageIncluded(item)), 0);
}

export function setImageIncluded<T extends CurationItem>(
  items: readonly T[],
  imageId: string,
  included: boolean,
): T[] {
  const index = items.findIndex(item => item.id === imageId);
  if (index === -1 || isImageIncluded(items[index]) === included) return items as T[];

  const nextItems = [...items];
  nextItems[index] = { ...items[index], included };
  return nextItems;
}

export function toggleImageIncluded<T extends CurationItem>(items: readonly T[], imageId: string): T[] {
  const item = items.find(candidate => candidate.id === imageId);
  return item ? setImageIncluded(items, imageId, !isImageIncluded(item)) : items as T[];
}

export function setAllImagesIncluded<T extends CurationItem>(items: readonly T[], included: boolean): T[] {
  let changed = false;
  const nextItems = items.map(item => {
    if (isImageIncluded(item) === included) return item;
    changed = true;
    return { ...item, included };
  });

  return changed ? nextItems : items as T[];
}
