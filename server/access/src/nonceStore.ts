import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { ACCESS_FORM_NONCE_TTL_MS } from "./constants.js";

export class NonceStore {
  private readonly signingKey = randomBytes(32);
  private readonly usedNonces = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = ACCESS_FORM_NONCE_TTL_MS,
    private readonly maxUsedNonces = 10_000,
  ) {
    if (!Number.isSafeInteger(maxUsedNonces) || maxUsedNonces < 1) {
      throw new Error("Invalid used nonce capacity");
    }
  }

  issue(binding: string): string {
    if (!isCanonicalBinding(binding)) {
      throw new Error("Invalid form nonce binding");
    }
    const payload = `${this.now().toString(36)}.${randomBytes(16).toString("base64url")}`;
    return `${payload}.${this.sign(payload, binding)}`;
  }

  consume(nonce: string, binding: string): boolean {
    if (nonce.length > 128 || !isCanonicalBinding(binding)) return false;
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

    const expected = Buffer.from(
      this.sign(`${timestampPart}.${randomPart}`, binding),
      "base64url",
    );
    let received: Buffer;
    try {
      received = Buffer.from(signature, "base64url");
    } catch {
      return false;
    }
    const validSignature =
      received.toString("base64url") === signature
      && received.length === expected.length
      && timingSafeEqual(received, expected);
    if (!validSignature) return false;

    this.removeExpired(currentTime);
    if (this.usedNonces.has(nonce)) return false;
    if (this.usedNonces.size >= this.maxUsedNonces) return false;
    this.usedNonces.set(nonce, issuedAt + this.ttlMs);
    return true;
  }

  private sign(payload: string, binding: string): string {
    const bindingDigest = createHash("sha256").update(binding, "utf8").digest("base64url");
    return createHmac("sha256", this.signingKey)
      .update(`${payload}.${bindingDigest}`, "utf8")
      .digest("base64url");
  }

  private removeExpired(currentTime: number): void {
    for (const [nonce, expiresAt] of this.usedNonces) {
      if (expiresAt <= currentTime) this.usedNonces.delete(nonce);
    }
  }
}

function isCanonicalBinding(binding: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(binding)) return false;
  const decoded = Buffer.from(binding, "base64url");
  return decoded.length === 32 && decoded.toString("base64url") === binding;
}
