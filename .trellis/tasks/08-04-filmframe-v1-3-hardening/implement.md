# FilmFrame v1.3 Implementation Plan

## Phase 0. Baseline And Activation

- [x] Review `prd.md` and `design.md` after user approval.
- [x] Start the task and create a `codex/filmframe-v1-3-hardening` branch from
      the synchronized `main` branch.
- [x] Record the current release-gate, test counts, package versions, and line
      ownership without changing production.

## Phase 1. Updater Ubuntu Gate

- [x] Add updater Python discovery and install-layout checks to the trusted
      Release workflow before artifact construction.
- [x] Keep workflow permissions and immutable action pins unchanged.
- [x] Add a local aggregate script only if it removes real command duplication;
      otherwise keep the two explicit commands visible in the workflow.
- [x] Validate Python syntax, unit tests, install layout, release contract, and
      workflow YAML structure.

## Phase 2. Focused Browser Compatibility

- [x] Add `tests/e2e/browser-compatibility.spec.ts` using bounded synthetic
      JPEG/PNG fixtures and no external network dependency.
- [x] Keep all existing tests in the Chrome project.
- [x] Add Firefox and WebKit projects scoped to the compatibility spec.
- [x] Update the Release browser installation step for all configured engines.
- [x] Assert local-only photo behavior and current artifact/download readiness.
- [x] Avoid exact randomized-grain pixel snapshots.

## Phase 3. Persisted Runtime Render Budget

- [x] Add backward-compatible Access migration `005` with a singleton integer
      render-budget row seeded to 700 MiB.
- [x] Add focused store functions and boundary tests for reading and updating
      the 128-2,048 MiB value.
- [x] Add authenticated administrator read/write APIs with strict validation,
      existing write security, rate limiting, and redacted audit coverage.
- [x] Add a compact Settings view to the existing administration page showing
      the active value, scope, safe range, and refresh-to-apply behavior.
- [x] Add the session-protected public runtime-config read and exact OpenResty
      routing; extend Access and proxy tests for host/session boundaries.
- [x] Add a frontend runtime-config service with schema validation, 700 MiB
      bounded fallback, and exact MiB/byte/pixel conversion tests.

## Phase 4. Memory Contract And Stress Protocol

- [x] Expand `renderBudget` and `batchAdmission` unit tests at every threshold
      edge, including configured minimum/default/maximum values and
      safe-integer/invalid dimensions.
- [x] Extract App-specific strip sizing and admission feedback to a pure service
      that reuses existing budget authorities.
- [x] Pass the validated runtime Canvas budget through every single-image and
      strip admission path before allocation; do not make the other source,
      working-set, edge, or ZIP thresholds configurable.
- [x] Ensure upload/file bytes and Canvas RGBA terminology remain distinct in
      user-facing warnings and maintained documentation.
- [x] Add a bounded automated browser stress case and a physical-device stress
      table; do not allocate a 700 MiB Canvas in CI.
- [x] Verify blocked operations do not start rendering and completed artifacts
      remain available after stop/failure.

## Phase 5. Incremental `App.tsx` Extraction

- [x] Move only pure render-admission responsibilities first.
- [x] Update imports and focused unit tests before further extraction.
- [x] Evaluate processing orchestration against the controller contract in the
      design. Extract it only if generation, latest-state, cancellation, and URL
      ownership remain explicit; otherwise defer it without forcing a hook.
- [x] Run focused unit and Chrome E2E tests after each move.

## Phase 6. Incremental `filmEngine.ts` Extraction

- [x] Add the focused main-thread Canvas runtime module.
- [x] Move image loading, Blob export, output rotation/orientation, and only
      directly coupled helpers without changing public render entry points.
- [x] Preserve module cache retry behavior and main-thread fallback errors.
- [x] Run geometry, transform, Worker fallback, template, and browser tests.

## Phase 7. Physical Device Runbook And Documentation

- [x] Add the iPhone Safari and Android Chrome production smoke runbook and a
      redacted evidence template.
- [x] Update README browser compatibility and 700 MiB wording.
- [x] Update maintained engineering, rendering, file-map, and operations/risk
      docs for the new gates and module boundaries.
- [x] Mark desktop emulation and physical-device evidence distinctly.

## Phase 8. Version Preparation

- [x] Set root and Access package metadata to 1.3.0 only after code gates pass.
- [x] Prepare release input as schema 4 -> 5, backward compatible, with a
      rollback floor consistent with the trusted updater contract.
- [x] Validate version identity and release manifest inputs.
- [x] Do not create/push a tag, GitHub Release, or production job in this task.

## Validation

```bash
npm run test
npm run typecheck
npm run build
npm --prefix server/access run check

PYTHONPATH=ops/updater python3 -m unittest discover \
  -s ops/updater/tests -p 'test_*.py' -v
bash ops/updater/tests/test-install-layout.sh

npx playwright install chromium firefox webkit
npx playwright test --project=chromium
npx playwright test tests/e2e/browser-compatibility.spec.ts \
  --project=firefox --project=webkit

npm run test:backup
npm run test:e2e:access-proxy
npm run test:release-contract
npm run verify:deployment
npm run verify:release-input
docker compose config --quiet
git diff --check
```

## Verification Record (2026-08-05)

- Root Vitest, TypeScript, and production build passed: 27 files and 196 tests.
- Access test, TypeScript, and build passed: 89 tests.
- Chromium passed the complete 42-test suite; the focused Firefox and WebKit
  journeys both passed.
- Release contract passed 13 tests; updater passed 46 tests on macOS with the
  Linux-only `SO_PEERCRED` case skipped as designed. The trusted Ubuntu workflow
  is the authoritative peer-credential gate.
- Backup boundaries, deployment configuration, release input, Compose config,
  and `git diff --check` passed.
- `npm run test:e2e:access-proxy` could not start because the local OrbStack
  Docker socket was absent. No proxy assertion ran; repeat this gate in trusted
  CI or after starting a healthy local Docker daemon.
- Physical iPhone Safari and Android Chrome evidence is not attached. The
  repository is a release candidate, but the `v1.3.0` tag remains blocked.

## Release Authorization Gate

The repository implementation is release-candidate only until the physical
iPhone Safari and Android Chrome evidence is completed. If either device is
unavailable, stop before tag creation and report the missing external evidence;
do not replace it with emulation.

## Risky Files And Rollback Points

- `.github/workflows/release.yml`: preserve permissions, action pins, and step
  order; failure must occur before publication.
- `playwright.config.ts`: prevent focused projects from running the full suite
  unintentionally.
- `App.tsx`: protect generation gates, latest refs, and URL ownership.
- `services/filmEngine.ts`: protect drawing order, singleton caches, output MIME,
  dimensions, and main-thread fallback behavior.
- `server/access/migrations/005_*.sql`: keep the new setting additive and
  backward-compatible; never rewrite or delete existing rows during migration.
- `ops/openresty/filmframe-auth.conf.example`: expose only the exact public
  runtime-config path and retain the invitation session check.
- `ops/release/release-input.json`: do not declare schema or rollback values that
  differ from the actual Access database contract.

Each phase should remain independently reviewable. If an extraction changes
rendered output or async behavior, revert that extraction while retaining the
v1.3 test/documentation improvement that exposed the mismatch.
