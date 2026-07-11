import {
  createArtifactFilename,
  type RenderArtifact,
} from './renderResult';

export type PreviewDownloadState =
  | { type: 'single'; imageId: string }
  | { type: 'strip' };

export function buildPreviewDownload(
  preview: PreviewDownloadState,
  singleFilename: string | null,
  singleArtifact: RenderArtifact | null,
  stripArtifact: RenderArtifact | null,
): { href: string; download: string } | null {
  if (preview.type === 'strip') {
    return stripArtifact
      ? {
          href: stripArtifact.url,
          download: createArtifactFilename('film_strip', stripArtifact.mime),
        }
      : null;
  }

  if (!singleFilename || !singleArtifact) return null;

  return {
    href: singleArtifact.url,
    download: createArtifactFilename(singleFilename, singleArtifact.mime),
  };
}
