# Research: PR/main pre-tag CI and unified release gates

- Query: What is the smallest change that runs release-relevant checks on pull requests and `main`, makes local `npm run check:release` the reusable source of truth for the trusted release workflow, and preserves tag-only publishing boundaries?
- Scope: internal
- Date: 2026-08-20

## Findings

### Files found

- `package.json:9-33` — root scripts; `check:release` currently omits release-input, release-contract, and updater checks.
- `package.json:40-52` and `package-lock.json:769-783`, `package-lock.json:2425-2455`, `package-lock.json:2831-2844` — declared and locked test tool versions.
- `server/access/package.json:6-16` — Access requires Node 22 and its `check` command runs tests, type checking, and build.
- `.github/workflows/release.yml:1-24` — the only current workflow; it runs only for pushed stable tags on Ubuntu 24.04.
- `.github/workflows/release.yml:25-74` — pre-artifact setup and quality gates.
- `.github/workflows/release.yml:76-215` — tag-only bundle, image, attestation, manifest, evidence, and GitHub Release publication.
- `ops/release/validate-release-input.mjs:8-40` — validates package/release versions and the latest Access migration; optionally validates an exact tag.
- `ops/release/tests/release-tooling.test.mjs:122-154` — current static workflow contract, including action pinning and updater-before-artifact ordering.
- `ops/updater/tests/test_protocol.py:73-75` — the real peer-credential test is Linux-only and otherwise skipped.
- `ops/updater/tests/test-install-layout.sh:1-38` — portable installer syntax/layout/importability gate.
- `scripts/test-backup-boundaries.mjs:17-93` — backup cleanup, retention, restore compatibility, and unsafe-directory boundary checks.
- `scripts/test-invite-proxy.mjs:91-160`, `scripts/test-invite-proxy.mjs:164-235`, `scripts/test-invite-proxy.mjs:450-495` — Docker-backed protected-browser, auth/outage, worker-use, and cleanup checks.
- `scripts/verify-invite-deployment.mjs:26-75`, `scripts/verify-invite-deployment.mjs:77-120`, `scripts/verify-invite-deployment.mjs:440-465` — deployment/config validation and its non-production OpenResty skip behavior.
- `.trellis/spec/backend/release-process.md:15-24`, `.trellis/spec/backend/release-process.md:42-51`, `.trellis/spec/backend/release-process.md:64-72` — pre-tag release validation and tag-only publication contract.
- `.trellis/spec/frontend/quality-guidelines.md:5-24` and `.trellis/spec/backend/index.md:21-25` — frontend/backend completion checks.

### Current gate topology and gaps

1. `check:release` currently expands to `check:all`, Playwright, backup, proxy E2E, and deployment verification (`package.json:25-30`). It does **not** run `verify:release-input` or `test:release-contract`, even though both are named pre-tag requirements (`.trellis/spec/backend/release-process.md:64-68`).
2. The trusted workflow compensates by validating release input with the pushed tag before installation (`.github/workflows/release.yml:39-53`) and running `test:release-contract` as a second manually maintained quality command (`.github/workflows/release.yml:71-74`).
3. The updater Python suite and installer-layout test are another separate workflow block (`.github/workflows/release.yml:63-69`). The explicit `SO_PEERCRED` assertion is necessary because the peer-credential unit test skips on non-Linux systems (`ops/updater/tests/test_protocol.py:73-75`).
4. There is no PR or branch workflow: `.github/workflows/release.yml` is the only file under `.github/workflows/`, and its only trigger is a `v*.*.*` tag (`.github/workflows/release.yml:3-6`). A defect in any current release gate can therefore first appear after the stable tag is pushed.

### Minimal implementation boundary

The smallest maintainable boundary is four files: `package.json`, a new `.github/workflows/ci.yml`, the pre-artifact portion of `.github/workflows/release.yml`, and `ops/release/tests/release-tooling.test.mjs`. No bundle, image, manifest, attestation, updater product code, or deployment product code needs to change.

1. Add one portable updater script to `package.json`, containing the two existing test commands but not the Linux assertion:

   ```text
   test:updater = PYTHONPATH=ops/updater python3 -m unittest discover -s ops/updater/tests -p 'test_*.py' -v && bash ops/updater/tests/test-install-layout.sh
   ```

   Both commands already run without installing Python packages. Keeping the `SO_PEERCRED` assertion outside this script lets collaborators run the same command on macOS while the trusted Ubuntu jobs still prove that the Linux-only test did not skip.

2. Make `check:release` the portable source of truth by adding, in fail-fast order, `verify:release-input`, `test:release-contract`, and `test:updater` to its current command chain. A concrete minimal sequence is:

   ```text
   npm run verify:release-input
   npm run test:release-contract
   npm run check:all
   npm run test:updater
   npm run test:e2e
   npm run test:backup
   npm run test:e2e:access-proxy
   npm run verify:deployment
   ```

   This keeps one public local command while preserving the existing specialized scripts. A shell wrapper, matrix generator, feature flag, or gate manifest would add a second abstraction without detecting another failure.

3. In the trusted workflow, retain the repository/ref/tag/commit checks and the tagged call to `validate-release-input` (`.github/workflows/release.yml:39-53`). Those checks have information that a local or PR job does not have. Replace the duplicated updater test block with only the Ubuntu/`SO_PEERCRED` environment assertion, then invoke only `npm run check:release` as the quality gate.

4. Add one `ci.yml` job for `pull_request` and `push` to `main`. It should reuse these exact release environment choices:

   - `ubuntu-24.04` and a 45-minute upper bound (`.github/workflows/release.yml:19-22`);
   - the commit-pinned checkout and setup-node actions already used by the trusted workflow (`.github/workflows/release.yml:25-37`);
   - Node `22.23.2`, because the root permits Node 20+ (`package.json:6-8`) but Access requires `>=22 <23` (`server/access/package.json:6-8`);
   - both lockfile installs (`.github/workflows/release.yml:55-58`);
   - Chromium, Firefox, and WebKit installation, because the Playwright configuration runs the general suite in Chromium and `browser-compatibility.spec.ts` in Firefox/WebKit (`playwright.config.ts:16-30`);
   - the explicit Linux/`SO_PEERCRED` assertion followed by `npm run check:release`.

   Give this workflow only `contents: read`. Do not copy the release workflow's write/package/OIDC/attestation permissions (`.github/workflows/release.yml:12-16`). Default shallow checkout is sufficient because none of the proposed pre-tag checks consumes history; `fetch-depth: 0` remains necessary only where the release job intentionally validates and publishes the tagged commit. Concurrency cancellation is an optional cost optimization, not an acceptance requirement.

5. Update the existing release tooling test rather than adding a new workflow-test framework. The minimum useful assertions are:

   - `ci.yml` has both PR and `main` push triggers, runs on Ubuntu 24.04, installs both dependency trees and all three browser engines, asserts `SO_PEERCRED`, and invokes `npm run check:release`;
   - `ci.yml` has no write permissions, image push, attestation, manifest, or release-publication command;
   - `release.yml` still runs the tag identity validation before `npm run check:release`, and `npm run check:release` before `ops/release/build-deploy-bundle.sh`;
   - the package scripts place both updater commands and `test:release-contract` behind `check:release`.

   The existing updater-order test currently searches for the raw Python and shell commands inside `release.yml` (`ops/release/tests/release-tooling.test.mjs:140-153`); it must be adjusted when those commands move behind the package script. Keep the existing action-pinning and immutable-release assertions (`ops/release/tests/release-tooling.test.mjs:122-138`).

### Tag-only boundary

Pre-tag CI should stop before `.github/workflows/release.yml:76`. The following remain release-only because they either require an actual stable tag, mutate external state, or create evidence for one immutable source commit:

- repository/ref/tag/HEAD equality and exact `--tag` validation (`.github/workflows/release.yml:39-53`);
- deterministic deploy bundle construction (`.github/workflows/release.yml:76-86`);
- Buildx, GHCR authentication, and image pushes (`.github/workflows/release.yml:88-130`);
- provenance/SBOM attestations, canonical manifest generation, and signed contract verification (`.github/workflows/release.yml:132-186`);
- evidence upload and immutable GitHub Release creation (`.github/workflows/release.yml:188-215`).

Running any of those in PR/main CI would not improve pre-tag diagnosis and would broaden permissions or publish state.

### Proposed checks: concrete failures and changed next action

| Check | Concrete failure detected | What changes when it fails |
| --- | --- | --- |
| `npm ci` at root and Access | A committed lockfile cannot reproduce its package tree, or a dependency's Node requirements conflict with Node 22.23.2. | Repair the affected manifest/lockfile or dependency choice; do not retry the tag with ad-hoc install flags. |
| Playwright three-browser installation | The pinned Playwright runtime cannot provision a browser engine required by `playwright.config.ts:16-30`. | Fix runner/package/browser installation before interpreting E2E failures; do not remove an engine merely to make CI green. |
| Ubuntu + `SO_PEERCRED` assertion | The job moved off Linux or onto a Python/socket runtime where the security-relevant peer credential test would skip. | Restore an Ubuntu runner/runtime; this is an environment failure, not a reason to weaken the updater test. |
| `verify:release-input` | Root, Access, and release-input versions diverge; `database.schemaTo` is not the latest migration; or release metadata violates its schema (`ops/release/validate-release-input.mjs:16-37`). | Synchronize release metadata and migration compatibility before merge/tag. The tag job still adds exact tag equality. |
| `test:release-contract` | Release manifest/tooling trust behavior or workflow invariants regress, including unpinned actions, mutable publication, or updater gates no longer blocking artifact construction (`ops/release/tests/release-tooling.test.mjs:122-154`). | Fix the workflow/tooling. Change the contract assertion only when the reviewed release specification intentionally changes. |
| `check:all` | Frontend unit/type/build failure or Access test/type/build failure (`package.json:25-28`, `server/access/package.json:9-13`). | Fix the affected package before browser/deployment interpretation. |
| `test:updater` | Updater protocol/application/release/deploy/store behavior regresses, installer shell syntax changes, systemd/cache hardening lines disappear, invalid origin IP is accepted, or the installed package is not importable (`ops/updater/tests/test-install-layout.sh:9-38`). | Fix updater code/install assets or, for an intentional contract change, update the related backend spec and tests before merge. |
| `test:e2e` | A supported browser workflow, including the proposed worker-to-main-thread Canvas recovery, cannot complete. | Use retained trace/screenshot (`playwright.config.ts:11-15`) to distinguish UI, browser, and renderer faults; fix before merge. |
| `test:backup` | Cleanup removes a recent/malformed/symlink/outside file, leaves expired backups, restore compatibility disappears, or an unsafe custom root is accepted (`scripts/test-backup-boundaries.mjs:24-91`). | Fix backup/restore behavior before release; this is not a flaky browser rerun. |
| `test:e2e:access-proxy` | Docker stack startup, protected resource gating, invite/session behavior, outage recovery, browser-local photo handling, actual Worker use, or ZIP export fails (`scripts/test-invite-proxy.mjs:91-160`, `scripts/test-invite-proxy.mjs:164-235`, `scripts/test-invite-proxy.mjs:450-484`). | Use the script's named `stage` (`scripts/test-invite-proxy.mjs:164-166`, `scripts/test-invite-proxy.mjs:485-486`) to repair that integration; cleanup already runs in `finally` (`scripts/test-invite-proxy.mjs:487-494`). |
| `verify:deployment` | Docker Compose cannot be parsed or violates the expected network, mount, resource, image, migration, or proxy configuration (`scripts/verify-invite-deployment.mjs:77-120`). | Fix deployment/config files before tagging. A local non-production OpenResty skip is not a production proof. |

### Verification commands

Focused implementation checks, in increasing scope:

```bash
npm run verify:release-input
npm run test:release-contract
npm run test:updater
npm run check:release
git diff --check
```

`git diff --check` remains a required local completion command (`.trellis/spec/frontend/quality-guidelines.md:7-15`, `.trellis/spec/backend/index.md:21-25`), but a bare invocation in a clean Actions checkout detects no committed diff. It should not be advertised as a CI gate unless a reviewed, event-specific comparison range is added. That range work is outside the minimal release-gate consolidation.

### Rollback points

1. After package-script consolidation: if `check:release` cannot run on supported collaborator machines, revert only the updater-script inclusion and redesign the platform split; do not remove the Ubuntu assertion from either trusted job.
2. After adding `ci.yml`: if the new job cannot run the existing Docker/proxy gate on the GitHub-hosted Ubuntu image, disable/revert the new workflow while preserving the trusted tag workflow, then research the runner constraint. Do not weaken `check:release` to hide the environment failure.
3. After simplifying `release.yml`: if release-contract tests no longer prove every gate precedes bundle construction, restore the former pre-artifact block before touching artifact/publish steps.
4. If a check exposes a PRD/spec conflict, follow `.trellis/workflow.md:559-563`: return to planning for a PRD defect, revert the implementation for a wrong boundary, or add research rather than changing the test to accept both outcomes.

### External references and versions

No external documentation was needed; the repository's executable workflow and pinned dependency graph are the source of truth for this research. Relevant versions are Node `22.23.2` in the trusted job (`.github/workflows/release.yml:30-37`), Playwright `1.61.1` locked in `package-lock.json:769-783`, and Vitest `2.1.9` locked in `package-lock.json:2831-2844`. No dependency upgrade is part of the minimal change.

### Related specs

- `.trellis/spec/backend/release-process.md:23-24` — stable publishing remains tag-only.
- `.trellis/spec/backend/release-process.md:42-51` — a failed tag workflow is not a published release.
- `.trellis/spec/backend/release-process.md:64-72` — release input and release-contract tests are pre-tag requirements.
- `.trellis/spec/frontend/quality-guidelines.md:5-24` — frontend test/build/E2E and real-browser expectations.
- `.trellis/spec/backend/index.md:21-25` — Access, deployment, Compose, and local diff checks.
- `.trellis/workflow.md:528-557` — full-scope final quality pass.

## Caveats / Not Found

- The task PRD, design, and implementation artifacts now contain the reviewed gate topology and acceptance boundaries; this research report remains the evidence source for the implementation/check agents.
- A macOS run of `npm run check:release` can execute the updater suite, but `test_peer_credentials_round_trip` will skip because `SO_PEERCRED` is Linux-only (`ops/updater/tests/test_protocol.py:73-75`). Only the Ubuntu pre-tag/tag jobs provide the exact Linux gate.
- `verify:deployment` in ordinary mode can report configuration success while skipping the active OpenResty runtime test (`scripts/verify-invite-deployment.mjs:440-455`). Production probes and `verify:production` are not part of PR/main CI.
- `test:e2e:access-proxy` launches Playwright with the system Chrome channel (`scripts/test-invite-proxy.mjs:96-100`), so the job relies on the GitHub-hosted Ubuntu image's Chrome installation in addition to Playwright-managed browsers.
- No branch-protection setting is stored in this repository. Adding the workflow creates the check, but making it required for merge remains a repository-settings action outside this code change.
