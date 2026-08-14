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

```ts
NonceStore.issue(binding: string): string
NonceStore.consume(nonce: string, binding: string): boolean

// Canonical wire format; Base64URL segments are unpadded.
// <base36 timestamp>.<16 random bytes / 22 chars>.<HMAC-SHA256 / 43 chars>
// binding is exactly 32 random bytes / 43 canonical Base64URL chars.
```

```sql
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  code_hash BLOB NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  redeem_from INTEGER NOT NULL,
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
- `GET /access` creates a 32-byte browser binding and stores only that value in
  a short-lived, host-only, `HttpOnly`, `SameSite=Strict`, `Path=/` redemption
  Cookie. Production uses `__Host-filmframe_redeem` with `Secure`; local HTTP
  uses `filmframe_redeem` without `Secure`. Both omit `Domain` and expire with
  the form nonce.
- Invitation-form nonces are bounded to 128 characters and signed with a
  process-local 256 bit HMAC key over the timestamp, random segment, and a
  digest of the canonical browser binding. `NonceStore.consume` requires the
  exact 43-character unpadded Base64URL binding, verifies canonical nonce
  encoding and signature in constant time, then atomically records the nonce
  as used before invitation redemption begins.
- Consumed nonces live in a bounded, TTL-cleaned process-local replay map. A
  replay, expired value, invalid binding, or full replay map fails closed. A
  process restart invalidates outstanding forms. The current deployment is
  single-instance; horizontal scaling requires shared replay/signing state or
  verified sticky routing.
- `POST /auth/redeem` rejects a present Origin unless its normalized URL origin
  equals the configured `AccessConfig.publicOrigin` in production. The
  normalization accepts only URL-equivalent spellings (host case, a trailing
  slash, and the default HTTPS port); it rejects HTTP, paths, credentials,
  query/fragment components, malformed values, other hosts, and `null`.
  Development keeps the local HTTP host/port behavior. A missing Origin is
  allowed to continue to the required Cookie/nonce check. Origin is checked
  before the redemption rate limiter so cross-site traffic cannot spend
  another browser's quota. The public `/auth/redeem` OpenResty location must
  explicitly forward `Origin $http_origin` and `X-Forwarded-Proto https`.
- Failed form or invitation validation never consumes an invitation and
  renders a fresh form with a rotated binding. Successful redemption sets the
  persistent device-session Cookie and clears the temporary redemption Cookie.
  Opening another `/access` page rotates the one temporary Cookie, so an older
  tab may receive the generic retry error; this is an accepted fail-closed
  behavior.
- Redemption is a `BEGIN IMMEDIATE` transaction. A one-use invitation creates one 256 bit opaque device session whose SHA-256 hash is stored with a 400-day rolling expiry. The transaction accepts both the `redeem_from` and `redeem_by` boundary instants and rejects any instant outside them.
- Invitation creation accepts optional timezone-qualified ISO 8601 `redeemFrom` and `redeemBy` values. Omitted values mean immediate start and a seven-day window; a start-only request ends seven days after its start, while an end-only request starts at creation. The end must be strictly later than the start.
- Invitation lifecycle is derived at read time in the order `revoked`, `redeemed`, `scheduled`, `expired`, `active`. Administrator metadata exposes `redeemable` only when the derived state is `active`, plus the number of unexpired, non-revoked child sessions. No time-dependent availability boolean is persisted.
- Invitation expiry blocks new redemption but does not end an already issued session. Revocation invalidates the invitation and all child sessions immediately.
- The production cookie is `__Host-filmframe_session` with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and a bounded `Max-Age`.
- `POST /auth/refresh` requires a valid unexpired session, the exact FilmFrame origin, and `X-FilmFrame-CSRF: 1`. In one immediate transaction it keeps the existing opaque token hash, updates `last_seen_at` and the 400-day expiry, then re-sends the same token in the persistent Cookie. A lost, aborted, or delayed refresh response therefore cannot invalidate the browser's still-valid Cookie. Expired, revoked, and tampered sessions remain rejected.
- React calls the refresh endpoint once when the application starts. Do not expose a user logout command or public logout route: device authorization ends only when the administrator revokes the parent invitation, the session expires without another visit, or the user clears browser site data.
- Internal health and session-check routes accept only the internal Host plus a loopback/private proxy address. Public vhosts return `404` for `/healthz` and `/internal/*`.
- Every static application path, including known hashed assets, workers, overlays, and masks, passes through OpenResty `auth_request`. Access-service errors fail closed.
- The admin service accepts only a cryptographically verified Cloudflare Access assertion. Pin `RS256`, exact issuer, application audience, `exp`, `nbf`, and the configured administrator email.
- Admin writes require JSON, the exact admin Origin, and `X-FilmFrame-CSRF: 1`. Responses containing a newly generated plaintext code are `no-store`, and the code is never listed again.
- Invitation creation also requires a UUID `Idempotency-Key`. Concurrent or repeated requests with the same key create one invitation; replayed responses return metadata without plaintext.
- Batch creation accepts a strict name, an integer count from 1 to 50, and the same optional schedule fields. One immediate transaction creates the persisted batch, all hash-only invitations sharing one window, and a payload-bound hashed idempotency record; a replay returns metadata without plaintext, while reuse with another normalized payload or schedule intent returns `409`.
- Batch generation has a second process-local limit of 100 generated codes per source IP per minute. Valid idempotent replays cost zero even after the budget is full, invalid input costs one, and accepted fresh requests cost their requested invitation count. Weight calculation must reuse the complete strict batch-creation schema, including optional schedule fields; adding a valid optional field must never make a request fall back to cost one.
- Batch revocation is idempotent and transactional: it preserves history, revokes every non-revoked invitation in the batch, and revokes all child sessions immediately.
- Fresh invitation plaintext exists only in the first `201` response and transient administrator-page memory/DOM. CSV export prefixes spreadsheet formula-leading cells, and page exit or explicit clear removes the transient result.
- Successful creation and revocation writes emit structured production audit events containing request and target IDs plus affected counts, but never invitation plaintext, cookies, JWTs, request bodies, or administrator email.
- The admin API and SSH CLI may list non-secret session metadata and revoke one session by public UUID. Revoking an invitation still revokes all of its sessions.
- `/healthz` must prove SQLite write, read, and delete behavior in one transaction without leaving a health row behind.
- Daily SQLite online backups are written to `/opt/filmframe/backups/access`, outside the database volume. The long-running access service never mounts this directory. A short-lived `maintenance` profile job runs with no network, opens the source database with `readonly: true` and `fileMustExist: true`, writes the snapshot, normalizes it to `journal_mode=DELETE`, and exits. The source volume remains filesystem-writable only because a live WAL database may need `-wal`/`-shm` coordination even for a read-only SQLite connection; the backup CLI must not run migrations or application writes. Each backup is integrity-checked, checksummed, mode `0600`, and retained for 30 days using a strict filename and directory boundary. Restore rehearsals always target a new named volume.
- Restore validation opens the restored database read-only while leaving only that isolated target volume writable, because SQLite may create transient `-wal`/`-shm` coordination files during integrity checks. It must never mount or switch the production volume.
- Cloudflare policy supplies Google authentication restricted to the exact approved administrator email. The application does not require a separate Passkey/MFA challenge; Google secrets remain only in Google/Cloudflare configuration.
- Public device recovery uses server-bound WebAuthn challenges and stored Passkey credentials. Options and verification routes have independent source-IP rate limits; the maintenance command removes expired or consumed challenges so the challenge table cannot grow without bound. Passkey recovery creates a new session without incrementing invitation redemption count, and invitation or credential revocation immediately blocks recovery.
- Both containers publish only on loopback. The access container runs as a non-root user with a read-only root filesystem, all capabilities dropped, and a persistent `/data` volume using `0700` directory and `0600` SQLite file permissions.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Malformed, unknown, not-yet-active, expired, revoked, or consumed invitation | Same generic failure; no session cookie |
| Missing/malformed redemption Cookie, nonce transfer to another binding, bad segment count, invalid timestamp/random syntax, non-canonical Base64URL signature, digest mismatch, replay, future timestamp beyond skew, expiry, or replay-map capacity exhaustion | Reject nonce, rotate the form binding, and perform no invitation or session mutation |
| Redemption with a cross-site or `null` Origin | `403` before rate limiting, nonce consumption, or invitation mutation |
| Redemption without Origin but with a matching Cookie/nonce pair | Continue normal validation; Origin is defense in depth, not the primary browser binding |
| Two concurrent redemptions using the same nonce and binding | At most one reaches invitation redemption; the other receives the generic failure |
| Start or end boundary instant | Redemption is allowed; one millisecond outside the window is rejected |
| Missing, malformed, timezone-free, reversed, or zero-length creation window | `400`; no invitation, batch, or idempotency row |
| Two or more concurrent redemptions of a one-use invitation | Exactly one success |
| Missing, tampered, expired, or revoked session | Internal check returns `401` |
| Valid session refresh with exact Origin and CSRF header | `204`; the same opaque token is re-sent and database/Cookie expiry extend by 400 days |
| Two concurrent refreshes using the same token | Both may succeed; the token remains valid and the latest rolling expiry is authoritative |
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
| Valid scheduled batch creation | Charge the requested invitation count against the 100-code window, exactly like an unscheduled batch |
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
- Good: a freshly issued nonce works once with the exact browser binding, then
  rejects replay even if the client retains both the old nonce and Cookie.
- Base: the static site remains a browser-only renderer after authorization, while the sidecar stores only access metadata.
- Base: a non-browser client without Origin can redeem only after preserving
  the temporary Cookie from `/access`; the same nonce without that Cookie fails.
- Bad: decode a signature with `Buffer.from(value, "base64url")` and compare
  only its bytes; permissive aliases can represent the same digest with a
  different final character.
- Bad: treat a fresh signed nonce as transferable proof, or rely on
  `SameSite=Strict` without cryptographically binding the form to its Cookie.
- Bad: React checks an invitation against an environment variable or `localStorage`, then publicly serves the Vite bundle and overlay assets.
- Bad: a visible “logout” control clears the only one-use invitation session and forces the same device to obtain a new code.
- Bad: Cloudflare Access checks the admin UI at the edge, but the origin trusts the presence of `Cf-Access-Jwt-Assertion` without verifying its signature and claims.

### 6. Tests Required

- Unit tests cover invitation format/normalization, hash-only persistence, configurable schedule defaults and inclusive boundaries, all five lifecycle states, 400-day rolling boundaries, atomic token rotation, concurrent refresh, tampering, single/cascade revocation, active-device counts, single and batch creation idempotency, batch atomic rollback/revocation, weighted limits, writable health probes, legacy schedule migration, migration idempotency, and database reopen.
- Nonce tests assert binding scope, canonical 32-byte binding syntax,
  single-use atomic consumption, signature mutation rejection even when a
  permissive decoder maps it to the same bytes, the last valid millisecond,
  exclusive expiry, bounded replay capacity, and recovery after TTL cleanup.
- Backup tests use a real named volume in WAL mode and assert that the maintenance job has no network, the long-running service has no backup mount, the CLI opens the source without migrations or SQL writes, the output is `0600`, and the normalized snapshot passes `integrity_check` from a read-only mount.
- Concurrency coverage sends 20 invitation attempts and separately sends two
  requests with the same nonce/binding, asserting exactly one request can
  consume each one-use boundary.
- JWT tests cover valid identity, unknown key, wrong issuer/audience/email, tampering, expiry, future `nbf`, and missing `exp`/`nbf`.
- Route tests assert temporary redemption-Cookie names/flags/TTL, production
  and local HTTP behavior, configured-origin equivalence (including the
  default HTTPS port and trailing slash) without a forwarded protocol,
  missing/wrong binding, cross-site/HTTP/`null`/same-site/malformed/missing
  Origin behavior, replay and multi-tab refresh stability, invitation
  non-consumption on validation failure, persistent Cookie flags and 400-day
  `Max-Age`, generic redemption errors, refresh Origin/CSRF rules,
  rotated-token behavior, expired/revoked/tampered refresh rejection, single
  and batch idempotent creation, batch payload conflicts and weighted limits,
  redacted audit events, session listing/revocation, absence of `/auth/logout`,
  body limits, Host allowlisting, and internal-route isolation.
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

```ts
// Wrong: byte equality alone accepts non-canonical Base64URL aliases.
const received = Buffer.from(signature, "base64url");
return timingSafeEqual(received, expected);
```

```ts
// Wrong: a signed but transferable nonce does not bind redemption to the
// browser that loaded the form.
const nonce = nonces.issue();
if (nonces.verify(nonce)) redeemInvite(code);
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

```ts
// Correct: require one canonical text representation before comparing bytes.
const received = Buffer.from(signature, "base64url");
return received.toString("base64url") === signature
  && received.length === expected.length
  && timingSafeEqual(received, expected);
```

```ts
// Correct: consume one browser-bound nonce before touching invitation state.
const binding = readRedeemCookie(request, config);
if (!binding || !nonces.consume(nonce, binding)) {
  return renderFreshAccessForm();
}
redeemInvite(code);
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

## Scenario: Trusted Host Updates

### 1. Scope / Trigger

Apply this contract whenever code changes the GitHub Release workflow, release
manifest, `ops/updater`, administrator update APIs/UI, updater socket mount, or
FilmFrame deployment/backup Compose behavior.

The updater is a root-capable host control plane. The Access service is only an
authenticated, schema-validating bridge: it never receives the Docker socket,
SSH credentials, release directories, arbitrary commands, paths, image names,
URLs, environment keys, or raw updater logs.

### 2. Signatures

Stable Release manifests use `manifestVersion: 1` and bind a semantic version,
40-character commit, two GHCR image digests, one checksummed deploy bundle,
updater compatibility, database compatibility, Chinese release notes, and the
exact GitHub repository/workflow identity.

The Unix socket protocol accepts only these actions:

```text
check({ force?: boolean }) -> SystemUpdate
create_job({ version, idempotencyKey, actorHash }) -> UpdateJob
get_job({ jobId }) -> UpdateJob
get_active_job({}) -> UpdateJob | null
list_history({ limit?: 1..50 }) -> { jobs: UpdateJob[] }
```

Access exposes the corresponding administrator-only HTTP surface:

```http
GET  /api/system-update
POST /api/system-update/check
POST /api/system-update/jobs
GET  /api/system-update/jobs/:id
GET  /api/system-update/history?limit=20
```

`POST /jobs` and `GET /jobs/:id` wrap the validated socket result as `{ job }`.
The socket result itself is the direct `UpdateJob` or `null`, without another
`{ job }` envelope.

Required application wiring:

```text
FILMFRAME_UPDATER_ENABLED=false
FILMFRAME_UPDATER_GID=<host filmframe-updater-client GID>
FILMFRAME_UPDATER_TIMEOUT_MS=3000
FILMFRAME_UPDATER_SOCKET=/run/filmframe-updater/updater.sock
```

The host bootstrap command is intentionally deployment-specific:

```bash
sudo ops/updater/install.sh --origin-ip <IPv4>
```

The argument is required, validated before filesystem or systemd mutation, and
stored only in the root-owned `/etc/filmframe-updater/config.json`.

The updater service keeps the host filesystem read-only and gives external
verification tools one systemd-managed cache boundary:

```ini
ProtectSystem=strict
CacheDirectory=filmframe-updater
CacheDirectoryMode=0700
Environment=XDG_CACHE_HOME=/var/cache/filmframe-updater
```

Public releases verify without giving credentials to the GitHub CLI. The
updater fetches attestations from the fixed repository API, writes only the
returned Sigstore v0.3 `bundle` objects to a mode `0600` JSONL file, and runs
`gh attestation verify --bundle <file>` with `GH_TOKEN` and `GITHUB_TOKEN`
removed from the subprocess environment. If GitHub rate limits the host, the
HTTP client may load a repository-scoped read-only token from its root-owned
environment file:

```text
GH_TOKEN=<contents:read token for Zeno-cc/FilmFrame only>
```

The host updater owns `/var/lib/filmframe-updater`,
`/run/filmframe-updater/updater.sock`, `/opt/filmframe/releases`, and the
`/opt/filmframe/current` symlink. It uses the fixed Compose project name
`filmframe` for every Compose command and backup helper invocation.

### 3. Contracts

- Publish only protected stable tags. Never install from `main`, a prerelease,
  a mutable image tag, or `latest`.
- Every service started by the Release proxy integration stack must expose an
  enabled healthcheck because the workflow uses `docker compose up --wait`.
  Probe servers must check their local HTTP listener, and utility clients must
  prove the fixed proxy target is reachable; `healthcheck.disable: true` is not
  an accepted placeholder.
- The public repository uses an active Ruleset that restricts creation,
  update, and deletion of `v*.*.*` tags. Artifact attestations remain mandatory.
- Release metadata and binaries are fetched through the fixed
  `api.github.com/repos/Zeno-cc/FilmFrame` endpoints. The updater sends
  `GH_TOKEN` only to `api.github.com`, resolves each expected asset by its exact
  name and browser URL, validates the fixed asset API path, and strips
  `Authorization` before every cross-host redirect to GitHub's asset CDN.
- Attestations are fetched only from
  `GET /repos/Zeno-cc/FilmFrame/attestations/sha256:<digest>`. File subjects use
  their locally computed SHA-256; OCI subjects must exactly match one of the
  two manifest-pinned `oci://...@sha256:<digest>` values. The response is
  bounded to 4 MiB and 1..8 unique Sigstore v0.3 bundles, rejects redirects and
  unknown fields, and is passed to `gh` only through a mode `0600` JSONL file.
  `gh` must never fetch attestations itself or inherit GitHub credentials.
- Verify the canonical manifest, bundle checksum, immutable image digests, OCI
  revision labels, GitHub OIDC artifact attestations, repository, workflow, and
  release URL before staging.
- The socket request is at most 16 KiB and the response is at most 64 KiB. Both
  envelopes reject duplicate or unknown fields and require matching UUIDs.
- Socket filesystem access uses the `filmframe-updater-client` group, but peer
  identity authorization uses Linux `SO_PEERCRED` UID only. A matching primary
  or supplementary GID never authorizes a caller.
- Access mounts only the writable `/data` named volume and the read-only
  `/run/filmframe-updater` directory. It never mounts `/var/run/docker.sock`,
  `/opt/filmframe`, backup storage, or SSH data.
- Admin reads and writes retain Cloudflare JWT and exact-email verification.
  Writes additionally require exact Origin, JSON, CSRF, bounded rate limits,
  and UUID idempotency. Responses are `no-store`; audit events contain only
  safe IDs, stages, versions, counts, and fixed errors.
- `create_job` replays an existing idempotency-key result or same-target active
  job before resolving the current release. This remains correct after a
  successful switch makes the requested version current.
- The updater persists jobs and events in SQLite, enforces one active task, and
  serializes deployment with `flock`. `recovery_required` remains active and
  blocks new jobs until an operator repairs the host.
- Preflight requires Docker, `/usr/bin/curl`, valid OpenResty configuration,
  at least 2 GiB free space, healthy current services, compatible schema, and a
  Compose config whose public ports remain loopback-only.
- Bootstrap installation must prove that the installed GitHub CLI supports
  `gh attestation verify`; finding a `gh` executable alone is insufficient.
- Run real `gh` verification inside the installed systemd sandbox.
  `ProtectSystem=strict` remains enabled, while `CacheDirectory` supplies the
  only writable Sigstore cache and `XDG_CACHE_HOME` prevents fallback to the
  protected `/root/.cache` path. Do not add `/root` or broad system paths to
  `ReadWritePaths`.
- `install.sh` requires an explicit `--origin-ip <IPv4>` value before making
  host changes. The repository contains no deployment-specific origin default;
  missing config, missing `originIp`, IPv6, and malformed values fail closed.
- The first managed update may accept a safe legacy current Access service
  that mounts only `/data` and has no updater group. Every candidate release,
  and every already managed current release, must have the exact read-only
  updater socket mount and the configured dynamic updater group. All other
  Compose hardening, service, port, and data-volume checks remain identical.
- The `filmframe`, `access`, and `access-backup` services are the only accepted
  release services. `access` and `access-backup` must resolve to the same data
  volume, but the volume name is not hardcoded because a validated restore may
  switch both services to `filmframe_access_restore_*`.
- Migration rehearsal restores a verified backup into a fresh volume, starts
  the candidate Access image with no network and a read-only root filesystem,
  waits for health, verifies the expected schema, and always removes its
  temporary container and volume.
- Cutover takes a fresh verified backup, atomically switches `current`, then
  validates container identity, schema, loopback, origin, and public HTTPS.
- Post-switch failure automatically restores the previous application release
  and reruns all gates. It never restores SQLite automatically. A failed
  rollback becomes `recovery_required`.
- Startup reconciliation trusts the actual `current` symlink, container
  revision, health, and persisted staged release together. Matching revision
  alone is insufficient to resume verification.
- Keep `FILMFRAME_UPDATER_ENABLED=false` until the updater is installed and a
  real signed test Release plus injected-health-failure rollback rehearsal has
  passed on the production host.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Mutable image tag, wrong repository/workflow/ref, bad attestation/checksum, or unsafe redirect | `release_untrusted`; no staging or switch |
| Proxy integration service has no enabled healthcheck | Release quality gate fails during `docker compose up --wait`; no image or Release is published |
| Missing/untrusted updater config, absent `originIp`, malformed input, or IPv6 | Installer/config load fails closed; no deployment-specific fallback is used |
| Private Release request without a valid read-only token | `updater_unavailable`; cached status may remain visible, no staging or switch |
| Attestation API redirect, malformed/oversized response, zero or excess bundles, duplicate bundle, wrong media type, subject digest mismatch, or failed offline verification | `release_untrusted`; no staging or switch |
| Duplicate/mismatched asset, non-API asset path, or credential-bearing CDN redirect | `release_untrusted`; no token leaves `api.github.com` |
| Unknown, same, or lower version | `release_not_found`; no job |
| Existing idempotency key or same-target active task | Return the persisted job before current-version checks |
| Different target while another task is active | `update_busy`; no second job |
| Updater version below `minUpdaterVersion` | `updater_upgrade_required`; manual host maintenance only |
| Schema mismatch, destructive migration, or incompatible rollback floor | `migration_incompatible`; no switch |
| Caller has only the socket group GID but not an allowed UID | `peer_forbidden` |
| Extra service, Docker/deployment bind mount, public port, Access/backup volume mismatch, or unpinned Compose project | `preflight_failed` |
| Candidate missing updater socket/group, or managed current with a partial updater mount | `preflight_failed`; only the exact data-only legacy current shape is accepted |
| Installed `gh` lacks `attestation verify` | Installer exits before writing updater files or enabling units |
| Missing/unwritable updater cache under `ProtectSystem=strict` | Offline `gh` verification fails closed as `release_untrusted`; no staging or switch |
| Failure before `switching` | `failed_pre_switch`; current release remains unchanged |
| Failure after `switching` and successful application rollback | `rolled_back`; forward-expanded SQLite remains in place |
| Failed rollback or unverifiable host truth after restart | `recovery_required`; retain the active lock |
| Browser disconnect during switching | Continue the host job; polling later recovers persisted state |
| Updater unavailable or malformed/oversized response | Fixed redacted HTTP error; no raw socket text reaches the browser |

### 5. Good / Base / Bad Cases

- Good: an authenticated administrator confirms one stable signed Release; the
  updater rehearses migration, backs up, switches by digest, proves every gate,
  and the page recovers the persisted success after an Access restart.
- Good: every proxy-test service becomes healthy under `docker compose up
  --wait`, including probe and utility containers with explicit Node checks.
- Base: the updater is installed but the application flag remains disabled;
  the existing SSH deployment and restore procedures remain available.
- Good: a private Release token is read only by the host service, authenticates
  the fixed GitHub API, and is removed before following the signed asset URL or
  starting any subprocess.
- Good: the updater downloads bounded attestation bundles for the exact subject
  digest and asks `gh` to verify the local JSONL bundle with the pinned
  repository, workflow, tag ref, source commit, issuer, and runner policy.
- Good: systemd creates a mode `0700` updater cache and `gh` succeeds with the
  same `ProtectSystem=strict`, `ProtectHome`, and `PrivateTmp` boundaries used
  by production.
- Good: deployment inventory supplies `--origin-ip`; the installer validates it
  before mutation and writes it only to the root-owned host config.
- Base: the public Release requires no token and the updater flag remains off
  until production rollback rehearsal succeeds.
- Bad: Access mounts the Docker socket and runs `docker compose` itself.
- Bad: a helper container disables its healthcheck while the Release workflow
  waits for the whole Compose project to become healthy.
- Bad: source code, an installer template, or a dataclass default contains the
  production origin IP, or missing config silently falls back to one.
- Bad: the updater sends `GH_TOKEN` to `github.com`, a CDN host, or a manifest-
  supplied URL, lets `gh` fetch attestations with an authenticated session, or
  treats a legacy current Compose shape as permission to weaken candidate
  validation.
- Bad: make `/root`, `/usr`, `/etc`, or `/opt` writable so a third-party CLI can
  create its default cache.
- Bad: the page installs `latest`, follows `main`, accepts a request-provided
  manifest URL, or treats a network disconnect as update failure.
- Bad: rollback replaces the production SQLite database automatically.

### 6. Tests Required

- Release contract tests reject mutable tags, wrong identity, malformed notes,
  unsafe asset URLs, mismatched schema metadata, and non-deterministic bundles.
- Proxy integration tests must start with `docker compose up --wait`, assert
  every helper reaches `healthy`, exercise the real auth-request path, and
  remove containers, networks, and volumes in cleanup.
- Protocol tests cover exact fields, duplicate JSON keys, 16/64 KiB bounds,
  UUID matching, fixed actions, UID authorization, and GID-only rejection.
- Store/application tests cover one active task, payload-bound idempotency,
  same-target replay after cutover, monotonic states, restart reconciliation,
  cleanup, pre/post-switch failure, rollback, and recovery lock retention.
- Deployment tests assert fixed Compose project name, dynamic-but-consistent
  Access/backup volume sources, loopback ports, no Docker/deployment mounts,
  candidate migration health/schema checks, safe `.env` carry-forward, bundle
  path allowlisting, and trust-error preservation.
- Release tests assert API-only token attachment, credential removal on
  cross-host redirects, exact matching of private asset metadata, duplicate/mismatch
  rejection, redacted HTTP failures, local file/OCI digest selection, the fixed
  attestation API URL, response and bundle limits, mode `0600` JSONL output,
  offline `gh --bundle` arguments, and subprocess token removal. Deployment
  tests separately prove a data-only legacy current release is accepted while
  the same candidate is rejected. Installer tests require the
  attestation-capability probe and assert the service keeps
  `ProtectSystem=strict` while declaring a mode `0700` `CacheDirectory` and
  matching `XDG_CACHE_HOME`. Production acceptance runs a real signed subject
  verification through the active systemd service.
- Config tests reject missing files, missing/invalid `originIp`, and IPv6;
  installer layout tests reject embedded IPv4 defaults and invalid CLI input.
- Access tests cover authentication on every route, Origin/CSRF/JSON and UUID
  gates, fixed error mapping, response schema limits, timeouts, no-store headers,
  redacted audit events, polling recovery, and no public update surface.
- Browser checks cover desktop/mobile candidate, confirmation, active timeline,
  disconnect/reconnect, rolled-back, recovery-required, and history states.
- Production acceptance additionally requires systemd unit verification,
  Linux `SO_PEERCRED`, active OpenResty configuration, a signed Release update,
  and injected health failure proving automatic application rollback.

### 7. Wrong vs Correct

#### Wrong

```yaml
proxy-client:
  command: ["sleep", "infinity"]
  healthcheck:
    disable: true
```

#### Correct

```yaml
proxy-client:
  command: ["sleep", "infinity"]
  healthcheck:
    test: ["CMD", "node", "-e", "fetch('http://proxy-trusted/access',{headers:{Host:'filmframe.test'}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
```

#### Wrong

```yaml
access:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
    - /opt/filmframe:/opt/filmframe
```

```python
# A group grants filesystem access; it is not caller identity.
if peer_uid in allowed_uids or peer_gid in socket_group_gids:
    authorize()
```

#### Correct

```yaml
access:
  group_add:
    - "${FILMFRAME_UPDATER_GID}"
  volumes:
    - filmframe_access_data:/data
    - /run/filmframe-updater:/run/filmframe-updater:ro
```

```python
_pid, peer_uid, _peer_gid = peer_credentials(connection)
if peer_uid not in allowed_uids:
    raise UpdaterError("peer_forbidden")
```

```python
# Always operate the same Compose project, even through a release symlink.
runner.run([
    "/usr/bin/docker", "compose", "--project-name", "filmframe",
    "--project-directory", str(release), "-f", str(release / "compose.yaml"),
    "config", "--quiet",
])
```

```python
# Wrong: private browser download URLs are not the authenticated REST asset API.
client.get(manifest.bundle_url, token=os.environ["GH_TOKEN"])

# Correct: resolve the exact asset API URL from fixed-repository metadata,
# authenticate only api.github.com, then strip the header on CDN redirects.
asset_url = trusted_asset_api_url(release, expected_name, manifest.bundle_url)
client.get(asset_url, token=os.environ.get("GH_TOKEN"))
```

```python
# Wrong: gh performs its own authenticated attestation lookup.
runner.run(["gh", "attestation", "verify", subject, "--bundle-from-oci"])

# Correct: fetch the fixed digest endpoint, persist only bounded bundle objects,
# then verify offline without passing GitHub credentials to the subprocess.
bundles = client.get(fixed_attestations_url(subject_sha256))
bundle_path = write_mode_0600_jsonl(bundles)
runner.run(
    ["gh", "attestation", "verify", subject, "--bundle", bundle_path, ...],
    environment={"GH_TOKEN": None, "GITHUB_TOKEN": None},
)
```

```ini
# Wrong: broad filesystem write access hides a CLI cache dependency.
ReadWritePaths=/root /usr /etc /opt

# Correct: preserve the read-only host and expose one private cache directory.
ProtectSystem=strict
CacheDirectory=filmframe-updater
CacheDirectoryMode=0700
Environment=XDG_CACHE_HOME=/var/cache/filmframe-updater
```

## Scenario: Persisted Public Render-Budget Configuration

### 1. Scope / Trigger

Apply this contract whenever migration `005`, administrator runtime settings,
the public runtime-config endpoint, or the FilmFrame OpenResty route changes.

### 2. Signatures

```sql
CREATE TABLE render_budget_settings (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  max_canvas_mib INTEGER NOT NULL CHECK (max_canvas_mib BETWEEN 128 AND 2048),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);
```

```http
GET /api/runtime-settings/render-budget
PUT /api/runtime-settings/render-budget
Content-Type: application/json
X-FilmFrame-CSRF: 1

{"maxCanvasMiB":1024}

GET /api/runtime-config
{"maxCanvasMiB":1024,"maxCanvasBytes":1073741824,"updatedAt":1785859200000}
```

### 3. Contracts

- Migration `005` adds one singleton row seeded to 700 MiB and timestamp `0`.
  It is additive and remains backward-compatible with v1.2, which ignores the
  table.
- Administrator reads and writes require the exact admin host and verified
  Cloudflare Access identity. Writes also require exact Origin, JSON, CSRF,
  existing rate limits, strict request fields, and a redacted audit event.
- Accept only integer `maxCanvasMiB` values from 128 through 2,048 and derive
  `maxCanvasBytes` server-side. Never accept bytes, pixels, identity, or generic
  settings JSON from the request.
- Public `GET /api/runtime-config` requires an active invited-device session,
  returns only the three documented fields, and is `no-store`.
- OpenResty proxies only the exact `/api/runtime-config` path to Access after
  the normal session subrequest. The static catch-all remains unchanged and no
  other Access API becomes public.
- The setting controls browser admission only; Access never receives photos,
  EXIF, film settings, Canvas output, or Blob URLs.

### 4. Validation & Error Matrix

- Missing/invalid administrator assertion or wrong host -> reject before read
  or write.
- Missing Origin/CSRF/JSON, unknown field, non-integer, `<128`, or `>2048` ->
  fixed 4xx response and zero database mutation.
- Valid write -> atomically retain the previous value for audit, save the new
  value/timestamp, and return the canonical derived response.
- Missing, expired, revoked, or tampered device session -> public endpoint
  returns 401; wrong host returns 421.
- Access unavailable behind OpenResty -> fail closed; never serve SPA HTML as
  runtime JSON and never bypass to a default at the proxy layer.

### 5. Good / Base / Bad Cases

- Good: an authenticated administrator saves 1,024 MiB, a refreshed invited
  application receives 1,073,741,824 bytes, and no identity data is exposed.
- Base: migration seeds 700 MiB and an unchanged deployment keeps its prior
  rendering behavior.
- Bad: a prefix `/api/` proxy exposes administrator routes or lets an anonymous
  browser read runtime policy without an invited session.

### 6. Tests Required

- Store tests cover seed, inclusive boundaries, invalid values/timestamps,
  persistence, and zero mutation on failure.
- Access integration tests cover admin authentication, write security, strict
  payloads, exact derived bytes, redacted audit output, public session, wrong
  host, and absent session.
- Proxy integration tests cover anonymous redirect, invited JSON response,
  exact routing, Cookie forwarding only to Access, and static-backend isolation.
- Deployment verification asserts the exact OpenResty location and fails when
  the session check or Access target is missing.

### 7. Wrong vs Correct

```nginx
# Wrong: exposes every Access API through one public prefix.
location /api/ { proxy_pass http://filmframe_access_backend; }

# Correct: expose one session-protected read contract.
location = /api/runtime-config {
    auth_request /_filmframe_session_check;
    proxy_pass http://filmframe_access_backend/api/runtime-config;
}
```

## Scenario: Stable Sessions And Passkey Device Recovery

### 1. Scope / Trigger

Apply this contract when changing session renewal, WebAuthn registration or
recovery, Passkey administration, or migration `006`.

### 2. Signatures

```http
POST /auth/passkeys/registration/options
POST /auth/passkeys/registration/verify
POST /auth/passkeys/authentication/options
POST /auth/passkeys/authentication/verify
GET  /access/passkey/setup
GET  /auth/passkeys/client.js
GET  /api/passkeys
POST /api/passkeys/:id/revoke
```

```sql
CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL UNIQUE,
  invite_id TEXT NOT NULL REFERENCES invites(id),
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL,
  transports TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);

CREATE TABLE webauthn_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  session_id TEXT REFERENCES sessions(id),
  invite_id TEXT REFERENCES invites(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
```

### 3. Contracts

- `POST /auth/refresh` keeps the existing opaque session token hash and only
  rolls `last_seen_at` and `expires_at`; the response re-sends the same token.
  A lost refresh response therefore cannot invalidate the browser's Cookie.
- Registration requires a valid session and exact public Origin/CSRF. The
  server fixes the RP ID to `FILMFRAME_HOST`, the expected Origin to the
  configured public Origin, resident credentials and required user
  verification, and stores only the credential public metadata.
- Authentication options are public but rate-limited. Authentication
  verification checks the exact challenge, RP ID, Origin, user verification,
  credential revocation, and parent invitation state before creating a new
  session; it never increments invitation redemption count.
- Challenges expire after five minutes and are atomically consumed once. The
  registration challenge is bound to its session; maintenance deletes expired
  or stale consumed challenges. Errors use fixed generic Passkey messages.
- `@simplewebauthn/server` and the same-origin browser bundle perform WebAuthn
  parsing and verification. Do not hand-roll CBOR, public-key, or signature
  handling, and do not load authentication code from a CDN.
- The administrator list exposes only a short credential ID, invite metadata,
  device/sync type, timestamps, and status. Revocation is CSRF-protected and
  cascades from invitation or batch revocation; public keys, challenges,
  tokens, and Passkey secrets never enter HTML, JSON, or audit logs.
- Production verification must inspect the loaded OpenResty configuration, not
  only the repository template or `openresty -t`. It must assert that all six
  public setup, client, registration, and authentication locations proxy their
  exact paths to `filmframe_access_backend`; this catches a valid but stale
  1Panel vhost before a release is accepted.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Missing/expired/revoked session on registration | `401` or redirect to `/access`; no challenge |
| Wrong Host, Origin, CSRF, JSON, or body limit | fixed `4xx`; no state mutation |
| Expired, reused, cross-session, or wrong-purpose challenge | generic verification failure; no credential/session |
| Wrong RP ID, Origin, user verification, credential, or revoked invite | generic verification failure; no session |
| Valid authentication | one new session Cookie; redemption count unchanged |
| Admin Passkey revoke | `204`; subsequent recovery fails and list shows `revoked` |

### 5. Good / Base / Bad Cases

- Good: a valid invited session registers a platform Passkey, then a browser
  with no session Cookie uses it to obtain a fresh session without another code.
- Base: a browser without WebAuthn continues to use the invitation form.
- Bad: storing authorization in `localStorage`, using a browser fingerprint,
  accepting a credential without checking its challenge/origin, or rotating a
  session token before the refresh response is known to have arrived.

### 6. Tests Required

- Store tests cover challenge single-use, session binding, expiry cleanup,
  stable refresh tokens, Passkey metadata, revocation, and invite cascades.
- Route tests cover public authentication options, protected setup and
  registration, fixed errors, rate limits, CSRF/Host/Origin, and redacted
  administrator responses.
- Browser tests cover the normal no-prompt Cookie path and the invitation
  fallback; real authenticator compatibility must be recorded separately from
  Chromium virtual-authenticator evidence.
- Deployment checks cover same-origin client bundle routing, protected setup,
  no-store authentication responses, and the migration transition `5 -> 6`.
  The active-config regression check must fail against a syntactically valid
  vhost that omits the six Passkey locations and pass against the reviewed
  candidate returned by `openresty -T`.

### 7. Wrong vs Correct

```ts
// Wrong: a lost response leaves the old browser Cookie unusable.
UPDATE sessions SET token_hash = :newHash WHERE token_hash = :oldHash;

// Correct: the opaque token remains stable while its rolling expiry moves.
UPDATE sessions
SET last_seen_at = :now, expires_at = :expiresAt
WHERE token_hash = :tokenHash AND revoked_at IS NULL;
```

```sh
# Wrong: proves only that a stale active vhost is syntactically valid.
openresty -t

# Correct: test syntax, then inspect the loaded config and assert every exact
# Passkey location and Access-sidecar proxy target.
openresty -t && openresty -T
```
