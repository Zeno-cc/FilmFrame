import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { NonceStore } from "../src/nonceStore.js";

describe("form nonce", () => {
  function binding(): string {
    return randomBytes(32).toString("base64url");
  }

  it("is binding-scoped, signed, single-use, and expires at the configured boundary", () => {
    let now = 100_000;
    const nonces = new NonceStore(() => now, 10_000);
    const browserBinding = binding();
    const nonce = nonces.issue(browserBinding);

    assert.equal(nonces.consume(nonce, binding()), false);
    assert.equal(nonces.consume(nonce, browserBinding), true);
    assert.equal(nonces.consume(nonce, browserBinding), false);

    const tampered = nonces.issue(browserBinding);
    const replacement = nonce.endsWith("x") ? "y" : "x";
    assert.equal(
      nonces.consume(`${tampered.slice(0, -1)}${replacement}`, browserBinding),
      false,
    );
    const expiring = nonces.issue(browserBinding);
    now += 9_999;
    assert.equal(nonces.consume(expiring, browserBinding), true);
    const expired = nonces.issue(browserBinding);
    now += 10_000;
    assert.equal(nonces.consume(expired, browserBinding), false);
  });

  it("rejects malformed bindings without consuming a valid nonce", () => {
    const nonces = new NonceStore();
    const browserBinding = binding();
    const nonce = nonces.issue(browserBinding);

    for (const malformed of ["", "A".repeat(42), "A".repeat(44), `${browserBinding}=`, "!"]) {
      assert.equal(nonces.consume(nonce, malformed), false);
    }
    assert.equal(nonces.consume(nonce, browserBinding), true);
  });

  it("fails closed at the used-nonce capacity and recovers after expiry", () => {
    let now = 100_000;
    const nonces = new NonceStore(() => now, 10_000, 1);
    const browserBinding = binding();
    const first = nonces.issue(browserBinding);
    const second = nonces.issue(browserBinding);

    assert.equal(nonces.consume(first, browserBinding), true);
    assert.equal(nonces.consume(second, browserBinding), false);
    now += 10_000;
    const third = nonces.issue(browserBinding);
    assert.equal(nonces.consume(third, browserBinding), true);
  });
});
