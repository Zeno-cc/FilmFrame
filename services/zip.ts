export interface ZipFileEntry {
  name: string;
  blob: Blob;
}

const ZIP_UINT16_MAX = 0xffff;
const ZIP_UINT32_MAX = 0xffffffff;
const LOCAL_HEADER_BASE_SIZE = 30;
const CENTRAL_HEADER_BASE_SIZE = 46;
const END_HEADER_SIZE = 22;

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c >>> 0;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();

  return { dosTime, dosDate };
}

function createHeader(size: number): Uint8Array {
  return new Uint8Array(size);
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function assertZip32Limit(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// Creates a standards-compatible ZIP in store mode. Images are already compressed, so deflate adds little value.
export async function createZipBlob(files: ZipFileEntry[]): Promise<Blob> {
  assertZip32Limit(
    files.length <= ZIP_UINT16_MAX,
    `ZIP64 is not supported: too many files (${files.length}; max ${ZIP_UINT16_MAX}).`,
  );

  const encoder = new TextEncoder();
  const now = getDosDateTime();
  const chunks: BlobPart[] = [];
  const centralChunks: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const size = file.blob.size;
    const localHeaderSize = LOCAL_HEADER_BASE_SIZE + nameBytes.length;
    const centralHeaderSize = CENTRAL_HEADER_BASE_SIZE + nameBytes.length;

    assertZip32Limit(
      nameBytes.length <= ZIP_UINT16_MAX,
      `ZIP64 is not supported: filename is too long (${nameBytes.length} bytes; max ${ZIP_UINT16_MAX}): ${file.name}`,
    );
    assertZip32Limit(
      size <= ZIP_UINT32_MAX,
      `ZIP64 is not supported: file is too large (${size} bytes; max ${ZIP_UINT32_MAX}): ${file.name}`,
    );
    assertZip32Limit(
      offset <= ZIP_UINT32_MAX,
      `ZIP64 is not supported: archive is too large before ${file.name} (offset ${offset}; max ${ZIP_UINT32_MAX}).`,
    );
    assertZip32Limit(
      offset + localHeaderSize + size <= ZIP_UINT32_MAX,
      `ZIP64 is not supported: archive is too large after ${file.name} (${offset + localHeaderSize + size} bytes; max ${ZIP_UINT32_MAX}).`,
    );
    assertZip32Limit(
      centralSize + centralHeaderSize <= ZIP_UINT32_MAX,
      `ZIP64 is not supported: central directory is too large (${centralSize + centralHeaderSize} bytes; max ${ZIP_UINT32_MAX}).`,
    );

    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);
    const localOffset = offset;

    const localHeader = createHeader(localHeaderSize);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, now.dosTime);
    writeUint16(localView, 12, now.dosDate);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, size);
    writeUint32(localView, 22, size);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    chunks.push(asArrayBuffer(localHeader), asArrayBuffer(data));
    offset += localHeaderSize + size;

    const centralHeader = createHeader(centralHeaderSize);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, now.dosTime);
    writeUint16(centralView, 14, now.dosDate);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, size);
    writeUint32(centralView, 24, size);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);
    centralChunks.push(asArrayBuffer(centralHeader));
    centralSize += centralHeaderSize;
  }

  const centralOffset = offset;
  assertZip32Limit(
    centralOffset <= ZIP_UINT32_MAX,
    `ZIP64 is not supported: archive is too large before central directory (${centralOffset} bytes; max ${ZIP_UINT32_MAX}).`,
  );
  assertZip32Limit(
    centralOffset + centralSize + END_HEADER_SIZE <= ZIP_UINT32_MAX,
    `ZIP64 is not supported: archive is too large (${centralOffset + centralSize + END_HEADER_SIZE} bytes; max ${ZIP_UINT32_MAX}).`,
  );

  const endHeader = createHeader(22);
  const endView = new DataView(endHeader.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, centralOffset);
  writeUint16(endView, 20, 0);

  return new Blob([...chunks, ...centralChunks, asArrayBuffer(endHeader)], { type: 'application/zip' });
}
