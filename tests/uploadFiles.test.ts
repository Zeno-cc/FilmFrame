import { describe, expect, it, vi } from 'vitest';
import {
  LARGE_FILE_BYTES,
  LARGE_IMAGE_EDGE,
  prepareUploadedImages,
} from '../services/uploadFiles';
import {
  HEIC_JPEG_QUALITY,
  isHeicOrHeifCandidate,
  prepareHeicRenderFile,
} from '../services/heicConversion';

type TestFile = Pick<File, 'name' | 'size' | 'type'>;

describe('uploaded image preparation', () => {
  it('keeps JPEG, PNG, and WebP behavior, rejects unsupported types, and reports large images', async () => {
    const files = [
      { name: 'scan 01.jpg', size: 2_000_000, type: 'image/jpeg' },
      { name: 'scan 02.webp', size: 1_000_000, type: 'image/webp' },
      { name: 'notes.txt', size: 200, type: 'text/plain' },
      { name: 'vector.svg', size: 200, type: 'image/svg+xml' },
      { name: 'animation.gif', size: 200, type: 'image/gif' },
      { name: 'phone.avif', size: 200, type: 'image/avif' },
      { name: 'unknown', size: 200, type: '' },
      { name: 'huge.png', size: LARGE_FILE_BYTES + 1, type: 'image/png' },
    ] as TestFile[];
    const createdUrls: string[] = [];
    const sizedUrls: string[] = [];
    const exifFiles: string[] = [];

    const result = await prepareUploadedImages(files, {
      isHeicCandidate: () => false,
      prepareRenderFile: async file => file,
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
    expect(result.errors.join('\n')).toContain('"phone.avif"');
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
        isHeicCandidate: () => false,
        prepareRenderFile: async file => file,
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
        isHeicCandidate: () => false,
        prepareRenderFile: async file => file,
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
        isHeicCandidate: () => false,
        prepareRenderFile: async file => file,
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

  it('uses original HEIC/HEIF files for identity and EXIF while rendered JPEGs own preview and admission data', async () => {
    const originalHeic = { name: 'phone.heic', size: 5_000_000, type: 'image/heic' } as TestFile;
    const originalHeif = { name: 'camera.HEIF', size: 6_000_000, type: '' } as TestFile;
    const convertedHeic = { name: 'phone.heic', size: LARGE_FILE_BYTES + 1, type: 'image/jpeg' } as TestFile;
    const convertedHeif = { name: 'camera.HEIF', size: 2_000_000, type: 'image/jpeg' } as TestFile;
    const conversions = new Map<TestFile, TestFile>([
      [originalHeic, convertedHeic],
      [originalHeif, convertedHeif],
    ]);
    const createId = vi.fn((file: TestFile) => `id-${file.name}`);
    const createObjectUrl = vi.fn((file: TestFile) => `blob:${file.type}:${file.name}`);
    const readExifDate = vi.fn(async (file: TestFile) => (
      file === originalHeic ? '2026/08/20' : ''
    ));

    const result = await prepareUploadedImages([originalHeic, originalHeif], {
      isHeicCandidate: isHeicOrHeifCandidate,
      prepareRenderFile: async file => {
        const converted = conversions.get(file);
        if (!converted) throw new Error('missing conversion');
        return converted;
      },
      createId,
      createObjectUrl,
      revokeObjectUrl: vi.fn(),
      readImageSize: async url => url.includes('phone.heic')
        ? { width: 9001, height: 6000 }
        : { width: 4000, height: 3000 },
      readExifDate,
    });

    expect(result.errors).toEqual([]);
    expect(result.images).toHaveLength(2);
    expect(result.images[0]).toMatchObject({
      id: 'id-phone.heic',
      file: convertedHeic,
      previewUrl: 'blob:image/jpeg:phone.heic',
      exifDate: '2026/08/20',
      sourceWidth: 9001,
      sourceHeight: 6000,
    });
    expect(result.images[1].file).toBe(convertedHeif);
    expect(createId).toHaveBeenNthCalledWith(1, originalHeic);
    expect(createId).toHaveBeenNthCalledWith(2, originalHeif);
    expect(createObjectUrl).toHaveBeenNthCalledWith(1, convertedHeic);
    expect(createObjectUrl).toHaveBeenNthCalledWith(2, convertedHeif);
    expect(readExifDate).toHaveBeenNthCalledWith(1, originalHeic);
    expect(readExifDate).toHaveBeenNthCalledWith(2, originalHeif);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('phone.heic');
    expect(result.warnings[0]).toContain('25.0MB');
  });

  it('isolates HEIC conversion failure before URL allocation and keeps another valid file', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const createObjectUrl = vi.fn((file: TestFile) => `blob:${file.name}`);
    const files = [
      { name: 'broken.heic', size: 1000, type: 'image/heic' },
      { name: 'kept.jpg', size: 1000, type: 'image/jpeg' },
    ] as TestFile[];

    const result = await prepareUploadedImages(files, {
      isHeicCandidate: isHeicOrHeifCandidate,
      prepareRenderFile: async file => {
        if (file.name === 'broken.heic') throw new Error('decode failed');
        return file;
      },
      createId: file => `id-${file.name}`,
      createObjectUrl,
      revokeObjectUrl: vi.fn(),
      readImageSize: async () => ({ width: 20, height: 10 }),
      readExifDate: async () => '',
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0].file.name).toBe('kept.jpg');
    expect(result.errors).toEqual([
      '"broken.heic" 无法在浏览器中转换 HEIC/HEIF 图片',
    ]);
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(createObjectUrl).toHaveBeenCalledWith(files[1]);
    expect(warn).toHaveBeenCalledWith('Local image preparation failed', expect.any(Error));
    warn.mockRestore();
  });

  it('revokes the converted HEIF preview URL when browser dimension decoding fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const original = { name: 'unreadable.heif', size: 1000, type: 'image/heif' } as TestFile;
    const converted = { name: original.name, size: 900, type: 'image/jpeg' } as TestFile;
    const revokeObjectUrl = vi.fn();

    const result = await prepareUploadedImages([original], {
      isHeicCandidate: isHeicOrHeifCandidate,
      prepareRenderFile: async () => converted,
      createId: () => 'id-unreadable',
      createObjectUrl: file => `blob:${file.type}:${file.name}`,
      revokeObjectUrl,
      readImageSize: async () => {
        throw new Error('jpeg decode failed');
      },
      readExifDate: async () => '',
    });

    expect(result.images).toEqual([]);
    expect(result.errors[0]).toContain('unreadable.heif');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:image/jpeg:unreadable.heif');
    warn.mockRestore();
  });
});

describe('local HEIC conversion boundary', () => {
  it('recognizes standard MIME values and case-insensitive HEIC/HEIF extensions', () => {
    expect(isHeicOrHeifCandidate({ name: 'photo.bin', type: 'image/heic' })).toBe(true);
    expect(isHeicOrHeifCandidate({ name: 'photo.bin', type: 'image/heif' })).toBe(true);
    expect(isHeicOrHeifCandidate({ name: 'photo.HEIC', type: '' })).toBe(true);
    expect(isHeicOrHeifCandidate({ name: 'photo.HeIf', type: 'application/octet-stream' })).toBe(true);
    expect(isHeicOrHeifCandidate({ name: 'photo.jpg', type: 'image/jpeg' })).toBe(false);
  });

  it('uses the CSP converter at fixed quality and preserves original File identity metadata', async () => {
    const original = new File(['heic bytes'], 'trip.heic', {
      type: 'image/heic',
      lastModified: 1_787_184_000_000,
    });
    const jpegBlob = new Blob(['jpeg bytes'], { type: 'image/jpeg' });
    const isHeic = vi.fn(async () => true);
    const heicTo = vi.fn(async () => jpegBlob);

    const converted = await prepareHeicRenderFile(original, { isHeic, heicTo });

    expect(isHeic).toHaveBeenCalledWith(original);
    expect(heicTo).toHaveBeenCalledWith({
      blob: original,
      type: 'image/jpeg',
      quality: HEIC_JPEG_QUALITY,
    });
    expect(converted).not.toBe(original);
    expect(converted.name).toBe('trip.heic');
    expect(converted.type).toBe('image/jpeg');
    expect(converted.size).toBe(jpegBlob.size);
    expect(converted.lastModified).toBe(original.lastModified);
  });

  it('returns existing browser-decodable files unchanged without loading the converter', async () => {
    const original = new File(['jpeg bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const isHeic = vi.fn(async () => true);
    const heicTo = vi.fn(async () => new Blob());

    await expect(prepareHeicRenderFile(original, { isHeic, heicTo })).resolves.toBe(original);
    expect(isHeic).not.toHaveBeenCalled();
    expect(heicTo).not.toHaveBeenCalled();
  });
});
