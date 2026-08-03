# Implementation Plan

## Phase 1: Release Contract and CI

- [x] Define and validate the version manifest schema, canonical serialization and compatibility rules.
- [x] Add tag-triggered CI for full checks, two GHCR images, immutable digests, deploy bundle, SBOM/provenance and signature.
- [x] Inject version/revision into both runtime images and expose a non-secret internal revision check.
- [x] Add artifact tests that reject `latest`, missing digest, untrusted identity, malformed summary or incompatible schema metadata.

## Phase 2: Host Updater

- [x] Implement the bounded Unix socket protocol, peer validation and fixed action dispatcher.
- [x] Add updater SQLite schema, transactional state transitions, idempotency and active-job uniqueness.
- [x] Add `flock`, startup reconciliation and explicit `recovery_required` handling.
- [x] Implement stable Release lookup/cache, manifest verification, digest pulls and bundle staging.
- [x] Reuse existing backup/restore helpers for rehearsal and cutover backup without exposing secrets.
- [x] Implement immutable release creation, safe `.env` carry-forward, Compose preflight and fixed probes.
- [x] Implement cutover, application-only rollback and post-rollback verification.
- [x] Add systemd service/socket units, bootstrap installer, permissions and uninstall/recovery documentation.

## Phase 3: Access Bridge

- [x] Add strict config for updater socket and production enablement; no Docker or host write mounts.
- [x] Implement a timeout-bounded Unix socket client with schema-validated responses.
- [x] Add the admin-only read/check/create/status/history routes under existing auth and write-security middleware.
- [x] Add UUID idempotency, fixed error mapping, rate limits, no-store headers and redacted audit events.
- [x] Extend Compose with only the read-only socket mount and required runtime group/permission mapping.

## Phase 4: Administrator Experience

- [x] Add “版本与更新” navigation without disturbing invitation workflows.
- [x] Implement current/candidate cards, stable Release notes, compatibility warnings and manual confirmation.
- [x] Implement real stage timeline, active-task polling, reconnect behavior and persisted result recovery.
- [x] Add success, rolled-back, failed-pre-switch and recovery-required states with fixed safe explanations.
- [x] Add history, empty/offline/updater-upgrade-required states and responsive mobile layout.
- [x] Verify no version/update surface is present on the public invitation/application domains.

## Phase 5: Verification and Rollout

- [x] Unit-test manifest validation, protocol limits, state transitions, concurrency, reconciliation and redaction.
- [x] Integration-test release trust, digest/signature failure, disk failure, backup failure and migration incompatibility boundaries.
- [x] Run real Docker tests for rehearsal volume, loopback bindings, candidate failure and automatic code rollback.
- [ ] Run the full per-state Access/updater restart chaos matrix in staging; unit reconciliation, concurrent idempotency, browser reconnect, production rollback, and post-update Access restart already pass.
- [x] Run administrator browser tests on desktop/mobile, including close/reopen and switching disconnects.
- [x] Run `npm run check:all`, `npm run test:e2e`, updater tests, deployment verifier and `git diff --check`.
- [x] Install updater in production through SSH, verify permissions and retain the existing manual deployment path.
- [x] Publish one signed test Release, perform an update, inject a health failure, prove automatic rollback and record evidence.
- [x] Enable production version checks only after the rollback rehearsal passes.

## Risky Boundaries

- `compose.yaml`: socket mount and runtime permissions must not expose Docker or other host paths.
- `server/access/src/routes/adminRoutes.ts`: all new writes must retain JWT, email, Origin, CSRF, JSON and idempotency gates.
- `ops/updater/`: root-capable boundary; no shell interpolation, arbitrary input or cross-site paths.
- release workflow: a bad manifest/signature rule can turn CI compromise into production root execution.
- migrations: automatic application rollback is valid only while the previous version accepts the new schema.
- production install: updater replacement is a separate bootstrap operation and must never be coupled to an application job.

## Rollback Points

- CI/release changes can be disabled without touching production.
- Access update routes remain disabled until the updater socket passes health checks.
- Installing the updater does not change `current` or running containers.
- Production feature enablement is a final config change after a signed dry run and rollback rehearsal.
- Existing SSH release and SQLite restore procedures remain the break-glass path.

## Production Audit: 2026-08-03

- [x] Confirm current release containers are healthy, publish only on
  `127.0.0.1:18082/18083`, and run schema 3 on the existing data volume.
- [x] Confirm active OpenResty configuration, origin/public authorization
  status codes, Compose validation, and the daily verified backup timer.
- [x] Add private Release API authentication without forwarding credentials to
  asset CDN hosts, and add exact GitHub asset endpoint tests.
- [x] Permit only the safe data-only legacy current Compose shape during first
  updater adoption while retaining strict candidate socket/group validation.
- [x] Make installer fail before mutation when `gh attestation verify` is not
  supported; production currently has an older CLI and no updater units.
- [x] Run the real Unix peer-credential authorization test on the Linux
  production host from an isolated temporary directory, then remove it.
- [x] Pass Release-level application checks, 40 browser tests, real proxy tests,
  backup boundaries, deployment verification, 40 updater tests, and 12 Release
  contract tests.
- [x] Select the public GitHub-native trust model, scan the public history,
  remove the deployment-specific origin IP default, and activate a `v*.*.*`
  tag Ruleset for creation, update, and deletion.
- [x] Only after the trust decision: publish the first higher SemVer Release,
  install the updater with the real OpenResty container name, execute a real
  update, inject a health failure, and prove automatic rollback before enabling
  the Access bridge.

## Production Acceptance: 2026-08-03

- Trusted Release `v1.1.1` was published from protected commit
  `b76426b3368466d111459538e01d29425fb62478` and independently verified.
- Host updater `1.0.2` verifies public attestations through bounded GitHub API
  bundles and offline `gh --bundle` inside the hardened systemd sandbox.
- Fault-injection job `51a6ec60-1c8e-4e39-8ed8-754ef137aa1a` stopped only the
  exact candidate Access container and finished `rolled_back` with
  `health_check_failed`; the old release, revision, schema 3, data volume,
  backup, loopback, OpenResty, origin, and public HTTPS checks all recovered.
- Retry job `26bdecfc-c325-4dc8-b723-d34c1c21d2e4` used a new idempotency key
  and finished `succeeded`. Both containers run the target revision and pinned
  image digests with schema 3.
- The Access bridge was enabled only after both jobs passed. Only Access was
  recreated; its UID 10001 client completed a real Unix-socket status request,
  the socket mount remained read-only, and the Docker socket remained absent.
- A real Cloudflare-authenticated administrator session displayed updater
  `1.0.2`, current `v1.1.1`, healthy state, and both persisted history entries.
  The public FilmFrame host returned `404` for the update API.
- The remaining full per-state restart chaos matrix is intentionally deferred
  to staging because inducing every interruption in production is not a release
  acceptance requirement after the state-machine, reconciliation, browser
  reconnect, real rollback, and post-update Access restart gates passed.
