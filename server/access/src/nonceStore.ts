import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { ACCESS_FORM_NONCE_TTL_MS } from "./constants.js";

export class NonceStore {
  private readonly signingKey = randomBytes(32);

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = ACCESS_FORM_NONCE_TTL_MS,
  ) {}

  issue(): string {
    const payload = `${this.now().toString(36)}.${randomBytes(16).toString("base64url")}`;
    return `${payload}.${this.sign(payload)}`;
  }

  verify(nonce: string): boolean {
    if (nonce.length > 128) return false;
    const parts = nonce.split(".");
    if (parts.length !== 3) return false;
    const [timestampPart, randomPart, signature] = parts;
    if (!timestampPart || !randomPart || !signature) return false;
    if (!/^[0-9a-z]+$/.test(timestampPart) || !/^[A-Za-z0-9_-]{22}$/.test(randomPart)) {
      return false;
    }

    const issuedAt = Number.parseInt(timestampPart, 36);
    const currentTime = this.now();
    if (
      !Number.isSafeInteger(issuedAt) ||
      issuedAt > currentTime + 5_000 ||
      currentTime >= issuedAt + this.ttlMs
    ) {
      return false;
    }

    const expected = Buffer.from(this.sign(`${timestampPart}.${randomPart}`), "base64url");
    let received: Buffer;
    try {
      received = Buffer.from(signature, "base64url");
    } catch {
      return false;
    }
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.signingKey).update(payload, "utf8").digest("base64url");
  }
}
