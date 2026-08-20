# Pre-tag CI and renderer fallback automation

## Goal

Detect release-gate and Worker-to-main-thread renderer regressions before a stable tag is pushed by adding PR/`main` CI, making `npm run check:release` the reusable pre-publication gate, and proving fallback behavior with focused unit and desktop-browser automation.

## Background

- `.github/workflows/release.yml` is currently the only workflow and runs only after a stable tag is pushed (`.github/workflows/release.yml:3-6`).
- `npm run check:release` omits release-input, release-contract, and updater checks that the trusted workflow maintains separately (`package.json:25-30`; `.github/workflows/release.yml:55-74`).
- Worker failure fallback already exists in `services/filmWorkerClient.ts:255-311`, but current tests do not prove that an eligible Worker accepts a task, reports a render failure, and then returns a usable main-thread result.

## Requirements

### R1. Make one reusable pre-publication quality command

- Add a portable updater test script that runs the Python updater suite and installer-layout shell test.
- Expand `npm run check:release` to include release-input validation, release-contract tests, frontend/Access checks, updater tests, Playwright, backup checks, access-proxy E2E, and deployment verification in a fail-fast order.
- Preserve the explicit Ubuntu `SO_PEERCRED` assertion in trusted Linux jobs because the peer-credential test legitimately skips on macOS.
- Keep exact repository/ref/tag/commit validation and exact `--tag` release-input validation in the tag workflow before the reusable command.

### R2. Run release-relevant checks on pull requests and `main`

- Add a GitHub Actions workflow triggered by `pull_request` and pushes to `main`.
- Match the trusted release environment where relevant: Ubuntu 24.04, Node 22.23.2, both lockfile installs, all configured Playwright browser engines, and the Linux peer-credential assertion.
- Grant only read access and run `npm run check:release`; the workflow must not build/push release artifacts, authenticate to GHCR, attest, publish a manifest, or create a GitHub Release.
- Update release workflow contract tests so CI triggers, permissions, setup, gate reuse, and release-only boundaries are executable assertions.

### R3. Automate recovery after a started Worker render fails

- Add focused Vitest coverage for both public single-image and strip APIs using Worker-eligible settings, real `File` inputs where required, and a fake Worker that accepts the request and responds with `{ ok: false }`.
- The tests must prove the corresponding main-thread engine receives the original source/items, settings, date/transform, and render budget, and that its result is returned unchanged.
- Add one Chromium Playwright workflow that forces a started Worker request to fail, proves a real HTML Canvas export occurs, and observes a successfully developed image without a processing error.
- Cancellation remains terminal and must not start fallback work. Normal Worker success-path and cross-browser workflows must remain green.
- Do not add a production feature flag, query parameter, renderer wrapper, or exported test-only control unless the existing browser-global/dependency seams are proven insufficient and planning is reopened.

## Acceptance Criteria

- [ ] AC1: `npm run check:release` invokes release-input, release-contract, updater, frontend/Access, browser, backup, proxy, and deployment gates through one documented command.
- [ ] AC2: The trusted tag workflow performs tag-specific identity validation and the Linux peer-credential assertion, then invokes `npm run check:release` before any bundle or publication step.
- [ ] AC3: A read-only PR/`main` workflow installs the required Node dependencies and Playwright engines on Ubuntu 24.04/Node 22.23.2, asserts `SO_PEERCRED`, and runs `npm run check:release`.
- [ ] AC4: Static release-contract tests fail if the PR/`main` triggers, read-only boundary, Linux assertion, reusable gate, or pre-artifact ordering is removed.
- [ ] AC5: Focused Vitest tests prove a started eligible Worker failure delegates both single-image and strip requests to the main-thread engine without losing inputs or budget.
- [ ] AC6: A Chromium Playwright test records an eligible Worker request and forced failure, at least one native HTML Canvas `toBlob` export, a developed result, and no processing-error dialog.
- [ ] AC7: Existing cancellation, normal Worker, cross-browser, and protected access-proxy tests remain green.
- [ ] AC8: No release artifact or external publication occurs in PR/`main` CI, and no physical-device test is run.

## Out of Scope

- Creating or pushing a stable tag, version bump, GitHub Release, image, manifest, or deployment.
- Changing repository branch-protection settings or making the new check required through GitHub settings.
- Refactoring renderer production architecture when the existing fallback behavior passes the new tests.
- Forced-failure automation in Firefox/WebKit; their existing normal browser-compatibility coverage remains required.
- Physical iPhone, iPad, or Android testing.

## Blocking Open Questions

None.
