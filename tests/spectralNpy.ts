import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface DecodedNpy {
  shape: number[];
  values: Float64Array;
  payloadSha256: string;
}

export function readLittleEndianFloat64Npy(path: string): DecodedNpy {
  const bytes = readFileSync(path);
  if (bytes.length < 128 || bytes[0] !== 0x93 || bytes.toString('ascii', 1, 6) !== 'NUMPY') {
    throw new Error(`Not an NPY file: ${path}`);
  }
  const major = bytes[6];
  const headerLength = major === 1 ? bytes.readUInt16LE(8) : bytes.readUInt32LE(8);
  const headerOffset = major === 1 ? 10 : 12;
  const header = bytes.toString('ascii', headerOffset, headerOffset + headerLength);
  if (!/'descr'\s*:\s*'<f8'/.test(header) || !/'fortran_order'\s*:\s*False/.test(header)) {
    throw new Error(`Expected little-endian float64 C-order NPY: ${path}`);
  }
  const shapeMatch = header.match(/'shape'\s*:\s*\(([^)]*)\)/);
  if (!shapeMatch) throw new Error(`Missing NPY shape: ${path}`);
  const shape = shapeMatch[1].split(',').map(value => value.trim()).filter(Boolean).map(Number);
  if (shape.length === 0 || shape.some(value => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error(`Invalid NPY shape: ${path}`);
  }
  const length = shape.reduce((total, value) => total * value, 1);
  const offset = headerOffset + headerLength;
  if (bytes.length !== offset + length * 8) throw new Error(`Invalid NPY payload size: ${path}`);
  const values = new Float64Array(length);
  for (let index = 0; index < length; index += 1) values[index] = bytes.readDoubleLE(offset + index * 8);
  return {
    shape,
    values,
    payloadSha256: createHash('sha256').update(bytes.subarray(offset)).digest('hex'),
  };
}
