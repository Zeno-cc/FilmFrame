import { describe, expect, it, vi } from 'vitest';
import {
  LARGE_FILE_BYTES,
  LARGE_IMAGE_EDGE,
  prepareUploadedImages,
} from '../services/uploadFiles';

type TestFile = Pick<File, 'name' | 'size' | 'type'>;

describe('uploaded image preparation', () => {
  it('accepts only JPEG, PNG, and WebP, rejects other types, and reports large images', async () => {
    const files = [
      { name: 'scan 01.jpg', size: 2_000_000, type: 'image/jpeg' },
      { name: 'scan 02.webp', size: 1_000_000, type: 'image/webp' },
      { name: 'notes.txt', size: 200, type: 'text/plain' },
      { name: 'vector.svg', size: 200, type: 'image/svg+xml' },
      { name: 'animation.gif', size: 200, type: 'image/gif' },
      { name: 'phone.heic', size: 200, type: 'image/heic' },
      { name: 'unknown', size: 200, type: '' },
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
      revokeObjectUrl: vi.fn(),
    });

    expect(result.images).toHaveLength(3);
    expect(result.images[0].id).toBe('id-scan 01.jpg');
    expect(result.images[0].previewUrl).toBe('blob:scan 01.jpg');
    expect(result.images[0].exifDate).toBe('2026/04/29');
    expect(result.images[0]).toMatchObject({
      included: true,
      sourceWidth: 3000,
      sourceHeight: 2000,
    });
    expect(result.images[1].file.name).toBe('scan 02.webp');
    expect(result.images[1]).toMatchObject({
      included: true,
      sourceWidth: 3000,
      sourceHeight: 2000,
    });
    expect(result.images[2].file.name).toBe('huge.png');
    expect(result.images[2]).toMatchObject({
      included: true,
      sourceWidth: LARGE_IMAGE_EDGE + 1,
      sourceHeight: 4000,
    });
    expect(result.errors).toHaveLength(5);
    expect(result.errors.join('\n')).toContain('"notes.txt"');
    expect(result.errors.join('\n')).toContain('"vector.svg"');
    expect(result.errors.join('\n')).toContain('"animation.gif"');
    expect(result.errors.join('\n')).toContain('"phone.heic"');
    expect(result.errors.join('\n')).toContain('"unknown"');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('"huge.png"');
    expect(createdUrls.join(',')).toBe('blob:scan 01.jpg,blob:scan 02.webp,blob:huge.png');
    expect(sizedUrls.join(',')).toBe(createdUrls.join(','));
    expect(exifFiles.join(',')).toBe('scan 01.jpg,scan 02.webp,huge.png');
  });

  it('rejects and revokes valid image files when image decoding fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const revokeObjectUrl = vi.fn();
    const unreadable = await prepareUploadedImages(
      [{ name: 'corrupt.jpg', size: 1000, type: 'image/jpeg' }] as TestFile[],
      {
        createId: () => 'id-corrupt',
        createObjectUrl: () => 'blob:corrupt',
        readImageSize: async () => {
          throw new Error('decode failed');
        },
        readExifDate: async () => '2026/01/01',
        revokeObjectUrl,
      }
    );

    expect(unreadable.images).toHaveLength(0);
    expect(unreadable.errors).toHaveLength(1);
    expect(unreadable.errors[0]).toContain('"corrupt.jpg"');
    expect(unreadable.warnings).toHaveLength(0);
    expect(revokeObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:corrupt');
    expect(warn).toHaveBeenCalledWith('Image dimension check failed', expect.any(Error));
    warn.mockRestore();
  });

  it('rejects and revokes images when a decoder returns invalid natural dimensions', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const revokeObjectUrl = vi.fn();
    const result = await prepareUploadedImages(
      [{ name: 'zero-width.jpg', size: 1000, type: 'image/jpeg' }] as TestFile[],
      {
        createId: () => 'id-zero-width',
        createObjectUrl: () => 'blob:zero-width',
        readImageSize: async () => ({ width: 0, height: 800 }),
        readExifDate: async () => '',
        revokeObjectUrl,
      },
    );

    expect(result.images).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('zero-width.jpg');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:zero-width');
    warn.mockRestore();
  });

  it('keeps a successfully decoded image when EXIF extraction fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await prepareUploadedImages(
      [{ name: 'no-exif.png', size: 1000, type: 'image/png' }] as TestFile[],
      {
        createId: () => 'id-no-exif',
        createObjectUrl: () => 'blob:no-exif',
        readImageSize: async () => ({ width: 10, height: 10 }),
        readExifDate: async () => {
          throw new Error('no exif');
        },
        revokeObjectUrl: vi.fn(),
      }
    );

    expect(result.images).toHaveLength(1);
    expect(result.images[0].exifDate).toBe('');
    expect(result.errors).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith('EXIF extraction failed or timed out', expect.any(Error));
    warn.mockRestore();
  });
});
