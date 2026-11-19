# Phase 0 physical 135 specification and baseline

## Scope and defaults

- Full-frame 135 only. `edgeRenderMode` defaults to `legacy-template`; existing real-135 and spectral routes remain unchanged until the final reviewed migration.
- New settings: physical/open-black backing, independent unsigned-32-bit body/frame seeds (default 1), fog 1, leaks 0, straighten 0, aperture f/5.6 fallback. Fields are normalized in `settingsStorage` and included in render-result identity.
- Classic border + physical 135 is rejected. Spectral physical edge requires a registered supported color-negative stock; legacy physical edge is explicitly geometry/backing compatibility, not a spectral-development claim.

## Geometry provenance

| Field | Value / status | Reason |
| --- | --- | --- |
| Film width | 35 mm, nominal 135 format | Physical format geometry, not a claim of an exact camera gate. |
| Advance | 38 mm, nominal full-frame plan | One coherent full-frame plan for single/strip comparison. |
| Perforation | 4.75 mm pitch, 1.98 x 2.80 mm hole, 2.00 mm long-edge offset, 0.50 mm base radius, eight holes/advance | Nominal 135 reference dimensions; orientation is explicit. |
| Gate | 36.25 x 24.3 mm, upstream model | Adapted from the pinned GPL SpektraLab reference; upstream describes this as the mean of seven strips, not a universal ISO gate. |
| Gate/registration variation | Independent body-seeded offsets, radii and perforation phase | Upstream-derived bounded model, not a measured gate for every camera. |
| Hole softness | 0.017 mm physical sigma plus pixel footprint | Upstream-derived optical model, with small deterministic per-hole shape/roughness changes; not a uniform dark outline. |
| Optical aperture | f/5.6 fallback, user range f/1–22 | Declared fallback for missing EXIF; does not pretend EXIF was measured. |
| Backing | open/black, default open | Scan-light composition after print/scan, never negative/paper input. |

The upstream pinned source confirms that base-canceling hole density is solved using a least-squares fit over the film's valid spectral dye/base data, then blended by film-presence coverage. It is not a zero-density alpha cutout. SpektraLab's own measured values are not independently verified here and are not copied into this specification as measurements.

## Film coordinates, imprints and strip continuity

- `plan.film` always uses the film's millimetre coordinate system: `s` along the advance and `t` across the 35mm stock. Portrait orientation belongs only to `filmToCanvas`/`canvasToFilm`; the plan is not transposed a second time at export.
- Gate, photograph, imprints and raster use the same coordinate transform. A portrait source fills its gate without an additional automatic turn.
- `kodakEdge.ts` adapts the pinned GPL Kodak model for the 19mm half-frame grid, stock-specific text, frame and A-frame markers, arrows and the 31-module DX clock/data tracks. Portra 400 uses DX extract 1277 and `KODAK PORTRA 400`; this is not a random decorative barcode.
- Imprint masks contribute exposure before development. Perforation density is still base-cancelled after negative development and before paper exposure. Scan backing and cut-wall light are composed afterward.
- Single-frame rendering retains a 38mm advance window, not merely the photograph's crop. Continuous strips share a global advance/imprint grid, with each frame's photograph developed independently.
- Strip perforations that cross an advance boundary are retained in both adjacent frame canvases, so they form one physical hole rather than two unrelated half-holes. Film material is continuous across the seam; there is no white backing at the artificial frame boundary.

## Density-domain contract

`services/physical135/density.ts` constructs a 3x3 normal-equation system over valid wavelengths and uses pivoted Gaussian elimination. `blendFilmPresence` computes `alpha * developedCMY + (1 - alpha) * holeCMY` before paper exposure. Film-present pixels retain their developed density; hole pixels receive the solved compensation; backing is outside this function.

- Exact independent three-channel fixture: zero residual within `1e-12`.
- Independent overdetermined fixture: coefficients `[-0.270395041979, -0.175895470184, -0.156540464264]` and maximum residual `0.056682440357`, matching an independent NumPy solve. This fixture deliberately does not pretend every matrix can achieve zero residual.
- Real Portra resource data must be validated through the stock-specific solver before production use; no universal hardcoded hole RGB/CMY color is used.
- Non-finite arrays, invalid masks, degenerate dye matrices and out-of-range coverage are rejected.

## Current baseline and explicit exclusions

Current legacy templates remain the production default. No overlay, legacy Gold color or aperture grain is used by the physical pipeline. Unsupported B&W/slide/CineStill spatial behavior remains blocked or compatibility-only.

The first physical adapter must separate expanded exposure/development from final scan composition; it must not wrap a completed border in the aperture-only spectral adapter. Actual full-frame production performance and 135 continuous-strip GPU/CPU budgets are still open and must be measured in Phase C.
