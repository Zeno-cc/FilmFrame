# Final spectral-stock integration validation

- Date: 2026-11-07
- Scope: WebGL2 migration parent and the supported color-negative rollout. No new stock or native spatial/stochastic feature was added during closure.

## Fixes made during final review

- `check-stock-parity.mjs` now executes every derived stock, both gray-ramp16 and green-patch8, and all five numerical stages: 12 stocks x 2 fixtures x 5 stages = 120 checked groups. It uses the established upstream relative tolerances for film/negative/paper-density/output and an absolute `1e-4` bound for paper log exposure. The maximum observed paper-log absolute error was below `0.0000371`; this is not the tighter GPU shader tolerance. The command fails on any violation instead of merely printing errors.
- Added `npm run test:spectral-stocks`, using `vite-node --script` to resolve the TypeScript source imports, and included it in `npm run check`. Plain `node` is not a supported runner for this source dependency graph.
- Separated lightweight stock metadata from numerical resources. `RecipeInspector` no longer imports resource JSON. `canvasAdapter` dynamically loads the selected backend/resource only when spectral single-frame rendering is requested; `stockResourceLoader` binds the current FilmType to an independently loaded, identity- and SHA-256-verified resource. The pipeline/backend require an explicit resource instead of silently loading Portra.
- Changed Vite Worker output to ES modules to match the already-declared `{ type: 'module' }` Worker constructor and permit dynamic-import code splitting. Legacy default application and Worker initial bundles dropped from about 39.5 MiB / 39.2 MiB to 391.79 KiB / 31.19 KiB uncompressed. The resource chunks are intentionally large and lazy, not deleted or misrepresented as small.
- Added a real-browser spectral Worker-failure fallback test. It compares aperture pixels from legacy and spectral forced-main renders, requires distinct pixels and two main-thread exports, and rejects any external request. This proves the fallback does not silently substitute legacy output.
- Updated the spectral NOTICE to reflect the opt-in real-135 single-frame integration rather than claiming the service is still isolated. Updated only its corresponding recorded SHA-256; unresolved distribution rights remain unchanged.
- Captured the registry/resource-loading, backend-error and numerical-validation contracts in `.trellis/spec/frontend/spectral-rendering.md`, indexed from the frontend spec and quality guidelines.

## Final execution evidence

- `npm run check`: 28 files / 217 Vitest tests, 120 stock-stage comparisons, strict TypeScript and production Vite build passed.
- `npm run test:e2e`: 50/50 passed, including Gold layered spectral behavior, forced-GPU failure, explicit spectral-strip scope, spectral Worker-failure/main-thread fallback and focused Firefox/WebKit compatibility.
- `node scripts/spectral/run-stock-rollout.mjs`: all 13 supported FilmTypes rendered actual real-135 single-frame spectral output at 1397x1286 with zero recorded errors after lazy loading. This is not evidence of spectral continuous-strip support or of distinct measured border scans.
- Production preview on port 4175: Portra 400 spectral CPU mode completed through the real bundled module Worker, with no runtime errors or external requests. Development-only harness results are not used as a substitute.
- `npm run test:provenance`: 7/7 passed. `npm run verify:provenance`: all 13 source entries and local SHA-256 values validate, while distribution remains blocked by the listed unresolved rights/readiness entries.
- `git diff --check`: passed.

## Acceptance boundary

The technical migration is limited to opt-in spectral processing for 13 supported color-negative FilmTypes in real-135 single-frame composition. Legacy remains the default. Unsupported exact looks remain blocked; B&W, slide/positive processing, CineStill's distinct spatial halation, continuous spectral strips, camera-negative scan inversion, RAW and full native spatial/stochastic parity remain separate work. The historic Portra dark-column discrepancy and SwiftShader chromatic residual remain documented.

Technical completion and public distribution clearance are different gates. No source/profile rights, historical FilmFrame assets, corresponding-source readiness or public release approval are inferred from these tests.

Independent review found two P1 integration defects; both were fixed and the original reviewer confirmed closure with no new blockers. The findings, fixes, focused re-review and evidence limits are in `research/independent-review.md`. Public distribution remains independently blocked.
