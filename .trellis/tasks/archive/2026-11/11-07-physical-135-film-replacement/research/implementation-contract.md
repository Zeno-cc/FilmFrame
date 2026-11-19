# Concise physical 135 implementation contract

## Required reading

Read the parent task `prd.md`, `design.md`, `implement.md` first. This short contract preserves the non-negotiable decisions when larger research files exceed context injection limits.

## Product boundary

- Complete full-frame 135 physical replacement; no half-frame/120/XPan/Date Back in this increment.
- Legacy real-135 templates become explicit classic compatibility after a separate final acceptance/migration. Do not switch the default during Phase A–C.
- Edge renderer and imaging mode are separate settings. Physical+legacy is only labeled geometry/backing approximation; physical+spectral is the full route for validated supported color negatives. Unsupported combinations fail before allocation; no silent mode switch.
- Photos stay local in browser main/Worker/CPU/GPU paths. No native app, server conversion, runtime CDN or external photo requests.
- GPL/CC reuse notices and existing unresolved public-distribution blockers remain; no unlicensed SpektraLab artwork/fonts/screenshots or claims of measured fidelity without evidence.

## Correct rendering order

```text
source/crop
-> expanded gate exposure + edge imprints/fog/leaks
-> development/spatial effects as enabled
-> negative density
-> perforation film-presence blending with stock-specific base-canceling hole CMY
-> supported print/scan
-> backing/cut-wall/scan light
-> output/export
```

Do not call the aperture-only adapter around a finished border. Split reusable spectral stage orchestration from `canvasAdapter` into a physical-frame adapter. No duplicate legacy Gold transform/template/tint/grain/markings on the new output.

Perforations are absent film, not black/transparent pixels. Blend base-canceling hole CMY by coverage before paper exposure so the receiver sees clear light; backing comes after scan and is never developed. Verify film-present pixels unchanged, clear receiver exposure within tolerance, soft-edge blending and explicit rejection of degenerate solutions. An alpha-only hole mask is insufficient.

## Physical plan and seeds

- Immutable film-mm `PhysicalFilmPlan`, explicit gate/advance/perforation geometry, px/mm, crop registration, backing and optical provenance. Do not treat nominal 36x24 or shared 1123/800 as a measured universal gate.
- Independent body and frame/advance/scan seed streams. Body persists across roll; frame seed affects only frame-specific variation. Never use wall-clock randomness or local path disclosure.
- Normalize/persist new settings, propagate through Worker, preferences/recipes and render-result keys. Single/strip equivalent scale uses the same physical plan.
- Preview/high and same browser/seed/settings must be deterministic; no per-render re-randomization.

## Required engineering boundaries

- Shared typed plan/drawing helpers across HTMLCanvas/OffscreenCanvas. Separate scratch WebGL surface from 2D destination canvas; density never passes through 8-bit intermediates.
- Bound overscan/strip CPU/GPU/Canvas allocations before allocation; clean all resources on success/error/dispose.
- Worker failure retries once on main with identical physical settings; cancellation is terminal. GPU failure uses equivalent CPU physical path or explicit error, never a legacy-template fallback.
- Keep B&W, positive/slide, CineStill-specific halation and unsupported exact-stock mappings distinct. Approximate layouts/fog must be labeled, not sold as full native parity.

## Acceptance gates

1. Unit: geometry/orientation/seeds/settings identity and zero-controls behavior.
2. Numerical: expanded exposure/development, perforation mask, finite floats, CPU/GPU tolerances.
3. Production: Worker/main, single/strip, cancellation/stale URLs, JPEG/PNG, lifecycle and no external requests.
4. Visual: fit/100%/200%, bright/dark, multiple seeds, portrait rotation, one/four/five-frame continuous strips, no repeated-card seams/dark uniform rings/text collisions/double effects.
5. Full checks: `npm run check`, `npm run test:e2e`, `npm run test:provenance`, `git diff --check`, independent `trellis-check`.
6. Only after recorded go decision: versioned real-135 default migration, classic compatibility and complete revalidation. No automatic commit/push/release.
