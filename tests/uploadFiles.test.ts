import { describe, expect, it, vi } from 'vitest';
import {
  LARGE_FILE_BYTES,
  LARGE_IMAGE_EDGE,
  prepareUploadedImages,
} from '../services/uploadFiles';

type TestFile = Pick<File, 'name' | 'size' | 'type'>;

describe('uploaded image preparation', () => {
  it('accepts images, rejects other files, and reports large images', async () => {
    const files = [
      { name: 'scan 01.jpg', size: 2_000_000, type: 'image/jpeg' },
      { name: 'notes.txt', size: 200, type: 'text/plain' },
      { name: 'huge.png', size: LARGE_FILE_BYTES + 1, type: 'image/png' },
    ] as TestFile[];
    const createdUrls: string[] = [];
    const sizedUrls: string[] = [];
    const exifFiles: string[] = [];

    const result = await prepareUploadedImages(files, {
      createId: (file: TestFile) => `id-${file.name}`,
      createObjectUrl: (file: TestFile) => {
        const url = `blob:${file.name}`;
        createdUrls.push(url);
        return url;
      },
      readImageSize: async (url: string) => {
        sizedUrls.push(url);
        return url === 'blob:huge.png'
          ? { width: LARGE_IMAGE_EDGE + 1, height: 4000 }
          : { width: 3000, height: 2000 };
      },
      readExifDate: async (file: TestFile) => {
        exifFiles.push(file.name);
        return file.name === 'scan 01.jpg' ? '2026/04/29' : '';
      },
    });

    expect(result.images).toHaveLength(2);
    expect(result.images[0].id).toBe('id-scan 01.jpg');
    expect(result.images[0].previewUrl).toBe('blob:scan 01.jpg');
    expect(result.images[0].exifDate).toBe('2026/04/29');
    expect(result.images[1].file.name).toBe('huge.png');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('"notes.txt"');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('"huge.png"');
    expect(createdUrls.join(',')).toBe('blob:scan 01.jpg,blob:huge.png');
    expect(sizedUrls.join(',')).toBe(createdUrls.join(','));
    expect(exifFiles.join(',')).toBe('scan 01.jpg,huge.png');
  });

  it('keeps valid image files when dimension reads fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unreadable = await prepareUploadedImages(
      [{ name: 'corrupt.jpg', size: 1000, type: 'image/jpeg' }] as TestFile[],
      {
        createId: () => 'id-corrupt',
        createObjectUrl: () => 'blob:corrupt',
        readImageSize: async () => {
          throw new Error('decode failed');
        },
        readExifDate: async () => '2026/01/01',
      }
    );

    expect(unreadable.images).toHaveLength(1);
    expect(unreadable.errors).toHaveLength(0);
    expect(unreadable.warnings).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith('Image dimension check failed', expect.any(Error));
    warn.mockRestore();
  });
});
