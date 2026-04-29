import {
  getNextPreviewImageId,
  getPreviewImageIndex,
  getSinglePreviewSource,
} from '../services/previewNavigation';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const images = [
  { id: 'a', previewUrl: 'preview-a' },
  { id: 'b', previewUrl: 'preview-b', processedUrl: 'processed-b' },
  { id: 'c', previewUrl: 'preview-c' },
];

assert(getPreviewImageIndex(images, 'b') === 1, 'should find the preview image index by id');
assert(getPreviewImageIndex(images, 'missing') === -1, 'should return -1 for missing preview image ids');
assert(getNextPreviewImageId(images, 'a', 'next') === 'b', 'next should advance by current order');
assert(getNextPreviewImageId(images, 'a', 'previous') === 'c', 'previous should wrap from first to last');
assert(getNextPreviewImageId(images, 'c', 'next') === 'a', 'next should wrap from last to first');
assert(getNextPreviewImageId([], 'a', 'next') === null, 'empty image lists should not navigate');
assert(getNextPreviewImageId(images, 'missing', 'next') === 'a', 'missing current image should recover to first image');
assert(getSinglePreviewSource(images[0]) === 'preview-a', 'unprocessed images should preview the original image');
assert(getSinglePreviewSource(images[1]) === 'processed-b', 'processed images should preview the rendered result');
