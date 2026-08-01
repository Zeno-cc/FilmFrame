# Access Control

> Executable contracts for FilmFrame's invitation gateway and administrator service.

## Scenario: Server-Enforced Invitation Access

### 1. Scope / Trigger

Apply this contract whenever code changes invitation generation or redemption, browser sessions, administrator authentication, the access SQLite schema, Compose exposure, or either FilmFrame OpenResty vhost.

The access service protects distribution of the static application. It never receives photos, EXIF, film settings, Canvas output, or Blob URLs. A browser-side flag, route guard, embedded secret, or `localStorage` value is never an authorization boundary.

### 2. Signatures

```http
GET  /access
POST /auth/redeem
POST /auth/refresh
GET  /internal/session-check
GET  /healthz

GET  /api/invites
POST /api/invites
POST /api/invites/:id/revoke
GET  /api/invite-batches
POST /api/invite-batches
POST /api/invite-batches/:id/revoke
GET  /api/sessions
POST /api/sessions/:id/revoke
```

```sql
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  code_hash BLOB NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  redeem_by INTEGER NOT NULL,
  max_redemptions INTEGER NOT NULL,
  redemption_count INTEGER NOT NULL,
  last_redeemed_at INTEGER,
  revoked_at INTEGER,
  batch_id TEXT,
  batch_position INTEGER
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash BLOB NOT NULL UNIQUE,
  invite_id TEXT NOT NULL REFERENCES invites(id),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE invite_creation_requests (
  key_hash BLOB PRIMARY KEY,
  invite_id TEXT NOT NULL UNIQUE REFERENCES invites(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE invite_batches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE invite_batch_creation_requests (
  key_hash BLOB PRIMARY KEY,
  payload_hash BLOB NOT NULL,
  batch_id TEXT NOT NULL UNIQUE REFERENCES invite_batches(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE health_checks (
  id TEXT PRIMARY KEY,
  checked_at INTEGER NOT NULL
);
```

Required production environment keys:

```text
DATABASE_PATH
FILMFRAME_HOST
ADMIN_HOST
CF_ACCESS_TEAM_DOMAIN
CF_ACCESS_AUDIENCE
CF_ACCESS_ADMIN_EMAIL
SECURE_COOKIES=true
```

### 3. Contracts

- Generate invitation codes from 16 cryptographically random bytes and prefix the canonical Crockford Base32 value with `FF1-`. Persist only its SHA-256 hash.
- Redemption is a `BEGIN IMMEDIATE` transaction. A seven-day, one-use invitation creates one 256 bit opaque device session whose SHA-256 hash is stored with a 400-day rolling expiry.
- Invitation expiry blocks new redemption but does not end an already issued session. Revocation invalidates the invitation and all child sessions immediately.
- The production cookie is `__Host-filmframe_session` with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and a bounded `Max-Age`.
- `POST /auth/refresh` requires a valid unexpired session, the exact FilmFrame origin, and `X-FilmFrame-CSRF: 1`. In one immediate transaction it replaces the stored hash with a fresh 256 bit token hash, updates `last_seen_at` and the 400-day expiry, then sends the rotated token in the persistent Cookie. The old token becomes invalid as soon as the transaction commits.
- React calls the refresh endpoint once when the application starts. Do not expose a user logout command or public logout route: device authorization ends only when the administrator revokes the parent invitation, the session expires without another visit, or the user clears browser site data.
- Internal health and session-check routes accept only the internal Host plus a loopback/private proxy address. Public vhosts return `404` for `/healthz` and `/internal/*`.
- Every static application path, including known hashed assets, workers, overlays, and masks, passes through OpenResty `auth_request`. Access-service errors fail closed.
- The admin service accepts only a cryptographically verified Cloudflare Access assertion. Pin `RS256`, exact issuer, application audience, `exp`, `nbf`, and the configured administrator email.
- Admin writes require JSON, the exact admin Origin, and `X-FilmFrame-CSRF: 1`. Responses containing a newly generated plaintext code are `no-store`, and the code is never listed again.
- Invitation creation also requires a UUID `Idempotency-Key`. Concurrent or repeated requests with the same key create one invitation; replayed responses return metadata without plaintext.
- Batch creation accepts a strict name plus an integer count from 1 to 50. One immediate transaction creates the persisted batch, all hash-only invitations, and a payload-bound hashed idempotency record; a replay returns metadata without plaintext, while reuse with another normalized payload returns `409`.
- Batch generation has a second process-local limit of 100 generated codes per source IP per minute. Valid idempotent replays cost zero even after the budget is full, invalid input costs one, and accepted fresh requests cost their requested invitation count.
- Batch revocation is idempotent and transactional: it preserves history, revokes every non-revoked invitation in the batch, and revokes all child sessions immediately.
- Fresh invitation plaintext exists only in the first `201` response and transient administrator-page memory/DOM. CSV export prefixes spreadsheet formula-leading cells, and page exit or explicit clear removes the transient result.
- Successful creation and revocation writes emit structured production audit events containing request and target IDs plus affected counts, but never invitation plaintext, cookies, JWTs, request bodies, or administrator email.
- The admin API and SSH CLI may list non-secret session metadata and revoke one session by public UUID. Revoking an invitation still revokes all of its sessions.
- `/healthz` must prove SQLite write, read, and delete behavior in one transaction without leaving a health row behind.
- Daily SQLite online backups are written to `/opt/filmframe/backups/access`, outside the database volume. The long-running access service never mounts this directory. A short-lived `maintenance` profile job runs with no network, opens the source database with `readonly: true` and `fileMustExist: true`, writes the snapshot, normalizes it to `journal_mode=DELETE`, and exits. The source volume remains filesystem-writable only because a live WAL database may need `-wal`/`-shm` coordination even for a read-only SQLite connection; the backup CLI must not run migrations or application writes. Each backup is integrity-checked, checksummed, mode `0600`, and retained for 30 days using a strict filename and directory boundary. Restore rehearsals always target a new named volume.
- Restore validation opens the restored database read-only while leaving only that isolated target volume writable, because SQLite may create transient `-wal`/`-shm` coordination files during integrity checks. It must never mount or switch the production volume.
- Cloudflare policy supplies Google authentication restricted to the exact approved administrator email. The application does not require a separate Passkey/MFA challenge; Google secrets remain only in Google/Cloudflare configuration.
- Both containers publish only on loopback. The access container runs as a non-root user with a read-only root filesystem, all capabilities dropped, and a persistent `/data` volume using `0700` directory and `0600` SQLite file permissions.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Malformed, unknown, expired, revoked, or consumed invitation | Same generic failure; no session cookie |
| Two or more concurrent redemptions of a one-use invitation | Exactly one success |
| Missing, tampered, expired, or revoked session | Internal check returns `401` |
| Valid session refresh with exact Origin and CSRF header | `204`; a fresh token is issued, the old token fails immediately, and database/Cookie expiry extend by 400 days |
| Two concurrent refreshes using the same old token | Exactly one succeeds; the committed rotated token remains valid |
| Refresh with missing/wrong Origin or CSRF header | `403`; no database or Cookie mutation |
| Refresh for expired/tampered session or revoked invitation | `401`; no `Set-Cookie` |
| Request to legacy `/auth/logout` | `404`; device authorization remains server-controlled |
| Unknown public Host | `421` |
| Public request to an internal route | `404` |
| Missing or invalid admin Access assertion | `401` or `403`; no admin data |
| JWT missing `exp` or `nbf`, or using wrong issuer/audience/algorithm/email | Reject assertion |
| Missing exact Origin, JSON content type, or CSRF header on a write | Reject before mutation |
| Repeated invitation creation with the same idempotency key | One invitation; replay exposes no plaintext code |
| Batch count outside 1-50, fractional count, unknown field, or malformed security/idempotency input | `400`; no batch, invitation, or idempotency row |
| Repeated batch creation with the same key and normalized payload | One batch; replay exposes metadata only and remains available when generation quota is full |
| Repeated batch creation with the same key and a different payload | `409`; no additional row |
| Batch generation cost exceeds 100 codes for one IP in one minute | `429`; no data mutation |
| Batch invitation insertion fails | Entire batch, invitations, and idempotency record roll back |
| Repeated batch revocation | Existing history remains revoked; affected counts are zero on replay |
| Single-session revocation | Only that public session ID becomes invalid; sibling sessions remain unchanged |
| SQLite is readable but not writable | `/healthz` returns `503`; no health probe row remains |
| Long-running access process attempts to write `/backups` | Impossible because the bind mount is absent |
| Online backup of a live WAL database | Short-lived network-isolated job succeeds through a read-only SQLite connection, produces a `0600` DELETE-journal snapshot, and leaves the source rows unchanged |
| Access upstream timeout or `5xx` | Protected application remains unavailable; never serve static bytes |
| Runtime sprocket/photo/render activity | No request to the access service containing image data |

Production must confirm that the real Cloudflare Access assertion contains `nbf` before cutover. The verifier intentionally fails closed when a required claim is absent.

### 5. Good / Base / Bad Cases

- Good: an anonymous asset URL redirects to `/access`; one valid invitation establishes a device session; each application visit renews it; revoking its invitation makes the next request fail.
- Base: the static site remains a browser-only renderer after authorization, while the sidecar stores only access metadata.
- Bad: React checks an invitation against an environment variable or `localStorage`, then publicly serves the Vite bundle and overlay assets.
- Bad: a visible “logout” control clears the only one-use invitation session and forces the same device to obtain a new code.
- Bad: Cloudflare Access checks the admin UI at the edge, but the origin trusts the presence of `Cf-Access-Jwt-Assertion` without verifying its signature and claims.

### 6. Tests Required

- Unit tests cover invitation format/normalization, hash-only persistence, seven-day and 400-day rolling boundaries, atomic token rotation, concurrent refresh, tampering, single/cascade revocation, single and batch creation idempotency, batch atomic rollback/revocation, weighted limits, writable health probes, migration idempotency, and database reopen.
- Backup tests use a real named volume in WAL mode and assert that the maintenance job has no network, the long-running service has no backup mount, the CLI opens the source without migrations or SQL writes, the output is `0600`, and the normalized snapshot passes `integrity_check` from a read-only mount.
- Concurrency coverage sends 20 redemption attempts and asserts exactly one success.
- JWT tests cover valid identity, unknown key, wrong issuer/audience/email, tampering, expiry, future `nbf`, and missing `exp`/`nbf`.
- Route tests assert Cookie flags and 400-day `Max-Age`, generic redemption errors, refresh Origin/CSRF rules, rotated-token behavior, expired/revoked/tampered refresh rejection, single and batch idempotent creation, batch payload conflicts and weighted limits, redacted audit events, session listing/revocation, the absence of `/auth/logout`, body limits, Host allowlisting, and internal-route isolation.
- Browser tests assert one startup refresh request with the exact method/header contract, no visible logout command on desktop/mobile, and no interruption when renewal temporarily fails.
- Deployment checks assert loopback port bindings, the private Compose network, persistent data, a dedicated host backup mount, resource/log limits, read-only root, dropped capabilities, protected-resource `no-store`, authenticated `/auth/refresh`, absence of `/auth/logout`, OpenResty `auth_request`, and internal route blocks.
- Production validation additionally covers active `openresty -t`, Cloudflare cache bypass and purge, exact-email Google access without a separate application Passkey challenge, direct-origin rejection, access-service outage, public port refusal, and unrelated 1Panel vhosts.

### 7. Wrong vs Correct

#### Wrong

```ts
// Browser state is user-controlled and cannot protect application resources.
if (localStorage.getItem("invite") === import.meta.env.VITE_INVITE_CODE) {
  renderApplication();
}
```

```ts
// Header presence does not prove Cloudflare signed the identity.
if (request.headers["cf-access-jwt-assertion"]) showAdminPage();
```

#### Correct

```ts
const { payload } = await jwtVerify(token, remoteJwks, {
  algorithms: ["RS256"],
  issuer: expectedIssuer,
  audience: expectedAudience,
  requiredClaims: ["exp", "nbf"],
});
```

```nginx
location / {
    auth_request /_filmframe_session_check;
    error_page 500 502 503 504 = @filmframe_auth_unavailable;
    proxy_pass http://filmframe_static_backend;
}
```

```ts
// Correct: authorization remains server-owned and rolls forward without
// exposing the opaque token to React.
void fetch("/auth/refresh", {
  method: "POST",
  credentials: "same-origin",
  headers: { "X-FilmFrame-CSRF": "1" },
});
```

```yaml
# Wrong: the long-running service can modify host backups, while container root
# still cannot traverse a 0700 application volume after all capabilities drop.
access:
  volumes:
    - filmframe_access_data:/data
    - /opt/filmframe/backups/access:/backups
```

```yaml
# Correct: expose backups only to an explicit, network-isolated maintenance job.
access-backup:
  profiles: [maintenance]
  network_mode: none
  volumes:
    - filmframe_access_data:/data # WAL/SHM coordination; SQLite opens read-only
    - /opt/filmframe/backups/access:/backups
```
