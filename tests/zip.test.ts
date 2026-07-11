import { describe, expect, it, vi } from 'vitest';
import { MAX_ZIP_INPUT_BYTES, createZipBlob } from '../services/zip';

describe('ZIP archive creation', () => {
  it('creates a ZIP with the expected local and end signatures', async () => {
    const archive = await createZipBlob([
      { name: 'one.txt', blob: new Blob(['one']) },
      { name: 'two.txt', blob: new Blob(['two']) },
    ]);
    const bytes = new Uint8Array(await archive.arrayBuffer());
    const view = new DataView(bytes.buffer);

    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  });

  it('rejects oversized input before reading any file bytes', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const oversized = {
      size: MAX_ZIP_INPUT_BYTES + 1,
      arrayBuffer,
    } as unknown as Blob;

    await expect(createZipBlob([{ name: 'too-large.jpg', blob: oversized }]))
      .rejects.toThrow('ZIP input exceeds the safe memory budget');
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
