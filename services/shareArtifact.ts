export type ShareArtifactResult =
  | { status: 'shared' }
  | { status: 'cancelled' }
  | { status: 'unsupported' }
  | { status: 'failed'; error: Error };

export interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
}

function defaultNavigator(): ShareNavigator | null {
  return typeof navigator === 'undefined' ? null : navigator;
}

export function canShareArtifact(
  file: File,
  shareNavigator: ShareNavigator | null = defaultNavigator()
): boolean {
  if (!shareNavigator?.share || !shareNavigator.canShare) return false;
  try {
    return shareNavigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareArtifact(
  file: File,
  options: { title?: string; text?: string } = {},
  shareNavigator: ShareNavigator | null = defaultNavigator()
): Promise<ShareArtifactResult> {
  if (!canShareArtifact(file, shareNavigator)) return { status: 'unsupported' };

  try {
    await shareNavigator!.share!({
      files: [file],
      title: options.title,
      text: options.text,
    });
    return { status: 'shared' };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'AbortError'
    ) {
      return { status: 'cancelled' };
    }
    return {
      status: 'failed',
      error: error instanceof Error ? error : new Error('Unable to share this image'),
    };
  }
}
