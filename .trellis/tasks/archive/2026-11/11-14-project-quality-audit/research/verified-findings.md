# Verified audit findings — 2026-11-14

## Selected for repair

- `App.tsx`: late upload completion can restore photos after delete-all. Repair with a roll epoch and URL cleanup, plus a delayed-decode browser regression.
- `MobileSettingsSheet.tsx`: CSS-hidden MoreMenu participates in tablet focus trapping. Filter focus candidates by rendered layout; add a 900px keyboard regression.
- `physical135/canvas.ts`: glyph orientation ignores scan straightening; cross-boundary perforation identity treats scan-canvas coordinates as local film millimetres. Repair with focused geometry/raster tests.
- `server/access`: local HTTP redemption and refresh/Passkey origin handling disagree. Preserve strict production HTTPS and test a complete local HTTP Passkey authentication.
- `filmEngine.ts` / `filmWorker.ts`: the disabled aperture shadow remains a required asset. Remove only its load/pass-through and add a Worker/main 404-output regression.
- `filmEngine.ts`: a layered-asset failure in spectral mode can produce a flattened main-thread fallback after Worker failure, unlike the Worker. Preserve the legacy fallback but reject the spectral replacement.
- `package.json`: direct `playwright`/`vite-node` use is not declared; add exact installed versions and resolve the lockfile without installing.
- `playwright.preview.config.ts`: preview can test stale output or an unrelated existing service. Add a build-first script and disable preview-server reuse.
- Documentation: correct Node 22, ten Access test modules, flattened-template Worker routing and disabled-shadow state.

## Open for owner review, not silently repaired

- Schema 007 permits 4096 MiB while declared rollback floor v1.4.0 accepts at most 2048 MiB. Changing the rollback floor or switching behavior requires release-policy evidence; do not truncate administrator settings.
- Development-tool advisories affect Vite/Vitest/PostCSS/tinypool and transitive packages. Review compatible upgrades and run full checks rather than `npm audit fix --force`.
- `public/` contains unreferenced intermediate assets, documentation and `.DS_Store`, which Vite republishes. Moving/deleting historical assets requires ownership and license review.
- Provenance does not yet cover all runtime dependency notices/corresponding source. Do not equate digest validation with distribution clearance.
- Large CPU strips share a 120-second Worker timeout and may repeat the same work on the main thread. Historical measurements show risk, but current multi-size profiling is needed before changing timeouts or fallback.
- Legacy/unreferenced helpers and configuration files are deletion candidates only after consumer confirmation; no broad cleanup in this audit.
- Native SpektraLab parity, measured Pro 400H edges and CineStill IIR equivalence remain explicit limitations, not bugs to disguise with tests.

## Verification boundary

All Docker-related commands are prohibited by the user for this audit. Local Docker build attempts before that instruction failed from memory pressure; no production Docker deployment occurred. Static deployment checks passed except the active OpenResty check, which was not run.

## Final evidence

- `npm run check:all`: 37 frontend test files / 328 tests, spectral validation, TypeScript/build and 121 access tests passed.
- Final production matrix: 90 passed, 10 development-only selections intentionally skipped. Those development diagnostics passed separately 12/12, including both five-frame strip angles.
- Firefox and WebKit focused workflows passed; physical-device behavior was not tested.
- Release contracts 22/22, backup 4/4, provenance 7/7 and updater 52 passed plus one Linux-only skip passed in local checks.
- Independent `trellis-check` found no new implementation defect. Its two Gold evidence gaps were closed by intercepting the real shadow URL and testing spectral layered-asset failure versus legacy fallback; final independent confirmation found no new issue.
- `git diff --check` passed. No commit, push, deployment, release or destructive cleanup was performed.
