import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from "jose";

import { createAccessJwtVerifier } from "../src/accessJwt.js";

const issuer = "https://team.cloudflareaccess.com";
const audience = "filmframe-admin-audience";

async function signingFixture(): Promise<{ privateKey: KeyLike; jwk: JWK }> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { privateKey, jwk };
}

async function sign(
  privateKey: KeyLike,
  claims: {
    issuer?: string;
    audience?: string;
    email?: string;
    expirationTime?: string | number;
    notBefore?: string | number;
    includeExpiration?: boolean;
    includeNotBefore?: boolean;
  } = {},
): Promise<string> {
  let token = new SignJWT({ email: claims.email ?? "admin@example.test" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject("administrator")
    .setIssuer(claims.issuer ?? issuer)
    .setAudience(claims.audience ?? audience)
    .setIssuedAt();
  if (claims.includeNotBefore !== false) {
    token = token.setNotBefore(claims.notBefore ?? "0s");
  }
  if (claims.includeExpiration !== false) {
    token = token.setExpirationTime(claims.expirationTime ?? "5m");
  }
  return token.sign(privateKey);
}

describe("Cloudflare Access JWT verifier", () => {
  it("pins RS256 signature, issuer, audience, and administrator email", async () => {
    const fixture = await signingFixture();
    const verifier = createAccessJwtVerifier({
      issuer,
      audience,
      adminEmail: "admin@example.test",
      jwksUrl: new URL(`${issuer}/cdn-cgi/access/certs`),
      keyResolver: createLocalJWKSet({ keys: [fixture.jwk] }),
    });

    assert.deepEqual(await verifier(await sign(fixture.privateKey)), {
      subject: "administrator",
      email: "admin@example.test",
    });
    const wrongIssuer = await sign(fixture.privateKey, {
      issuer: "https://attacker.test",
    });
    const wrongAudience = await sign(fixture.privateKey, {
      audience: "other-application",
    });
    const wrongEmail = await sign(fixture.privateKey, {
      email: "other@example.test",
    });
    await assert.rejects(() => verifier(wrongIssuer));
    await assert.rejects(() => verifier(wrongAudience));
    await assert.rejects(() => verifier(wrongEmail));
  });

  it("rejects a token signed by an unknown key", async () => {
    const trusted = await signingFixture();
    const attacker = await signingFixture();
    const verifier = createAccessJwtVerifier({
      issuer,
      audience,
      adminEmail: "admin@example.test",
      jwksUrl: new URL(`${issuer}/cdn-cgi/access/certs`),
      keyResolver: createLocalJWKSet({ keys: [trusted.jwk] }),
    });
    const attackerToken = await sign(attacker.privateKey);
    await assert.rejects(() => verifier(attackerToken));
  });

  it("rejects expired, not-yet-valid, and tampered assertions", async () => {
    const fixture = await signingFixture();
    const verifier = createAccessJwtVerifier({
      issuer,
      audience,
      adminEmail: "admin@example.test",
      jwksUrl: new URL(`${issuer}/cdn-cgi/access/certs`),
      keyResolver: createLocalJWKSet({ keys: [fixture.jwk] }),
    });
    const now = Math.floor(Date.now() / 1_000);
    const expired = await sign(fixture.privateKey, { expirationTime: now - 60 });
    const future = await sign(fixture.privateKey, { notBefore: now + 3_600 });
    const missingExpiration = await sign(fixture.privateKey, {
      includeExpiration: false,
    });
    const missingNotBefore = await sign(fixture.privateKey, {
      includeNotBefore: false,
    });
    const valid = await sign(fixture.privateKey);
    const parts = valid.split(".");
    assert.equal(parts.length, 3);
    const signature = parts[2] as string;
    const tampered = `${parts[0]}.${parts[1]}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;

    await assert.rejects(() => verifier(expired));
    await assert.rejects(() => verifier(future));
    await assert.rejects(() => verifier(missingExpiration));
    await assert.rejects(() => verifier(missingNotBefore));
    await assert.rejects(() => verifier(tampered));
  });
});
