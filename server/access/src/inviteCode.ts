import { createHash, randomBytes } from "node:crypto";

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PAYLOAD_LENGTH = 26;

export class InvalidInviteCodeError extends Error {
  constructor() {
    super("Invalid invitation code");
    this.name = "InvalidInviteCodeError";
  }
}

function encodeCrockford(bytes: Uint8Array): string {
  let result = "";
  let buffer = 0;
  let bits = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += CROCKFORD_ALPHABET[(buffer >>> bits) & 31];
      buffer &= (1 << bits) - 1;
    }
  }

  if (bits > 0) {
    result += CROCKFORD_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return result;
}

export function normalizeInviteCode(input: string): string {
  const compact = input.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!compact.startsWith("FF1")) throw new InvalidInviteCodeError();

  const payload = compact
    .slice(3)
    .replaceAll("O", "0")
    .replace(/[IL]/g, "1");
  if (payload.length !== PAYLOAD_LENGTH) throw new InvalidInviteCodeError();
  if (!/^[0-9A-HJKMNP-TV-Z]+$/.test(payload)) throw new InvalidInviteCodeError();

  return `FF1-${payload}`;
}

export function formatInviteCode(canonicalCode: string): string {
  const normalized = normalizeInviteCode(canonicalCode);
  const groups = normalized.slice(4).match(/.{1,4}/g);
  if (!groups) throw new InvalidInviteCodeError();
  return `FF1-${groups.join("-")}`;
}

export function generateInviteCode(): { canonical: string; display: string } {
  const payload = encodeCrockford(randomBytes(16));
  const canonical = `FF1-${payload}`;
  return { canonical, display: formatInviteCode(canonical) };
}

export function hashValue(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function hashInviteCode(input: string): Buffer {
  return hashValue(normalizeInviteCode(input));
}
