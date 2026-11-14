# Baseline evidence — 2026-11-14

- `npm run check`: passed, 37 test files / 322 tests, spectral stage validation, TypeScript and production build.
- `npm run check:access`: passed; access tests, TypeScript and build.
- `npm run test:updater`: passed; Python updater tests and installation-layout check.
- `npm run test:release-contract`: 22 tests passed.
- `npm run test:backup`: 4 tests passed.
- `npm run test:provenance`: 7 tests passed; inventory reports 17 entries and preserves unresolved rights/corresponding-source blockers.
- `npm run verify:deployment`: local configuration checks passed. Active OpenResty config test skipped; no live deployment was contacted.
- `npm run test:e2e:access-proxy`: first run failed during Docker build with server EOF. Isolated retry failed after the frontend build was killed: `cannot allocate memory` / Docker EOF. This is a reproducible local container-resource blocker, not evidence of a product failure. Host `npm run build` passes.
- 2026-11-14 user boundary: no Docker-related commands for the remainder of this audit. The proxy integration check is intentionally skipped; no production Docker deployment was performed.

The working tree already contains unrelated changes from the spectral migration and other work. Preserve them; do not attribute baseline behavior to this audit without a before/after check.
