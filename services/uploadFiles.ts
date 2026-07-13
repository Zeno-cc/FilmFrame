import type { ImageItem } from '../types';

export const LARGE_FILE_BYTES = 25 * 1024 * 1024;
export const LARGE_IMAGE_EDGE = 8000;
export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type UploadFile = Pick<File, 'name' | 'size' | 'type'>;

type PrepareUploadDeps<TFile extends UploadFile> = {
  createId: (file: TFile) => string;
  createObjectUrl: (file: TFile) => string;
  revokeObjectUrl: (url: string) => void;
  readImageSize: (url: string) => Promise<{ width: number; height: number }>;
  readExifDate: (file: TFile) => Promise<string>;
};

export type PreparedUpload<TFile extends UploadFile = File> = {
  images: Array<Pick<ImageItem, 'id' | 'previewUrl' | 'exifDate' | 'included' | 'sourceWidth' | 'sourceHeight'> & { file: TFile }>;
  errors: string[];
  warnings: string[];
};

export async function prepareUploadedImages<TFile extends UploadFile>(
  files: Iterable<TFile>,
  deps: PrepareUploadDeps<TFile>
): Promise<PreparedUpload<TFile>> {
  const images: PreparedUpload<TFile>['images'] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    if (!SUPPORTED_IMAGE_MIME_TYPES.has(file.type)) {
      errors.push(`"${file.name}" 不是支持的图片格式（仅支持 JPEG、PNG、WebP）`);
      continue;
    }

    const previewUrl = deps.createObjectUrl(file);
    let sourceWidth: number;
    let sourceHeight: number;
    try {
      const { width, height } = await deps.readImageSize(previewUrl);
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
        throw new Error('Invalid image dimensions');
      }
      sourceWidth = width;
      sourceHeight = height;
      const sizeMb = file.size / 1024 / 1024;
      if (file.size > LARGE_FILE_BYTES || Math.max(width, height) > LARGE_IMAGE_EDGE) {
        warnings.push(`"${file.name}" 较大（${width}×${height}, ${sizeMb.toFixed(1)}MB），处理时可能较慢或占用较多内存`);
      }
    } catch (error) {
      console.warn('Image dimension check failed', error);
      deps.revokeObjectUrl(previewUrl);
      errors.push(`"${file.name}" 无法读取或图片已损坏`);
      continue;
    }

    let exifDate = '';
    try {
      exifDate = await deps.readExifDate(file);
    } catch (error) {
      console.warn('EXIF extraction failed or timed out', error);
    }

    images.push({
      id: deps.createId(file),
      file,
      previewUrl,
      exifDate,
      included: true,
      sourceWidth,
      sourceHeight,
    });
  }

  return { images, errors, warnings };
}
