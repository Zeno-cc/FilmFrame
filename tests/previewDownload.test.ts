import { describe, expect, it } from 'vitest';
import { buildPreviewDownload } from '../services/previewDownload';

const jpegArtifact = {
  url: 'blob:processed-a',
  mime: 'image/jpeg' as const,
  settingsKey: 'settings-a',
};

const pngStripArtifact = {
  url: 'blob:strip',
  mime: 'image/png' as const,
  settingsKey: 'strip-settings',
};

describe('preview downloads', () => {
  it('builds a single download from the rendered artifact MIME', () => {
    expect(buildPreviewDownload(
      { type: 'single', imageId: 'a' },
      'RAW scan 01.webp',
      jpegArtifact,
      null,
    )).toEqual({
      href: 'blob:processed-a',
      download: 'RAW_scan_01.jpg',
    });
  });

  it('does not offer an original preview as a rendered download', () => {
    expect(buildPreviewDownload(
      { type: 'single', imageId: 'a' },
      'RAW scan 01.webp',
      null,
      null,
    )).toBeNull();
  });

  it('builds a strip download from the current strip artifact', () => {
    expect(buildPreviewDownload(
      { type: 'strip' },
      null,
      null,
      pngStripArtifact,
    )).toEqual({
      href: 'blob:strip',
      download: 'film_strip.png',
    });
  });

  it('does not offer a stale or missing strip result', () => {
    expect(buildPreviewDownload(
      { type: 'strip' },
      null,
      null,
      null,
    )).toBeNull();
  });
});
