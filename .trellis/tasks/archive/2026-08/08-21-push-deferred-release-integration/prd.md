# Release FilmFrame v1.4.12

## Goal

Publish the already verified release work as FilmFrame `v1.4.12` so the updater
can discover the immutable GitHub Release and its deployment assets.

## Confirmed Facts

- The existing product version is `1.4.11` in the root package, access-service
  package, and release input; a default patch release would be `1.4.12`.
- On the fresh fetch performed on 2026-08-21, the current candidate descends
  from `origin/main` at `96ee214`.
- The current candidate includes the previously verified release-pipeline,
  Worker fallback, and HEIC/HEIF import work.
- The user previously requested no physical-device testing, then requested a
  direct release and explicitly approved the documented release waiver on
  August 21, 2026. The frontend release contract normally requires physical
  iPhone Safari and Android Chrome smoke testing before authorizing a release
  tag.

## Requirements

- If authorized after resolving the physical-device-test conflict, increment all
  three release version sources to `1.4.12`.
- Preserve remote history and existing tags: no force push, tag move, tag delete,
  or tag recreation.
- Run the prescribed release gate and verify the candidate remains in freshly
  fetched `origin/main` before tagging.
- Push the canonical branch and annotated stable tag, then verify the GitHub
  Actions release workflow creates the GitHub Release, manifest, deploy bundle,
  and versioned images.

## Acceptance Criteria

- [x] A release decision explicitly resolves the physical-device smoke-test
      requirement.
- [x] The three version sources are exactly `1.4.12`.
- [x] `npm run check:release` and release-input validation pass for `v1.4.12`.
- [x] The tagged commit is contained in freshly fetched `origin/main`.
- [x] The `v1.4.12` GitHub Release exposes its canonical manifest and deploy
      bundle; only then is the update reported as published.

## Release Evidence

- Release commit: `169ce4d431949a21621454a874e132c5ef08ab8f` is both
  `origin/main` and the peeled `v1.4.12` tag target.
- Trusted release workflow: succeeded on 2026-08-21 at
  `https://github.com/Zeno-cc/FilmFrame/actions/runs/32440536930`.
- GitHub Release: published on 2026-08-21 at
  `https://github.com/Zeno-cc/FilmFrame/releases/tag/v1.4.12`, with
  `filmframe-deploy-1.4.12.tar.gz`, `filmframe-release-manifest.json`, and
  `manifest.schema.json`. The downloaded manifest passed
  `validate-manifest.mjs --check-canonical`.
- GitHub's release API reported `immutable: false`; the workflow's immutable
  release step succeeded, but the API does not expose an immutable-release
  flag for this published release. The annotated stable tag itself was created
  once and was not moved, deleted, or recreated.

## Out of Scope

- New product functionality or unrelated refactoring.
- Altering the release workflow or bypassing branch/tag protections.
- Treating a branch-only push as a published update.

## Release Waiver

The user explicitly authorized `v1.4.12` publication without the physical
iPhone Safari and Android Chrome smoke protocol. This is a release-specific
waiver, not evidence that desktop automation substitutes for device coverage.
The handoff must disclose that the tag was authorized under this waiver.
