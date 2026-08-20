# Implementation plan: Canonical main and tag ancestry enforcement

## Ordered checklist

1. Add the early live-main fetch and ancestry guard to `.github/workflows/release.yml` immediately after checkout.
2. Extend `ops/release/tests/release-tooling.test.mjs` with focused assertions for the guard's commands, operands, and ordering.
3. Update `.trellis/spec/backend/release-process.md`, `ops/release/README.md`, and any maintained release-gate section that currently describes stable-tag preparation.
4. Run the focused release-contract test and inspect the workflow diff for YAML/shell quoting correctness.
5. Defer all Git ref mutation until the other two child tasks are implemented, checked, and integrated.
6. Record the final integration candidate SHA, fetch the live remote, and prove `origin/main` is its ancestor.
7. Advance and push `main` only by fast-forward (or the protected-branch review path), then fetch and verify remote containment of the candidate and all existing stable tags.

## Validation commands

```bash
npm run test:release-contract
npm run verify:release-input
git diff --check
```

Before the main push:

```bash
git fetch --prune --tags origin
git merge-base --is-ancestor origin/main <final-integration-candidate>
git rev-list --left-right --count origin/main...<final-integration-candidate>
```

After the main push, fetch again and verify the remote contains the candidate and each existing stable `vMAJOR.MINOR.PATCH` tag.

## Review gates

- The ancestry step is after checkout and before every dependency/build/publish step.
- The test fails if the guard is removed, its operands drift, or it moves after `npm ci`.
- Documentation does not claim that a branch-only push is a release.
- A fresh remote fetch, not the stale local tracking ref, determines whether delivery is safe.
- No tag/version/release/deployment action is included.

## Risky files and rollback points

- `.github/workflows/release.yml`: a quoting or ordering mistake can block releases; rollback with a normal correcting commit before any future tag.
- `main` ref: record old remote and candidate SHAs before delivery. If ancestry fails or the push is rejected, stop without rewriting history.
- Existing tags: immutable throughout; no rollback operation may move them.
