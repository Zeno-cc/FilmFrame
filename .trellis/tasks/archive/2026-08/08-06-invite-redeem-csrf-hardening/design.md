# Login CSRF Hardening Design

## Threat Model

An attacker who owns a valid invitation can currently obtain a signed nonce
from `GET /access` and submit the invitation through a cross-site form. The
victim browser then receives a FilmFrame device session chosen by the attacker,
while the one-time invitation is consumed. The existing stateless nonce proves
freshness but is transferable between browsers.

## Design

1. `GET /access` creates a random browser-binding secret.
2. The server sets that secret in a short-lived host-only Cookie and passes it
   into `NonceStore.issue(binding)`.
3. The nonce signature covers its timestamp, random segment, and a digest of
   the binding secret. The binding value itself is never embedded in HTML.
4. `POST /auth/redeem` reads the binding Cookie and calls
   `NonceStore.consume(nonce, binding)` before touching the invitation store.
5. A valid pair is atomically marked used in a bounded in-memory replay cache.
6. The binding Cookie is cleared after successful redemption. Error rendering
   issues a new form and binding so retries do not reuse stale state.

`SameSite=Strict` prevents normal cross-site form requests from carrying the
binding Cookie. Cryptographic binding prevents a copied nonce from being used
in another browser, while the replay cache stops a client that retains the old
Cookie from using the pair with a second invitation.

## Cookie Contract

- Production name: `__Host-filmframe_redeem`
- Local HTTP name: `filmframe_redeem`
- `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`
- `Secure` follows the existing `SECURE_COOKIES` setting
- `Max-Age` matches the nonce validity window and remains short-lived

## Boundaries

- No database persistence is required; process restart invalidates outstanding
  forms, which is acceptable and fail-closed.
- The signing key and replay cache are process-local. The current deployment is
  intentionally single-instance; horizontal scaling requires shared state or
  sticky routing and is outside this release.
- Opening a new access page rotates the single temporary Cookie, so an older
  form in another tab may show the generic retry error. This fail-closed
  tradeoff is accepted for the anonymous gate.
- No change to invitation hashing, redemption transactions, device-session
  rotation, administrator routes, or OpenResty routing.
- No client-side JavaScript is needed for the protection.

## Validation

Add focused unit/integration coverage for normal redemption, cross-site Origin,
binding transfer, missing Cookie, tampering, atomic replay consumption, expiry,
bounded cleanup, Cookie attributes, multi-tab retry behavior, and invitation
non-consumption on validation failure. Then run the complete Access and
repository release gates.
