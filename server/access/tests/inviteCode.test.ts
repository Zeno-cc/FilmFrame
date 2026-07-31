import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatInviteCode,
  generateInviteCode,
  hashInviteCode,
  InvalidInviteCodeError,
  normalizeInviteCode,
} from "../src/inviteCode.js";

describe("invitation code", () => {
  it("generates a versioned 128-bit Crockford code", () => {
    const codes = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const generated = generateInviteCode();
      assert.match(generated.display, /^FF1-(?:[0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{2}$/);
      assert.equal(normalizeInviteCode(generated.display), generated.canonical);
      codes.add(generated.canonical);
    }
    assert.equal(codes.size, 200);
  });

  it("normalizes separators, case, and Crockford aliases before hashing", () => {
    const canonical = `FF1-${"0011".repeat(6)}00`;
    const aliased = ` ff1-${"OoIl".repeat(6)}Oo `;
    assert.equal(normalizeInviteCode(aliased), canonical);
    assert.deepEqual(hashInviteCode(aliased), hashInviteCode(canonical));
    assert.equal(normalizeInviteCode(formatInviteCode(canonical)), canonical);
  });

  it("rejects wrong versions, lengths, and alphabet characters", () => {
    for (const value of ["", "FF2-0000", "FF1-1234", `FF1-${"U".repeat(26)}`]) {
      assert.throws(() => normalizeInviteCode(value), InvalidInviteCodeError);
    }
  });
});
