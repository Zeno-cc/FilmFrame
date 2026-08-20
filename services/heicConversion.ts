export const HEIC_JPEG_QUALITY = 0.95;

const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);
const HEIC_EXTENSION = /\.(?:heic|heif)$/i;

type HeicInput = Pick<File, 'name' | 'type'>;

type HeicConversionDependencies = {
  isHeic: (file: File) => Promise<boolean>;
  heicTo: (options: {
    blob: Blob;
    type: 'image/jpeg';
    quality: number;
  }) => Promise<Blob>;
};

export function isHeicOrHeifCandidate(file: HeicInput): boolean {
  return HEIC_MIME_TYPES.has(file.type.toLowerCase()) || HEIC_EXTENSION.test(file.name);
}

async function loadConverter(): Promise<HeicConversionDependencies> {
  return import('heic-to/csp');
}

export async function prepareHeicRenderFile(
  file: File,
  dependencies?: HeicConversionDependencies,
): Promise<File> {
  if (!isHeicOrHeifCandidate(file)) return file;

  try {
    const converter = dependencies ?? await loadConverter();
    if (!await converter.isHeic(file)) {
      throw new Error('File contents are not a supported HEIC/HEIF still image');
    }
    const jpegBlob = await converter.heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: HEIC_JPEG_QUALITY,
    });
    return new File([jpegBlob], file.name, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch (error) {
    throw new Error(`Failed to convert ${file.name} locally`, { cause: error });
  }
}
