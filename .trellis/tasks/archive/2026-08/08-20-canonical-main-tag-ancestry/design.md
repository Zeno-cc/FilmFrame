# Design: Canonical main and tag ancestry enforcement

## Boundary and ownership

The trusted GitHub Actions workflow remains the authoritative enforcement point for stable releases. The repository's existing Node release-contract test protects the workflow shape from accidental removal or reordering. Maintained release documentation owns the operator contract. No new release wrapper or policy service is introduced.

## Workflow guard

Add one early shell step immediately after `actions/checkout` and before Node setup:

```bash
set -euo pipefail
git fetch --no-tags origin main:refs/remotes/origin/main
git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main
```

Use an explicit conditional around `merge-base` to print an actionable failure containing `GITHUB_REF_NAME` and `GITHUB_SHA`. The checkout already uses full history, while the explicit fetch guarantees that the remote-tracking `main` ref is current for this run. `--no-tags` avoids changing the tag set merely to answer an ancestry question.

The tagged checkout SHA remains the source operand because the existing workflow already proves that `HEAD` equals `GITHUB_SHA`. The live remote-tracking `main` ref is the canonical destination operand.

## Contract test

Extend `ops/release/tests/release-tooling.test.mjs` in the existing static workflow-contract section. Parse/read the workflow using the established test style and assert:

1. the explicit `origin main:refs/remotes/origin/main` fetch exists;
2. `git merge-base --is-ancestor` names `$GITHUB_SHA` and `refs/remotes/origin/main`; and
3. the ancestry guard appears before `npm ci` and the first trusted release gate.

The test intentionally does not emulate GitHub Actions or reproduce Git's ancestry algorithm.

## Documentation contract

Update `.trellis/spec/backend/release-process.md` and `ops/release/README.md` to require canonical-main containment before a stable tag is pushed. Update other maintained release-gate documentation only where it currently describes the same supported operator flow. Stale worktree snapshots are not authoritative and must not be used to select a candidate commit.

## Canonical-main reconciliation

Main reconciliation is an explicit operator sequence after all three child tasks are integrated and automated checks pass:

1. Record the final integration candidate SHA.
2. Fetch/prune live remote branches and tags.
3. Prove the refreshed `origin/main` is an ancestor of the candidate.
4. Advance local `main` with `--ff-only`, then perform an ordinary push, or use the normal protected-branch review path if direct push is rejected.
5. Fetch again and prove that remote `main` contains the candidate and every existing stable tag commit.

If step 3 fails, no ref is changed. The candidate must be reintegrated with the new remote history before retrying.

## Compatibility and rollout

- Future tags created after this guard lands are covered by the workflow committed at their tagged SHA.
- Historical/off-main tags whose commits contain an older workflow cannot be retroactively governed by this repository change; remote rulesets would be required for that stronger policy.
- The main push itself does not trigger the tag-only release workflow.

## Rollback

- Before the remote main push, workflow and documentation changes can be reverted with normal commits.
- After a successful fast-forward push, corrections use normal revert/fix commits; remote history and existing tags remain immutable.
