import type { ImageItem } from '../types';

export const LARGE_FILE_BYTES = 25 * 1024 * 1024;
export const LARGE_IMAGE_EDGE = 8000;
export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type UploadFile = Pick<File, 'name' | 'size' | 'type'>;

type PrepareUploadDeps<TInputFile extends UploadFile, TRenderFile extends UploadFile> = {
  isHeicCandidate: (file: TInputFile) => boolean;
  prepareRenderFile: (file: TInputFile) => Promise<TRenderFile>;
  createId: (file: TInputFile) => string;
  createObjectUrl: (file: TRenderFile) => string;
  revokeObjectUrl: (url: string) => void;
  readImageSize: (url: string) => Promise<{ width: number; height: number }>;
  readExifDate: (file: TInputFile) => Promise<string>;
};

export type PreparedUpload<TRenderFile extends UploadFile = File> = {
  images: Array<Pick<ImageItem, 'id' | 'previewUrl' | 'exifDate' | 'included' | 'sourceWidth' | 'sourceHeight'> & { file: TRenderFile }>;
  errors: string[];
  warnings: string[];
};

export async function prepareUploadedImages<
  TInputFile extends UploadFile,
  TRenderFile extends UploadFile = TInputFile,
>(
  files: Iterable<TInputFile>,
  deps: PrepareUploadDeps<TInputFile, TRenderFile>
): Promise<PreparedUpload<TRenderFile>> {
  const images: PreparedUpload<TRenderFile>['images'] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    const isHeicCandidate = deps.isHeicCandidate(file);
    if (!SUPPORTED_IMAGE_MIME_TYPES.has(file.type) && !isHeicCandidate) {
      errors.push(`"${file.name}" 不是支持的图片格式（仅支持 JPEG、PNG、WebP、HEIC、HEIF）`);
      continue;
    }

    let renderFile: TRenderFile;
    try {
      renderFile = await deps.prepareRenderFile(file);
    } catch (error) {
      console.warn('Local image preparation failed', error);
      errors.push(isHeicCandidate
        ? `"${file.name}" 无法在浏览器中转换 HEIC/HEIF 图片`
        : `"${file.name}" 无法准备为可读取的图片`);
      continue;
    }

    const previewUrl = deps.createObjectUrl(renderFile);
    let sourceWidth: number;
    let sourceHeight: number;
    try {
      const { width, height } = await deps.readImageSize(previewUrl);
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
        throw new Error('Invalid image dimensions');
      }
      sourceWidth = width;
      sourceHeight = height;
      const sizeMb = renderFile.size / 1024 / 1024;
      if (renderFile.size > LARGE_FILE_BYTES || Math.max(width, height) > LARGE_IMAGE_EDGE) {
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
      file: renderFile,
      previewUrl,
      exifDate,
      included: true,
      sourceWidth,
      sourceHeight,
    });
  }

  return { images, errors, warnings };
}
