# Design: 丝滑版本更新系统

## Architecture

```text
GitHub protected tag
  -> Actions build/test
  -> GHCR images by digest + deploy bundle
  -> signed release manifest + provenance

Administrator browser
  -> Cloudflare Access
  -> Access admin API (JWT + email + Origin + CSRF + idempotency)
  -> read-only Unix socket mount
  -> host filmframe-updater systemd service
       -> updater state SQLite + flock
       -> /opt/filmframe/releases
       -> Docker Compose
       -> existing backup/restore scripts
       -> fixed OpenResty/public probes
```

The updater is a stable deployment boundary outside every application release. Access never executes Docker or Shell and never receives raw updater logs.

## Components

### Release workflow

Add a tag-triggered GitHub Actions workflow that runs `npm run check:all`, focused deployment tests and artifact validation. It builds the static and Access images once, pushes them to GHCR by digest, creates a deploy bundle, emits SBOM/provenance, signs the artifacts, and publishes a manifest.

Manifest fields are fixed and schema-validated:

```json
{
  "manifestVersion": 1,
  "version": "1.1.0",
  "commit": "40-char SHA",
  "publishedAt": "ISO-8601",
  "minUpdaterVersion": "1.0.0",
  "images": {
    "filmframe": "ghcr.io/...@sha256:...",
    "access": "ghcr.io/...@sha256:..."
  },
  "deployBundle": { "url": "fixed GitHub asset URL", "sha256": "..." },
  "database": {
    "schemaFrom": 3,
    "schemaTo": 4,
    "rollbackFloor": "1.0.0",
    "backwardCompatible": true
  },
  "summaryZh": [{ "kind": "feature", "text": "..." }]
}
```

The signature covers the canonical manifest. The updater pins the repository and accepted CI identity; it never accepts a manifest URL from the request.

### Host updater

Implement a small host service under `ops/updater/` with no application-runtime dependency. The service:

- listens only on `/run/filmframe-updater/updater.sock`;
- verifies Unix peer credentials and strict bounded JSON messages;
- exposes only `check`, `create_job`, `get_job`, `get_active_job`, and `list_history`;
- stores state in `/var/lib/filmframe-updater/state.sqlite`;
- serializes work with `/run/lock/filmframe-updater.lock` and a database active-job constraint;
- runs subprocesses with argument arrays and fixed paths, never `shell=true`;
- writes structured redacted events to journald;
- reconciles interrupted jobs from actual symlink/container state at startup.

The updater package/version is installed independently by an explicit bootstrap command. An application manifest whose `minUpdaterVersion` is newer is displayed but cannot be installed through the page.

### Access bridge

The existing admin route keeps all current security middleware. Add a bounded Unix-socket client and these admin-only endpoints:

```http
GET  /api/system-update
POST /api/system-update/check
POST /api/system-update/jobs
GET  /api/system-update/jobs/:id
GET  /api/system-update/history
```

`POST /jobs` accepts only `{ "version": "x.y.z" }` plus UUID `Idempotency-Key`. Access does not forward administrator JWT, Cookie or environment data. The updater resolves the matching cached signed manifest itself.

Errors are fixed enums such as `update_busy`, `release_untrusted`, `backup_failed`, `migration_incompatible`, `health_check_failed`, `rollback_failed`, and `updater_upgrade_required`.

### Administrator UI

Add a “版本与更新” view to the current server-rendered administrator page. Use polling because it naturally survives Access replacement and avoids an SSE lifecycle layer:

- idle polling every 30 seconds while a task is active;
- 2-second polling during switching/reconnect, then exponential backoff;
- immediate server resync after visibility/network changes;
- real stage states, elapsed time and safe summaries;
- one confirmation drawer after synchronous preflight;
- update history with final states and error IDs.

The browser never treats network loss as deployment failure; only a persisted final updater state is authoritative.

## Job State Machine

```text
queued
  -> verifying_release
  -> pulling_artifacts
  -> staging_release
  -> rehearsing_migration
  -> backing_up
  -> ready_to_switch
  -> switching
  -> verifying_loopback
  -> verifying_origin
  -> verifying_public
  -> succeeded
```

Before `switching`, any error becomes `failed_pre_switch` and production remains unchanged. After switching, any failed gate becomes `rolling_back`, then either `rolled_back` or `recovery_required`.

State transitions are transactional and monotonic. Each stage records start/end timestamps and a fixed safe result. Repeating `create_job` for the same target while active returns the existing job; another target returns `409 update_busy`.

## Deployment Flow

1. Verify current release truth, disk headroom, Docker/OpenResty availability, loopback bindings and updater compatibility.
2. Fetch the fixed repository's stable Release metadata and verify manifest signature/provenance.
3. Pull both images by digest and verify labels/revision.
4. Download and checksum the deploy bundle into a new immutable release directory.
5. Copy production `.env` with mode preserved; replace only release, revision and image digest fields.
6. Run `docker compose config --quiet` and assert ports remain loopback-only.
7. Create a fresh rehearsal volume from the latest verified backup; run candidate migrations and health checks without touching production data.
8. Run a new production online backup immediately before cutover.
9. Record the previous release and image digests, atomically switch `current`, then recreate only FilmFrame services.
10. Verify container health, revision/digest, schema, loopback endpoints, OpenResty config, direct-origin boundaries and public HTTPS.
11. Mark success only after every gate passes. Retain old release, images and backup for the rollback window.
12. On failure after switching, restore the old symlink/images and repeat the full boundary checks. Never restore SQLite automatically.

## Migration Contract

One-click releases must use expand/contract migrations and remain readable by the immediately previous Access version. Additive tables, nullable columns and indexes are acceptable. Destructive changes, semantic rewrites, database restoration or a rollback floor above the current version make the release maintenance-only.

Rehearsal uses a new named volume restored from a verified online backup. It proves migration and candidate startup but is never switched into production. Automatic application rollback continues using the forward-expanded production database.

## Security Boundaries

- Reject Docker socket access in application containers.
- Unix socket permissions and peer credentials restrict callers to the Access runtime identity.
- Every write still requires Cloudflare JWT validation, exact administrator email, exact Origin, JSON, CSRF header and idempotency key.
- No arbitrary URL, filesystem path, image, command, environment key or rollback target crosses the API.
- Output is allowlisted data, not sanitized raw logs.
- The updater may inspect only FilmFrame's fixed Compose project, release root, backup root and configured OpenResty container.

## Rollback and Recovery

Automatic rollback covers application releases only. `rolled_back` requires restored old containers plus passing loopback/origin/public gates. If this cannot be proven, enter `recovery_required`, hold the global lock and direct the operator to the existing SSH recovery procedure.

Database recovery remains a separate audited operation that restores into a new volume and switches only after integrity and row validation.

## Compatibility

- Existing manual SSH release remains the break-glass path.
- Existing `.env`, named volume, backup timer, domains, certificates and OpenResty vhosts remain authoritative.
- Releases without a valid manifest are visible only as unsupported and cannot be installed.
- Local development uses a fake updater socket; production bypass flags remain forbidden.

## Production Trust Decision

The 2026-08-03 production audit selected the public GitHub-native trust model.
`Zeno-cc/FilmFrame` is public, the existing remote history passed a full
gitleaks scan, and deployment-specific origin IP defaults were removed before
the local update commits could be pushed. The updater installer now requires
the origin IPv4 address explicitly and its runtime config fails closed when the
value is absent.

The active `Protect release tags` repository Ruleset covers `v*.*.*` tags and
restricts tag creation, update, and deletion to repository administrators.
Release CI retains GitHub OIDC Artifact Attestations and pins the repository,
workflow, tag ref, source commit, GitHub-hosted runner, manifest, bundle, and
both image digests.

This resolves the trust-model decision only. Production remains disabled until
a higher SemVer Release is published, the updater is installed independently,
and a real update plus injected failure proves automatic rollback.
