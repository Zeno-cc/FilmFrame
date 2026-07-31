import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NonceStore } from "../src/nonceStore.js";

describe("form nonce", () => {
  it("is stateless, signed, and expires at the configured boundary", () => {
    let now = 100_000;
    const nonces = new NonceStore(() => now, 10_000);
    const nonce = nonces.issue();

    assert.equal(nonces.verify(nonce), true);
    assert.equal(nonces.verify(`${nonce.slice(0, -1)}x`), false);
    now += 9_999;
    assert.equal(nonces.verify(nonce), true);
    now += 1;
    assert.equal(nonces.verify(nonce), false);
  });
});
