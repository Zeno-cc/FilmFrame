# Research: Integration boundaries for the three approved priorities

- Scope: parent-task integration only
- Date: 2026-08-20

## Child deliverables

1. Canonical main/tag ancestry enforcement protects stable release publication from an off-main tag and documents safe fast-forward reconciliation.
2. Pre-tag CI and renderer fallback automation creates one reusable release gate, runs it on pull requests and canonical main, and proves started-Worker failure recovery in unit and desktop-browser automation.
3. Local HEIC/HEIF import converts supported stills in the browser before they enter the existing File-based preview, admission, Worker, and Canvas pipeline.

Each child has an independently testable product or operational contract. The parent owns sequencing, cross-child acceptance, and the explicit no-publication/no-device-test boundary; it is not a fourth implementation target.

## Required ordering

### First: release contracts and pre-tag automation

Implement and check the canonical-main guard and reusable CI/release gate before changing the upload path. This establishes the workflow contract tests and lets later changes use one known pre-publication command.

### Second: HEIC/HEIF import

Implement and check local conversion against the existing upload service and renderer contracts. Its dependency and lockfile changes must be visible to the release contract and normal build/test gates.

### Third: remote main reconciliation

Only after all child implementations and checks pass may the final integration candidate be compared with a freshly fetched live origin/main. If it is a descendant, a normal fast-forward/protected-branch path may be used; if not, stop and reintegrate. No force-push or tag movement is allowed.

## Cross-cutting invariants

- Photos, EXIF, converted Blobs, Object URLs, and rendered outputs stay in the browser session. No backend or CI change may introduce an image upload or remote conversion path.
- The trusted tag workflow remains the only publication path. PR/main CI and a branch push create no image, bundle, manifest, GitHub Release, or deployment.
- Existing lockfiles, release-input/version identity, immutable stable tags, and canonical-main ancestry remain explicit checks.
- Desktop Vitest, typecheck/build, Playwright, updater, backup, access-proxy, deployment, and release-contract checks remain in scope. Physical-device testing is intentionally excluded.

## Non-goals and risk decisions

- Do not add feature flags, compatibility layers, hashes/checksums, new wrapper frameworks, or a second release-gate manifest.
- HEIC conversion is single-primary-still, JPEG intermediate, best-effort EXIF, and local-only. Live Photo, video, animation, metadata round-trip, and server conversion are deferred.
- The heic-to/csp dependency has a material first-use package cost and LGPL-3.0 license; these are release-review items, not reasons to weaken CSP or silently ship a remote fallback.
