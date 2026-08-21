# Implementation Plan — FilmFrame v1.4.12

## Preconditions

- Receive explicit approval of this release plan and an explicit decision on the
  physical iPhone Safari / Android Chrome smoke-test gate.
- Do not perform a stable release if the user keeps the gate in force while
  declining the tests.

## Steps

1. Fresh-fetch `origin`; inspect divergence and safely integrate the candidate
   with the latest canonical `origin/main` using the normal protected-branch
   path. Stop for user direction if branch protection requires external review.
2. Change all three product-version sources from `1.4.11` to `1.4.12`; validate
   the release input against `v1.4.12`.
3. Run `npm run check:release` because it detects mismatched release metadata,
   contract regressions, build/type/test failures, desktop browser failures,
   updater failures, and deployment-check failures. Run `git diff --check` to
   detect patch whitespace errors.
4. Record the physical-device smoke result, or the approved waiver, in the task
   record before release authorization.
5. Present the commit plan, commit the release metadata, then fresh-fetch again
   and prove the candidate is contained in `origin/main`.
6. Push through the permitted canonical-main mechanism; re-fetch and verify the
   remote main ref contains the exact candidate.
7. Create and push one annotated `v1.4.12` tag. Never force-push, move, delete,
   or recreate a stable tag.
8. Wait for the Release workflow, then verify the immutable GitHub Release,
   canonical manifest, deploy bundle, and versioned image references. Report
   success only after those artifacts exist.

## Verification

```bash
npm run verify:release-input
npm run test:release-contract
npm run check:release
git diff --check
git merge-base --is-ancestor <candidate> origin/main
```

The final ancestry command is run only after fetching the live remote; a stale
tracking reference is insufficient.
