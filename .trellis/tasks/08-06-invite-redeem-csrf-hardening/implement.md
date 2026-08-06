# Login CSRF Hardening Implementation

1. Inspect the existing nonce, Cookie, access-page, and redemption boundaries.
2. Extend `NonceStore` with a required browser-binding input and atomic,
   bounded consume semantics while preserving canonical encoding, bounded
   inputs, constant-time verification, and expiry.
3. Add a small temporary redemption-Cookie helper consistent with the existing
   device-session Cookie conventions.
4. Update public routes to issue, verify, rotate, and clear the binding without
   logging secrets or consuming invitations on validation failure.
5. Add focused tests for the threat matrix and update the Access Control spec.
6. Run Access tests/typecheck/build, repository checks, proxy E2E, release
   contract, and `git diff --check` before commit.
