# Implementation plan

- [x] Map source boundaries and establish frontend/access/operations baselines.
- [x] Complete four independent read-only review partitions and verify their concrete findings.
- [x] Implement evidence-backed local fixes with focused tests and explicit file ownership.
- [x] Run focused and full checks, including affected browser and operations workflows.
- [x] Obtain independent `trellis-check` review and update applicable specs/task evidence.
- [x] Deliver fixed items separately from confirmed open issues and owner decisions.

## Validation

```bash
npm run check:all
npm run test:provenance
npm run test:release-contract
npm run test:updater
npm run verify:deployment
npm run test:e2e -- --config=playwright.preview.config.ts
npm run test:e2e -- --project=firefox --project=webkit
git diff --check
```

Run browser/GPU groups serially. Do not run deployment, publication or remote mutations. The user explicitly prohibited all Docker-related commands on 2026-11-14; the proxy integration check remains skipped. Some commands may require locally available services/tools; report skipped prerequisites rather than treating them as passes.

## Review gates

1. No finding becomes a confirmed bug without a reachable code path.
2. No large refactor replaces a working implementation for stylistic preference.
3. No legal or product tradeoff is silently decided by the audit.
4. Test count and build success do not prove visual/native parity or rights clearance.
5. Preserve all pre-existing dirty work; no commits, pushes, deployment or destructive cleanup.
