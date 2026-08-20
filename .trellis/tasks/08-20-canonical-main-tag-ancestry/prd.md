# Canonical main and tag ancestry enforcement

## Goal

Make `main` the authoritative release line again and prevent a stable release tag from publishing when its commit is not contained in the live remote `main` history.

## Background

- The stable release workflow is tag-triggered and currently validates repository identity, tag syntax, and the checked-out SHA, but it does not validate reachability from `origin/main` (`.github/workflows/release.yml:3-6,25-50`).
- The local remote-tracking ref observed on August 20, 2026 stopped at `96ee214` (`v1.4.6`), while local tags `v1.4.8` through `v1.4.11` are on the current development line and are not contained in that stale `origin/main` ref. The live remote must be fetched again before any ref decision.
- Existing release contracts require immutable tags and exact version/tag agreement, but do not yet state the canonical-main ancestry rule (`.trellis/spec/backend/release-process.md:23-51`).

## Requirements

### R1. Reject off-main stable tags before expensive or publishing work

- The trusted release workflow must explicitly fetch the live remote `main` ref after checkout and before dependency installation.
- It must fail when `GITHUB_SHA` is not an ancestor of `refs/remotes/origin/main`.
- The failure must name the tag/SHA relationship clearly enough for a maintainer to correct the branch lineage.
- The guard must run before Node/browser setup, dependency installation, build gates, artifact construction, image publication, and GitHub Release publication.

### R2. Preserve the workflow guard as a tested release contract

- Add a focused static workflow-contract regression beside the existing release workflow tests.
- The test must prove that the workflow fetches `main`, invokes `git merge-base --is-ancestor` with the tagged SHA and remote-tracking `main`, and places the guard before the expensive release gates.
- Update maintained release documentation and the Trellis release specification so future releases explicitly require stable tag commits to be contained in canonical `main`.

### R3. Restore canonical `main` without rewriting history

- The canonical candidate is the final integration commit containing all three approved child deliverables, not the current pre-implementation HEAD.
- Immediately before any push, fetch the live remote state and prove that the candidate descends from the refreshed `origin/main`.
- Advance `main` only through an ordinary fast-forward push or the repository's normal protected-branch review path.
- If the remote advanced or diverged, stop and reintegrate; do not force-push, reset the remote branch, or move/recreate an existing tag.
- After delivery, refresh the remote refs and verify that the candidate and every existing stable `vMAJOR.MINOR.PATCH` tag are contained in `origin/main`.

## Acceptance Criteria

- [ ] AC1: A release workflow run whose tagged SHA is outside live `origin/main` exits before `npm ci` or any publish step.
- [ ] AC2: A tagged SHA contained in live `origin/main` passes the new ancestry guard and proceeds to the existing release gates.
- [ ] AC3: `npm run test:release-contract` covers the fetch command, ancestry command, operands, and ordering of the guard.
- [ ] AC4: Maintained release documentation states that a stable tag must identify a commit contained in canonical `main` and that existing tags are immutable.
- [ ] AC5: Before delivery, a fresh fetch proves `origin/main` is an ancestor of the final integration candidate; otherwise no main push occurs.
- [ ] AC6: Delivery uses no force-push and creates, moves, or deletes no tag; a post-push fetch proves the final candidate and all existing stable tags are contained in `origin/main`.
- [ ] AC7: Pushing `main` alone creates no release because no new stable tag is pushed.

## Out of Scope

- Creating a new version, stable tag, GitHub Release, deploy bundle, or production deployment.
- Moving, recreating, deleting, or backfilling existing tags.
- Adding a remote GitHub ruleset or changing branch-protection settings.
- Force-pushing or rewriting `main`.
- Physical-device testing.

## Blocking Open Questions

None.
