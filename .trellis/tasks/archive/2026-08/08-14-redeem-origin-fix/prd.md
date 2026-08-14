# Redeem origin validation and proxy-chain fix

## Goal

Make a legitimate production invitation redemption succeed when the request is
same-origin but the reverse proxy does not expose the request protocol exactly
as Express derives it. Keep the redemption endpoint fail-closed for cross-site
and `null` origins.

## Requirements

- Compare a supplied `Origin` with the configured public FilmFrame origin, not
  with a protocol reconstructed from mutable proxy headers.
- Normalize only URL-equivalent origin spellings (default HTTPS port and a
  trailing slash); reject `null`, HTTP, other hosts, credentials, paths, query
  strings, and malformed values.
- Preserve the existing behavior for an omitted `Origin`: continue to the
  browser-binding Cookie/nonce checks.
- Keep the rejection before rate limiting, nonce consumption, invitation
  lookup, and invitation/session mutation.
- Make the public OpenResty template explicitly forward the incoming `Origin`
  and HTTPS protocol for the redemption route so the production contract is
  visible and deterministic.
- Add regression coverage for a canonical same-origin request with and
  without the forwarded protocol, equivalent HTTPS origin spellings, and
  cross-site/null origins.
- Do not log invitation plaintext, Cookies, nonces, JWTs, or request bodies.

## Acceptance Criteria

- [ ] A valid production-origin request reaches normal redemption validation
      (a fake code returns the generic HTML 400 page, not plain-text 403).
- [ ] Cross-site, `null`, HTTP, malformed, and other-host origins still return
      plain-text 403 before nonce consumption or invite mutation.
- [ ] Existing missing-Origin behavior and all current access-control tests
      remain unchanged.
- [ ] The tracked OpenResty template contains explicit `Origin` and
      `X-Forwarded-Proto https` forwarding for `/auth/redeem`.
- [ ] Access-service tests, type-check/build, deployment verification, and
      diff checks pass; production smoke probes confirm the same behavior.

## Notes

- The incident returned exactly `Forbidden` from the route's origin gate;
  invalid/expired invitations return a different HTML error response.
- Existing production traffic showed repeated 403s from the user's Edge
  client, while a direct same-origin probe with a fake code reached 400.
