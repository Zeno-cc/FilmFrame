# Physical 135 implementation review — 2026-11-07

## Current review status — scanline repair verified; default migration blocked

The reported portrait white-line defect was reproduced and fixed by removing the second portrait raster transposition and aligning orientation/strip coordinates. Final-artifact browser regressions, full `npm run check`, all 62 browser tests and 7 provenance checks pass. The independent check agent returned a budget-limit error, so no independent approval is claimed. See `scanline-regression-investigation.md` and `independent-check.md`. Physical 135 remains experimental; no default replacement or release is authorized.

## Review findings fixed during implementation

1. **Hole semantics:** a simple alpha/black perforation would be wrong. The implementation uses a stock-specific least-squares base-canceling CMY solution and blends it by film-presence before paper exposure. Independent exact/overdetermined and real Portra fixtures validate the solver.
2. **GPU lifetime:** the presence pass uses a temporary target, not the original negative texture. Temporary presence textures are deleted on success and error; frame/backend disposal remains in `finally`.
3. **Orientation:** effective user rotation determines portrait planning, output dimensions and perforation transposition. Output orientation restoration matches existing automatic portrait behavior.
4. **Main/Worker output types:** the shared strip initially preferred OffscreenCanvas and broke main `toBlob`. Main now explicitly uses HTMLCanvas; Worker explicitly uses OffscreenCanvas. Bitmap release is in `finally`.
5. **Seed ownership:** material/hole/leak variation initially used a fixed seed. It now uses actual body/frame seed domains, with deterministic independent streams and indexed perforation traversal.
6. **Claims:** the UI no longer says fog/leak has full measured spectral development. It is explicitly a material/exposure approximation. Procedural markings are not claimed as independently measured stock DX/font layouts.

## Evidence after fixes

- `physical135Plan.test.ts` and `physical135Raster.test.ts` cover numerical solver, geometry, seed domains, backing, zero controls, straightening, portrait and continuous phase.
- Actual Chrome/GPU physical E2E 5/5: single, body/frame controls, portrait, continuous strip, legacy spectral-strip rejection.
- CPU/GPU Worker/main aperture-region comparisons reached zero byte differences in the tested fixture.
- Real five-frame GPU strip: 4700x875, approximately 9.1 seconds in the measured run. Refined single-frame production measurement: approximately 2.9 seconds. Four-frame forced-main CPU strip: approximately 9.4 seconds in the measured run.
- Full validation recorded in `implementation-validation.md`: 237 unit tests, 120 stock/stage comparisons, 59 browser tests and 7 provenance checks, plus production build and `git diff --check`.

## Scope decision

This is a functioning opt-in physical 135 single/strip pipeline, with real spectral development and density-correct perforations. It is not yet proof that the old real-135 default should be replaced for every user. Phase D remains gated on final old-vs-new visual acceptance, stock/layout claims, production performance and a deliberate migration/rollback decision. Legacy default is unchanged. No commit/push/release or public-distribution clearance is implied.
