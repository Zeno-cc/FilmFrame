# 邀请码兑换登录 CSRF 修复

## Goal

Prevent login CSRF on the public invitation redemption endpoint by binding the
signed form nonce to the browser that received the access page. Keep the flow
anonymous, dependency-free, and compatible with local HTTP development and
production HTTPS.

## Requirements

- `GET /access` must issue a short-lived, cryptographically random browser
  binding in an `HttpOnly`, `SameSite=Strict`, host-only Cookie and include a
  signed nonce bound to that value in the form.
- `POST /auth/redeem` must require the matching Cookie and signed nonce before
  attempting invitation redemption. A nonce copied to another browser or sent
  without its Cookie must fail without consuming the invitation.
- A valid nonce must be consumed atomically before invitation redemption. It
  must not authorize a second attempt even when a non-browser client retains
  and resends the old Cookie. The bounded replay cache must expire entries.
- A successful redemption must clear the temporary binding Cookie and create
  the existing persistent device-session Cookie. Failed submissions should
  receive a fresh access page and fresh binding so the user can retry safely.
- Production cookies must remain `Secure`; local HTTP development must remain
  testable with `SECURE_COOKIES=false`.
- Keep the existing generic public error behavior. Never log the invitation,
  nonce, binding Cookie, device-session Cookie, or request body.
- Do not add a database table, browser fingerprint, external dependency, CORS
  exception, or frontend-only authorization state.
- Exact Origin validation may be used as defense in depth, but the browser
  binding remains the primary protection and must work when Origin is absent.
  An Origin header that is cross-origin or `null` must be rejected before
  consuming the public redemption rate limit.

## Acceptance Criteria

- [x] A normal same-browser redemption succeeds and redirects to `/`.
- [x] A cross-site form submission with `Origin: https://evil.example` cannot
      redeem or consume a valid invitation.
- [x] A valid nonce moved to another browser or used without the matching
      Cookie cannot redeem or consume a valid invitation.
- [x] A nonce cannot be replayed after successful redemption or after expiry.
- [x] Concurrent requests carrying the same valid nonce allow at most one
      request to reach invitation redemption.
- [x] Malformed, oversized, or tampered nonce/binding values fail safely.
- [x] The temporary Cookie uses `HttpOnly`, `SameSite=Strict`, `Path=/`, no
      `Domain`, bounded `Max-Age`, and `Secure` only when configured.
- [x] Existing invite, session, rate-limit, proxy, and release-contract tests
      remain green.
- [x] The Access service test, typecheck, and build gates pass.

## Notes

- This is a release blocker for `v1.3.0`.
- Scope is limited to the public Access service and its automated tests/spec.
