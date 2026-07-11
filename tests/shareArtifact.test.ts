import { describe, expect, it, vi } from 'vitest';
import {
  canShareArtifact,
  shareArtifact,
  type ShareNavigator,
} from '../services/shareArtifact';

const file = new File(['rendered'], 'film-frame.jpg', { type: 'image/jpeg' });

describe('artifact sharing', () => {
  it('reports unsupported without invoking an external action', async () => {
    const share = vi.fn();
    expect(canShareArtifact(file, { share })).toBe(false);
    await expect(shareArtifact(file, {}, { share })).resolves.toEqual({ status: 'unsupported' });
    expect(share).not.toHaveBeenCalled();
  });

  it('reports unsupported when the browser cannot share this file', async () => {
    const share = vi.fn();
    const navigator: ShareNavigator = { share, canShare: () => false };
    await expect(shareArtifact(file, {}, navigator)).resolves.toEqual({ status: 'unsupported' });
    expect(share).not.toHaveBeenCalled();
  });

  it('shares only the final file and short metadata', async () => {
    const share = vi.fn(async () => undefined);
    const navigator: ShareNavigator = { share, canShare: () => true };

    await expect(shareArtifact(file, {
      title: 'FilmFrame',
      text: '这一卷冲洗完成',
    }, navigator)).resolves.toEqual({ status: 'shared' });
    expect(share).toHaveBeenCalledWith({
      files: [file],
      title: 'FilmFrame',
      text: '这一卷冲洗完成',
    });
    expect(JSON.stringify(share.mock.calls)).not.toContain('blob:');
  });

  it('distinguishes cancellation from a system failure without retrying', async () => {
    const cancelledShare = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    await expect(shareArtifact(file, {}, {
      share: cancelledShare,
      canShare: () => true,
    })).resolves.toEqual({ status: 'cancelled' });
    expect(cancelledShare).toHaveBeenCalledTimes(1);

    const failedShare = vi.fn(async () => {
      throw new Error('share service unavailable');
    });
    const result = await shareArtifact(file, {}, {
      share: failedShare,
      canShare: () => true,
    });
    expect(result.status).toBe('failed');
    expect(failedShare).toHaveBeenCalledTimes(1);
  });
});

