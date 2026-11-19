# Scanline regression investigation — 2026-11-07

## Status

The previous completion claim is withdrawn. Physical 135 remains opt-in; legacy-template remains the default. Phase C visual acceptance is blocked until a natural-photo/full-export matrix is reviewed.

## Reproduced root cause and fix

After a manual 90-degree rotation of a landscape source, the physical plan correctly becomes portrait (`35x38 mm`). `createPhysicalRaster` incorrectly transposed its width/height a second time to `1254x1155` while the actual Canvas was `1155x1254`. The total array length hid the dimension mismatch. Reading row-major presence/backing through the Canvas stride then scattered zero-presence/open-backing samples through the aperture, producing dense horizontal white scanlines before export.

- `createPhysicalRaster` now uses only `plan.outputWidth`/`plan.outputHeight`; it also returns those dimensions and `paintPhysicalFrame` rejects a mismatched Canvas.
- The same production call on main and Worker now preserves continuous aperture row luminance, with no backing rows inside the aperture.
- Physical output restores the existing automatic portrait orientation only for a source that was originally portrait; a manually rotated landscape source is not automatically rotated a second time.
- `physical135Raster.test.ts` asserts portrait raster/Canvas dimensions and full film presence/backing in the gate.
- `tests/e2e/physical135.spec.ts` adds an actual UI manual-rotation regression against the final rendered Blob, with an accepted locally generated natural-color PNG fixture.

The previous extra-rotation explanation alone was insufficient: removing that rotation without fixing raster dimensions still left scanlines. The dimensions are the demonstrated root cause. No spectral numeric constants, GPU Y-flip, or image-content workaround was added.

## Reproduction performed after the user report

- Actual Google Chrome + application Worker at `http://127.0.0.1:5173`.
- Three newly generated local natural-color photo-like inputs, never uploaded.
- Before the dimension fix, manually rotating one landscape source exposed the exact dense-white-line failure in both main and Worker output. The failed artifact was saved as `output/playwright/physical-diagnosis/rotated-final.png` before being overwritten by subsequent diagnostics; later artifacts preserve the fixed result. The investigation log `paint-stage.log` records nonzero original aperture RGB with presence/backing incorrectly marking rows as holes.
- Three-frame GPU physical strip: all frames contain their intended image; no dense white scanlines in the inspected export.
- Earlier adapter reproduction with asymmetric red/blue content: CPU and GPU preserve top/bottom orientation. Therefore the initial suspected WebGL/Canvas Y-flip is NOT established as the cause and must not be patched blindly.
- Both actual CPU and WebGL2 single production renders completed. The browser evidence is under ignored `output/playwright/physical-diagnosis/`.

## Evidence gaps that remain

- The original user photos/settings and the exact displayed/exported artifact are not available to this session. The demonstrated defect and matching white-line mechanism were reproduced with local photo-like images; exact original-photo acceptance cannot be claimed.
- The original template-only tests could not detect dense white periodic lines in natural photos. The new natural-color manual-rotation and five-strip tests directly inspect the final aperture pixels for backing contamination; they must remain mandatory for this renderer.
- Need full-aperture periodic-row detection, natural bright/dark/colorful inputs, both backends and both lifecycle routes, portrait rotation, and single/strip comparisons. Do not mark Phase C complete using fixture-only numerical parity.
- Check any remaining scanline reproduction through the final exported PNG/JPEG bytes, not just a transient UI reveal/bath overlay. Inspect the UI only after its reveal animation settles.
