# Complete release pipeline and HEIC import

## Goal

Complete the three highest-value approved priorities as one reviewable delivery: restore canonical-main ancestry enforcement for stable releases, catch release and renderer regressions before tagging, and allow local static HEIC/HEIF import without changing FilmFrame's browser-only privacy boundary.

## Parent and child scope

The parent task owns integration order, shared acceptance, and the final no-publication boundary. Independent implementation belongs to these child tasks:

- 08-20-canonical-main-tag-ancestry: stable tags must be contained in live canonical main, with safe non-rewriting reconciliation guidance.
- 08-20-pretag-ci-renderer-fallback: reusable release gates, PR/main CI, and Worker-to-main-thread fallback automation.
- 08-20-local-heic-heif-import: browser-local HEIC/HEIF conversion and upload/render integration.

## Requirements

### R1. Integrate the three child contracts in a safe order

- Finish and check release workflow/CI contracts first.
- Finish and check local HEIC/HEIF import second.
- Treat fresh remote main reconciliation as the final delivery gate, after all code and automated checks pass.
- Keep the parent as an integration/review task; do not create a fourth implementation path that duplicates child work.

### R2. Preserve release and publication boundaries

- A stable tag must be rejected before dependency installation or publication when its SHA is outside freshly fetched origin/main.
- One documented npm run check:release gate must cover release-input, release-contract, frontend/Access, updater, desktop browser, backup, access-proxy, and deployment checks.
- PR/main CI is read-only and must not authenticate to GHCR, build/push images, attest, publish manifests, create evidence, create Releases, deploy, or create/move/delete tags.
- The existing tag-only workflow retains exact tag/repository/ref/HEAD identity validation and performs publication only after the reusable gate.

### R3. Preserve the browser-local photo boundary

- Static HEIC/HEIF files are converted locally through the planned CSP-compatible dependency and then enter the existing preview, dimension, admission, Worker, and Canvas path.
- The original file remains available for best-effort EXIF lookup; the converted JPEG File is the render file.
- Conversion failure is per-file, cleans up resources, and does not discard other valid files in the same selection.
- No server upload, remote conversion, telemetry, persistent photo storage, Worker protocol change, or device-specific path is introduced.

### R4. Reconcile canonical main without rewriting history

- After integration, fetch the live remote state and prove the final candidate descends from refreshed origin/main before any main push.
- Use only ordinary fast-forward or the repository's protected-branch review path.
- After delivery, refresh refs and verify remote main contains the final candidate and all existing stable tag commits.
- Do not create, move, delete, or recreate a version, tag, GitHub Release, deploy bundle, image, manifest, or production deployment as part of this task.

## Acceptance Criteria

- [ ] AC1: The three child tasks have complete PRD/design/implementation artifacts and real implementation/check context manifests, with no seed _example rows or blocking open questions.
- [ ] AC2: The release workflow statically proves live-main fetch and tagged-SHA ancestry before dependency installation and publication.
- [ ] AC3: npm run check:release is the documented reusable gate for release-input, release-contract, frontend/Access, updater, desktop browser, backup, access-proxy, and deployment checks; tag-specific identity checks remain ahead of it.
- [ ] AC4: PR/main CI runs the reusable gate on Ubuntu 24.04 with Node 22.23.2, both dependency trees, Chromium/Firefox/WebKit, and the Linux peer-credential assertion, with read-only permissions and no publication commands.
- [ ] AC5: Worker failure automation proves started eligible single-image and strip requests fall back to the main-thread engine, while cancellation remains terminal and the Chromium path observes a real Canvas export and successful result.
- [ ] AC6: Static HEIC/HEIF inputs are converted locally into renderable JPEG Files while the original File is used for EXIF, existing admission/warnings and Object URL ownership remain intact, and per-file failure isolation is tested.
- [ ] AC7: Maintained documentation states the canonical-main/tag rule, reusable pre-tag gate, local HEIC/HEIF privacy boundary, converter cost/license, single-still scope, and the absence of physical-device evidence in this delivery.
- [ ] AC8: Desktop automated checks pass for the affected paths, git diff --check passes, and no physical-device test is run.
- [ ] AC9: No product version, Git ref, tag, Release, image, manifest, deployment, or external publication is changed by this task. Any later main reconciliation is separately evidenced as a safe fast-forward/protected-branch action.

## Out of Scope

- Physical iPhone, iPad, Android, or other real-device testing.
- Creating or pushing a stable tag, bumping versions, creating a GitHub Release, publishing an image/manifest/attestation, building a deploy bundle, or deploying production.
- Force-pushing, resetting, moving, deleting, recreating, or backfilling main or existing tags.
- Changing GitHub branch protection/rulesets, adding release infrastructure, or introducing a second release-gate abstraction.
- Live Photo/video/animation import, full HEIC multi-frame semantics, original HEIC metadata round-trip, server-side conversion, uploads, telemetry, or persistent photo storage.

## Blocking Open Questions

None.
