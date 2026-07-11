import type { ImageItem } from '../types';

type PreviewImage = Pick<ImageItem, 'id'>;
export type PreviewDirection = 'previous' | 'next';

export function getPreviewImageIndex(images: PreviewImage[], imageId: string): number {
  return images.findIndex(img => img.id === imageId);
}

export function getNextPreviewImageId(
  images: PreviewImage[],
  imageId: string,
  direction: PreviewDirection
): string | null {
  if (images.length === 0) return null;

  const currentIndex = getPreviewImageIndex(images, imageId);
  if (currentIndex === -1) return images[0].id;

  const offset = direction === 'next' ? 1 : -1;
  const nextIndex = (currentIndex + offset + images.length) % images.length;
  return images[nextIndex].id;
}
