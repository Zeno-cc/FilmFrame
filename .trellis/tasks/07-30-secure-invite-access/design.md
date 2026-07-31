# 安全邀请码访问门禁设计

## 1. Architecture

```text
FilmFrame visitor
  -> Cloudflare (cache bypass)
  -> OpenResty filmframe.astrocean.space
       -> auth_request -> access service /internal/session-check
       -> valid session -> FilmFrame static container
       -> invalid session -> access service invitation page

Administrator
  -> filmframe-admin.astrocean.space
  -> Cloudflare Access
       -> Google IdP exact-email policy
       -> Independent MFA WebAuthn
  -> OpenResty admin vhost
  -> access service
       -> validate Cf-Access-Jwt-Assertion
       -> invitation admin UI/API

Access service
  -> SQLite persistent volume
       -> invitation hashes
       -> session hashes
       -> migrations
```

The existing React renderer remains a static browser application. A new access sidecar owns invitation, session and admin behavior. OpenResty is the enforcement point for all FilmFrame resources; the access service is the source of truth.

## 2. Trust Boundaries

- **Trusted:** Cloudflare Access signing keys after JWT verification, the access service process, SQLite volume, OpenResty localhost proxy path and SSH operations.
- **Untrusted:** React state, localStorage, all browser input, request headers before signature validation, cookies before hash lookup, forwarded headers from the public network and shared caches.
- **External dependency:** Google proves the configured identity; Cloudflare Access enforces Google + Independent MFA and signs the application assertion.
- **Security limit:** once an authorized browser downloads the static application, local copying cannot be prevented without moving core processing server-side.

## 3. Repository Shape

```text
server/access/
  package.json
  package-lock.json
  tsconfig.json
  Dockerfile
  src/
    server.ts
    config.ts
    db.ts
    migrate.ts
    inviteCode.ts
    sessions.ts
    accessJwt.ts
    middleware/
    routes/
    views/
  migrations/
  tests/
ops/openresty/
  filmframe-auth.conf.example
  filmframe-admin.conf.example
scripts/
  verify-invite-deployment.mjs
```

`server/access` is a small independent TypeScript package using Express 5, `better-sqlite3`, `jose`, `zod`, `helmet` and focused rate limiting. Its own lockfile and TypeScript config keep server dependencies out of the Vite browser bundle. Root TypeScript excludes the nested package and root checks invoke the nested package explicitly.

The invitation page and admin console are server-rendered HTML with local CSS and minimal same-origin JavaScript. They do not import the main Vite application before authorization and do not load third-party runtime scripts.

## 4. Invitation Code

Generate 16 random bytes with `crypto.randomBytes`, encode them with the Crockford Base32 alphabet and prefix the canonical value with `FF1-`. Display grouped characters for readability while hashing only one normalized representation.

Normalization:

1. Trim and uppercase.
2. Remove spaces and hyphens after the `FF1` prefix.
3. Map Crockford aliases `O -> 0` and `I/L -> 1`.
4. Reject unexpected length or characters before hashing.
5. Hash the complete canonical versioned value with SHA-256.

The code has at least 128 bit entropy, so an unsalted hash does not create a practical offline dictionary attack. Plaintext exists only in process memory and the single successful creation response; it is never persisted or logged.

## 5. Data Model

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  code_hash BLOB NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  redeem_by INTEGER NOT NULL,
  max_redemptions INTEGER NOT NULL DEFAULT 1,
  redemption_count INTEGER NOT NULL DEFAULT 0,
  last_redeemed_at INTEGER,
  revoked_at INTEGER
);

CREATE TABLE sessions (
  token_hash BLOB PRIMARY KEY,
  invite_id TEXT NOT NULL REFERENCES invites(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
```

Use random UUIDs for public resource IDs. Enable `foreign_keys=ON`, WAL, a bounded busy timeout and an appropriate synchronous mode. The database directory is a persistent volume with access restricted to the service account.

Expired rows may be pruned by a periodic maintenance command, but expiry checks never depend on cleanup having run.

## 6. Atomic Redemption

`POST /auth/redeem` performs this transaction:

1. Normalize and hash the submitted code.
2. Start `BEGIN IMMEDIATE`.
3. Read the invite by `code_hash`.
4. Reject missing, expired, revoked or exhausted records using one external error response.
5. Conditionally increment `redemption_count` and set `last_redeemed_at`.
6. Generate a 256 bit opaque session token, store only its SHA-256 hash and a 400 day rolling expiry.
7. Commit, then set the session Cookie and redirect to `/` with HTTP 303.

Any error rolls back the transaction and emits no session Cookie. The conditional update is the final concurrency guard, so parallel redemption produces one success.

Invite expiry controls redemption only. Session checks join the session to its invite and reject session expiry, session revocation or invite revocation. A valid same-origin refresh request extends both the server expiry and persistent Cookie by 400 days. Revoking an invite updates the invite and all active child sessions in one transaction.

## 7. User Session And Routes

Public FilmFrame host routes:

| Route | Access | Behavior |
| --- | --- | --- |
| `GET /access` | Public | Server-rendered invitation form with a short-lived anti-CSRF form nonce |
| `POST /auth/redeem` | Public + nonce | Validate and atomically redeem invite |
| `POST /auth/refresh` | Session + Origin | Extend the current device session and persistent Cookie |
| `GET /internal/session-check` | Loopback only | Return 204 for valid session, 401 otherwise |
| `GET /healthz` | Loopback only | Process and database readiness |

Cookie name: `__Host-filmframe_session`. Production attributes: `Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=34560000`. Development can explicitly disable `Secure` only on local HTTP. The 400 day interval matches current browser persistent-Cookie limits and is renewed whenever the application starts.

The app has no logout command that can accidentally destroy device authorization. On startup it submits a fixed same-origin refresh command without exposing the Cookie to React.

## 8. Admin Authentication And Routes

Cloudflare Access configuration for `filmframe-admin.astrocean.space`:

- Google IdP with External audience and PKCE.
- Allow policy: Include the exact administrator email; Require Google login method.
- Independent MFA methods: biometrics and security key only.
- `Use identity provider MFA` / AMR substitution disabled.
- Access and MFA session duration: 8 hours.
- At least two WebAuthn credentials enrolled through the App Launcher.

Access service middleware validates `Cf-Access-Jwt-Assertion` using `jose.createRemoteJWKSet` and the team JWKS. It pins RS256, issuer and the admin application's audience, validates time claims and matches the configured administrator identity. JWKS caching refreshes on unknown `kid`; absence of a valid key fails closed.

Admin routes:

| Route | Behavior |
| --- | --- |
| `GET /` | Responsive invite status table and fixed-policy create form |
| `GET /api/invites` | Return IDs, labels, timestamps, status and counts only |
| `POST /api/invites` | Create one 7-day, one-use invite; return plaintext once |
| `POST /api/invites/:id/revoke` | Revoke invite and active sessions atomically |

Every route validates Access JWT server-side. Writes require exact admin origin, JSON content type and a custom CSRF header; credentialed CORS is disabled. The create response uses `Cache-Control: no-store` and the UI clears plaintext from memory when the one-time result closes.

The compact management UI uses a restrained table/list, clear active/redeemed/expired/revoked states, one primary generate command, a copy command and a confirmed destructive revoke command. It supports 390px mobile without horizontal overflow.

## 9. OpenResty Enforcement

The FilmFrame vhost defines an internal auth subrequest that forwards only the session Cookie to the loopback access service. Every application path invokes `auth_request`. The public gate and redeem routes proxy to the access service explicitly; internal routes cannot be reached from the network.

Unauthenticated navigation redirects to `/access`; asset requests may return 401/403 or a redirect, but never the requested bytes. Access service errors and timeouts return 503/401, never pass through to the static container.

The admin vhost proxies to the same loopback service. It does not treat Cloudflare IP, Host or `Cf-Access-*` header presence as authorization; the Node middleware performs cryptographic JWT validation.

OpenResty overwrites forwarded host/protocol/IP headers. Express trusts only loopback/private proxy addresses, not arbitrary `X-Forwarded-*` input.

## 10. Cache And Origin Hardening

- Change the FilmFrame mapping from `18082:80` to `127.0.0.1:18082:80`.
- Bind the access service to `127.0.0.1:18083` or a private Compose network.
- Remove the public firewall allowance for the application port and verify Docker is not publishing on `0.0.0.0` or `[::]`.
- Set Cloudflare cache bypass for the complete FilmFrame hostname before cutover, then purge existing hostname cache.
- Override protected responses with `Cache-Control: private, no-store`; do not cache auth subrequests.
- Reject unknown Host values in the access service.

Direct origin requests still reach OpenResty, but cannot pass the FilmFrame session check or forge a valid admin Access JWT.

## 11. Security Baseline

- `helmet()` with a strict CSP; no external scripts in access/admin pages.
- Explicit small body limits and schema validation at every route.
- Fixed same-origin redirects only; no `returnTo` URL from users.
- Application and edge rate limits on invite redemption; admin endpoints inherit Access and add conservative service limits.
- Custom production error and 404 responses; no stack traces or credential values.
- `x-powered-by` disabled.
- No CORS unless a later requirement introduces a reviewed origin allowlist.
- Structured logs contain event names and random IDs only, with header/body redaction.
- Dependency lockfile, production-only install and a non-root runtime container.

## 12. Deployment And Rollback

Deployment order prevents an insecure intermediate state:

1. Back up current Compose/OpenResty configs and database destination.
2. Build and start the access service on loopback; run migrations and health checks.
3. Bind the existing static container to loopback and remove public port access.
4. Configure Google IdP, exact-email Access policy and Independent MFA; enroll two credentials.
5. Create the admin DNS/vhost and validate Google + Passkey, JWT rejection and direct-origin rejection.
6. Apply FilmFrame cache bypass, purge existing cache and verify anonymous old asset URLs do not return cached bytes.
7. Apply the FilmFrame `auth_request` vhost and run the complete anonymous/authorized matrix.

Rollback restores the previous application image or vhost template while retaining loopback-only ports, cache bypass and an authenticated/maintenance response. Rollback must never reopen the public application port or restore anonymous access as a shortcut.

SQLite is backed up before migrations and on a schedule. A restore drill must prove invite, session and revocation state survives replacement of the access container.

## 13. Alternatives Rejected

- React/localStorage gate: client-side and trivially bypassed.
- Shared static invitation password: extractable or brute-forceable and not individually revocable.
- Google OR Passkey: security collapses to the weaker path and requires two account systems.
- Direct Google OAuth in the app: duplicates callback, token and secret handling already provided by Cloudflare Access.
- Cloudflare-only enforcement without origin JWT/session validation: bypassable through direct origin access.
- Moving rendering server-side: conflicts with the local-photo privacy boundary.
