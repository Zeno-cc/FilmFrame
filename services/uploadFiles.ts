import type { ImageItem } from '../types';

export const LARGE_FILE_BYTES = 25 * 1024 * 1024;
export const LARGE_IMAGE_EDGE = 8000;

type UploadFile = Pick<File, 'name' | 'size' | 'type'>;

type PrepareUploadDeps<TFile extends UploadFile> = {
  createId: (file: TFile) => string;
  createObjectUrl: (file: TFile) => string;
  readImageSize: (url: string) => Promise<{ width: number; height: number }>;
  readExifDate: (file: TFile) => Promise<string>;
};

export type PreparedUpload<TFile extends UploadFile = File> = {
  images: Array<Pick<ImageItem, 'id' | 'previewUrl' | 'exifDate'> & { file: TFile }>;
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
    if (!file.type.startsWith('image/')) {
      errors.push(`"${file.name}" 不是有效的图片文件`);
      continue;
    }

    const previewUrl = deps.createObjectUrl(file);
    try {
      const { width, height } = await deps.readImageSize(previewUrl);
      const sizeMb = file.size / 1024 / 1024;
      if (file.size > LARGE_FILE_BYTES || Math.max(width, height) > LARGE_IMAGE_EDGE) {
        warnings.push(`"${file.name}" 较大（${width}×${height}, ${sizeMb.toFixed(1)}MB），处理时可能较慢或占用较多内存`);
      }
    } catch (error) {
      console.warn('Image dimension check failed', error);
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
    });
  }

  return { images, errors, warnings };
}
