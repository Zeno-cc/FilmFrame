# Implement: complete physical 135 replacement

## Phase 0 — Baseline and provenance

- [x] Record current real-135 single/strip geometry, source-crop semantics, Worker/main/export contracts, spectral stock mappings and unsupported-stock boundaries.
- [x] Create a provenance-backed full-frame 135 physical specification with measured/nominal/artistic fields and no unlicensed artwork/font/source-scan imports.
- [x] Build deterministic old-vs-new comparison fixtures, acceptance tolerances and explicit approximation disclosures.

## Phase A — Physical plan and compatibility shell

- [x] Implement typed millimetre geometry, gate/perforation/advance plans, crop registration and orientation tests.
- [x] Implement stable body/frame seed domains, normalized settings, preferences/recipes/render identity and roll/image ownership.
- [x] Add the opt-in physical 135 controls and classic compatibility selection without changing the legacy default yet. Keep edge renderer and imaging mode separate, define every compatibility combination and reject unsupported combinations before allocation.
- [x] Share plan creation between main and Worker; add bounded resource/budget contracts and regression tests.

## Phase B — Physical frame rendering

- [x] Render gate/crop exposure, restrained edge material, imprints and optical softness into the expanded film frame.
- [x] Implement perforation film-presence blending with stock-specific base-canceling hole CMY before paper exposure; black/open backing and scan-light/cut-wall composition happen only afterward. Add clear-receiver and degenerate-solution tests, not just alpha-mask checks.
- [x] Add coherent continuous-strip planning and body/frame-specific variation, without duplicate legacy template/color/grain stages.
- [x] Integrate supported spectral resources through a physical-frame float adapter; preserve explicit unsupported-stock boundaries and CPU/GPU equivalence.
- [x] Add restrained fog/leaks with zero defaults/disabled semantics and document any non-spectral approximation honestly.

## Phase C — Production lifecycle and visual acceptance

- [x] Verify actual single/strip Worker/main routes, cancellation/stale results, JPEG/PNG export, preferences/recipes and classic compatibility.
- [x] Measure expanded-canvas CPU/GPU/Canvas allocations, first/reprint/readback/export timings and cleanup on real production paths.
- [x] Validate fixed numerical fixtures and real-browser output at multiple seeds, bright/dark images, portrait rotation and one/four/five-frame strips.
- [x] Conduct fit/100%/200% visual review; fix seams, hard holes, excessive rims, texture repetition, text collisions and unsupported parity claims.
- [x] Run full `npm run check`, `npm run test:e2e`, `npm run test:provenance`, `git diff --check` and independent `trellis-check`; fix and re-review findings.

## Phase D — Replacement migration

- [x] Record the physical-vs-legacy go/no-go review, including stock support, approximation, performance and unresolved licensing boundaries.
- [x] Only after all acceptance gates, switch real-135 default to the physical full-frame pipeline with a versioned settings migration and explicit classic compatibility route.
- [x] Re-run the complete legacy/physical/browser matrix after the default switch and prove rollback by settings, not silent renderer fallback.
- [x] Update rendering/spec/provenance/task evidence and identify any separately scoped removal of obsolete duplicate paths. Do not commit/push or claim public distribution clearance.

## Rollback Points

- Phase A introduced plans/settings only while legacy renderer remained default.
- Phase B/C physical output stayed opt-in until the replacement gate.
- Phase D is reversible through the validated `legacy-template` setting; no destructive asset deletion is required for rollback. New sessions now use physical135, while existing preference envelopes keep their saved mode.
