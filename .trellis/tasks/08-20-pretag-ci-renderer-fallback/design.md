# Design: Pre-tag CI and renderer fallback automation

## Gate topology

Use `package.json` as the reusable, collaborator-visible gate composition boundary. Keep specialized scripts independently runnable, but have `check:release` invoke all portable pre-publication checks. Do not introduce a generated matrix, shell wrapper, or second gate manifest.

Proposed portable sequence:

```text
verify:release-input
test:release-contract
check:all
test:updater
test:e2e
test:backup
test:e2e:access-proxy
verify:deployment
```

`test:updater` owns the Python unittest discovery and installer-layout shell test. The Linux `SO_PEERCRED` environment assertion stays outside that portable script and runs explicitly in Ubuntu CI.

## GitHub Actions boundaries

### PR/main workflow

Add one job with:

- `pull_request` and `push` to `main` triggers;
- `contents: read`;
- Ubuntu 24.04 and a bounded timeout;
- the same commit-pinned checkout/setup-node actions as the trusted workflow;
- Node 22.23.2;
- root and `server/access` lockfile installs;
- Chromium, Firefox, and WebKit installation;
- explicit Linux/`SO_PEERCRED` assertion; and
- one `npm run check:release` quality step.

It intentionally has no package write, OIDC, attestation, GHCR, bundle, manifest, evidence, or release-publication capability.

### Trusted tag workflow

Keep repository/ref/tag/HEAD validation, the canonical-main ancestry guard owned by the sibling task, and exact tagged release-input validation ahead of dependency installation. After setup, retain the Linux environment assertion and call `npm run check:release` once. All artifact and publication steps remain tag-only and follow the reusable gate.

## Workflow contract tests

Extend `ops/release/tests/release-tooling.test.mjs` using its existing static-contract style. Assert both workflow topology and package-script composition. Update assertions that currently search `release.yml` for raw updater commands so they instead prove those commands are behind `test:updater`/`check:release` and that the trusted workflow invokes the reusable gate before bundle construction.

## Worker fallback unit seam

Drive the public APIs through existing globals and dependency injection:

1. Provide Worker-eligible real-135 settings.
2. Stub `Worker`, `OffscreenCanvas.prototype.convertToBlob`, and `createImageBitmap`.
3. Pass a real `File` for single-image routing.
4. Have `postMessage` asynchronously deliver the real client error shape: `{ id, ok: false, error }`.
5. Assert the Worker received the expected operation, then assert exact delegation and returned result from the mocked main-thread engine.
6. Cover single and strip catches separately and dispose the cached client after each test.

Cancellation errors continue to bypass fallback.

## Chromium integration seam

Use `page.addInitScript` before application startup to install a page-local fake Worker and an `HTMLCanvasElement.prototype.toBlob` counter. Preserve native `OffscreenCanvas` and `createImageBitmap` so the production capability predicate remains eligible. The fake Worker accepts the production request and asynchronously reports `{ ok: false }`.

Run a real-135 single-image workflow with an existing repository fixture. Evidence of a Worker request plus forced failure, a native HTML Canvas export, and a developed result proves the production catch reached the actual main-thread renderer. Scope all probes to this one Chromium test so normal Worker/proxy tests remain authoritative for the success path.

## Compatibility

- Local macOS can run the portable updater suite, but the Linux peer-credential test remains skipped there by design. Ubuntu PR/tag jobs supply that exact assertion.
- A new E2E filename runs in Chromium under the current Playwright project matching; Firefox/WebKit continue to run the existing browser-compatibility spec.
- No dependency upgrade is required.

## Rollback

- If GitHub-hosted Ubuntu cannot support an existing Docker/proxy gate, revert/disable the new PR workflow while preserving the trusted tag workflow and investigate the runner constraint.
- If reusable gate ordering loses a release invariant, restore the explicit trusted block before changing product/release behavior.
- If the browser test cannot use the existing seams, revert the test hook and reopen design rather than weakening capability detection.
