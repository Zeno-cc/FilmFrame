# Implementation plan: Pre-tag CI and renderer fallback automation

## Ordered checklist

1. Add the portable `test:updater` script and expand `check:release` in `package.json`.
2. Add `.github/workflows/ci.yml` with read-only PR/`main` triggers, pinned setup, both installs, all Playwright engines, Linux peer-credential assertion, and `npm run check:release`.
3. Simplify the pre-artifact quality block in `.github/workflows/release.yml` to the Linux assertion plus reusable gate while preserving tag-specific validation and release-only steps.
4. Update `ops/release/tests/release-tooling.test.mjs` for package-script composition, CI topology/read-only guarantees, and tag workflow ordering.
5. Extend `tests/filmWorkerClientFallback.test.ts` with eligible started-Worker failure tests for single and strip APIs, including exact argument/budget preservation and cleanup.
6. Add `tests/e2e/worker-main-thread-fallback.spec.ts` with a page-local fake Worker, Canvas export probe, real-135 upload/develop flow, and success/error assertions.
7. Update maintained release/quality documentation where it names the pre-tag command or fallback coverage contract.
8. Run focused tests, then the full reusable release gate.

## Validation commands

```bash
npm run verify:release-input
npm run test:release-contract
npm run test:updater
npx vitest run tests/filmWorkerClient.test.ts tests/filmWorkerClientFallback.test.ts
npx playwright test tests/e2e/worker-main-thread-fallback.spec.ts --project=chromium
npm run check:release
git diff --check
```

## Review gates

- Every listed command detects a concrete release or renderer failure and changes the next action; no duplicate audit-only command is added.
- PR/`main` CI has no write/publication permissions or commands.
- The tag workflow's exact identity validation remains ahead of the reusable gate, and the reusable gate remains ahead of bundle creation.
- The unit tests prove the Worker was eligible and received a request before asserting fallback.
- The browser test proves real HTML Canvas export, not only mocked engine delegation.
- Cancellation and normal Worker success tests remain unchanged and green.

## Risky files and rollback points

- `package.json`: command composition can make collaborator/CI environments diverge; revert only the unsupported platform split, never the Ubuntu peer-credential assertion.
- `.github/workflows/ci.yml`: if the hosted runner cannot execute the existing Docker/proxy contract, revert the new workflow without weakening the trusted release job.
- `.github/workflows/release.yml`: if gate ordering is unclear, restore the former explicit block before any future tag.
- Browser init script: if it leaks outside the test page or masks normal Worker behavior, remove it and correct test isolation rather than modifying production routing.
