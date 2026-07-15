# Technical Design

## Architecture Boundary

This change extends the existing data-driven real-135 capability. `REAL135_TEMPLATE_URLS` remains the single source of truth used by App settings, capability copy, render selection, and flattened-template loading. No new component or renderer branch is required.

## Deterministic Asset Pipeline

For each source, use the measured black aperture rectangle `{x, y, width, height}` to split the source into a 3x3 grid. Resize the source columns independently to target widths `92 / 1123 / 92` and source rows independently to target heights `211 / 800 / 192`. Stitch the nine resized regions into a `1307x1203` RGB PNG, then fill the target aperture exactly black.

This method keeps film material at the canvas edges and avoids global affine scaling, which previously introduced black padding or misaligned the aperture. It also handles the `1202`-pixel Tri-X source and already-`1307`-pixel P3200 source without special runtime behavior.

The imagegen skill classifies the supplied files as edit targets, but no generative edit is needed: deterministic ImageMagick geometry processing better preserves the artwork and exact pixel contract.

## Registry Contract

Add one exported URL constant per asset in `services/filmOverlay.ts`, then map each remaining `FilmType` in `REAL135_TEMPLATE_URLS`. `supportsReal135Template()` and `getReal135OverlayUrl()` remain unchanged.

The established renderer behavior remains:

- Gold 200: layered template and Worker eligible.
- Every other registered stock: flattened overlay on the main thread.
- Missing/unloadable flattened asset: existing programmatic real-135 fallback.
- Flattened strip: complete frames with `frameGap=0`.

## Verification

Asset verification checks PNG metadata, the full target aperture mean/standard deviation, and outer-edge luminance. Unit tests cover all 16 URLs and capability flags plus non-Gold Worker rejection. Playwright parameterizes the 11 new stock selections through single and strip generation. A browser screenshot smoke test validates representative color-negative, slide, black-and-white, and third-party templates.

## Rollback

The registry is the feature gate. Removing a defective stock's mapping disables its real-135 option without affecting the remaining templates. Assets are additive, and no persisted settings schema changes are introduced.
