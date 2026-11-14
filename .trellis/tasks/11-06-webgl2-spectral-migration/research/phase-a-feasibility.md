# Phase A WebGL2 spectral feasibility evidence

- Date: 2026-11-06
- Scope: isolated Portra 400 -> Portra Endura pointwise WebGL2 backend and local browser harness. No production FilmFrame integration, stock migration, external image/photo, remote service, native spatial/stochastic effect, or public distribution.
- Reference: existing `services/spectral` CPU implementation and pinned resource/notices, unmodified by this task.

## Implementation boundary

- `WebGlDevice` requires WebGL2, `EXT_color_buffer_float`, fragment highp and tested RGBA32F rendering/FLOAT readback. It records actual renderer/version/limits/precision, probes RGBA32F/RGBA16F, owns GL resources/listeners, rejects loss/disposal and explicitly loses its owned context on disposal.
- Five single-output passes: film exposure, film development/DIR, paper exposure, paper development, scan/OkLch/sRGB. Negative and paper densities remain RGBA32F textures. No intermediate Canvas or 8-bit density representation is used. `readStage` is the explicit test/integration readback boundary.
- Resource layouts are generated from the validated existing arrays. Curve source `[index, channel]` is transposed to texture `[channel, index]`; film TC C-order `[x,y]` is sampled at `texel(y,x)`. DIR uses three donor-row uniforms matching `film.ts` exactly.
- Failed allocation, pixel and texture-byte budgets are rejected. Repeated print/scan keeps its source negative texture and performs zero readbacks.

## Numerical tolerance and result

Original, unrelaxed thresholds: film raw / negative / paper log `2e-5 + 2e-6 * abs(expected)`; paper density and print RGB `3e-5 + 2e-6 * abs(expected)`. No tolerance was loosened.

| Browser / actual WebGL renderer | Gray-ramp16 | Green8 | Synthetic sRGB64 | Lifecycle |
| --- | --- | --- | --- | --- |
| Installed Chrome 156.0.8078.80 / ANGLE Metal Apple M4 | all five stages pass | pass | pass | pass |
| Playwright Firefox 151 / reported Apple M1 or similar | all five stages pass | pass | pass | pass |
| Playwright WebKit 26.5 / Apple GPU | all five stages pass | pass | pass | pass |
| Playwright Chromium 149 / ANGLE Vulkan SwiftShader | all five stages pass | `printRgb` only: max `0.0000306963921`, 64 violations | `printRgb` only: max `0.0001060813665`, 512 violations | pass |

SwiftShader therefore does not pass every acceptance fixture at the original thresholds. Its film raw, negative density, paper log and paper density stages all pass, with maxima respectively `8.94e-8`, `1.49e-7`, `1.19e-7`, `3.58e-7` on green and `5.96e-7`, `5.36e-7`, `5.36e-7`, `1.43e-6` on synthetic sRGB. No 8-bit readback or density quantization occurs. CPU/GPU small-fixture outputs are float readback, with an additional packed RGB comparison array explicitly allocated by the harness.

The Cmax investigation found a real coordinate-rounding problem: `(hue - hGrid[0]) / hStep` at hue `2.570454053341811` gave GPU Cmax `0.1471137106`, whereas CPU was `0.1470857338`. Computing the fraction within the selected hue cell, `(hue - hGrid[h0]) / hStep`, gave `0.1470857263`, eliminating the dominant discrepancy. Non-symmetric matrix tests passed for sRGB/XYZ and OkLab forward/inverse matrices. The smaller residual differs by driver; it is not used to justify relaxed tolerances or a silent CPU/legacy substitution.

## ANGLE Metal timing (final clean run)

`webgl-browser-validation.json` is the passing installed-Chrome/Metal evidence. Timings are synchronous `gl.finish()` stage measurements; setup includes resource creation/shader setup. Readback is reported separately, not folded into an interactive-rendering claim.

| Size | CPU first full render | GPU first render incl. pack/upload | Pack input | Upload/alloc | Explicit output readback | GPU repeat print/scan |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 256x256 | 110.1 ms | 5.2 ms | 2.2 ms | 1.2 ms | 4.0 ms | 0.4 / 0.2 ms |
| 1920x1080 | 3624.4 ms | 24.5 ms | 7.3 ms | 9.0 ms | 137.9 ms | 0.9 / 0.3 ms |

`webgl-cross-browser-validation.json` also contains SwiftShader at both requested sizes: 42.8 ms first GPU render and 832.9 ms output readback at 1080p. Its measured parity failure remains visible in that file and makes its runner exit nonzero.

At 1080p, exact logical GPU texture allocation is 232,243,200 bytes for source plus six RGBA32F stage textures (221.47 MiB), plus 1,395,216 bytes fixed setup textures. One full float RGBA readback is 33,177,600 bytes, separate from GPU allocation. At 256x256, the corresponding values are 7,340,032 frame bytes, 1,395,216 setup bytes and 1,048,576 readback bytes. These are logical texture/CPU-buffer sizes, not a driver-RSS or total-memory guarantee. Repeat-print readback count is zero; frame release returns to setup-only bytes and disposal returns to zero.

## Limitations and recommendation

- This is a verified Phase A backend slice, not Phase B/C integration or a production default. SwiftShader's two chromatic print-RGB failures remain a blocker to universal strict-parity claims; do not lower the threshold to hide them. Preserve equivalent explicit CPU fallback/error selection when a backend is integrated later.
- Full output readback can dominate GPU time, especially SwiftShader. A future integration must measure its actual Canvas/Worker/readback path rather than extrapolate from GPU draw time.
- No physical mobile GPU was tested. Firefox/WebKit runs are small focused checks only, not 1080p or full application compatibility.
- Dual-output MRT was replaced by single-output passes after a SwiftShader `INVALID_OPERATION`; no result from the failed MRT path is claimed as evidence.
- Existing Hanatos/KG3 redistribution blockers and GPL/CC source obligations remain unchanged. No public distribution or full SpektraLab parity is claimed.

## Verification

- `npm run typecheck`: passed.
- `npm test -- --run tests/spectralPortra.test.ts`: 10/10 passed.
- `npm run check`: 28 test files / 214 tests, strict typecheck and production Vite build passed.
- ANGLE Metal runner: passed all fixtures/lifecycle/allocations, no console errors or external requests.
- Firefox/WebKit small fixtures/lifecycle: passed, no console errors or external requests.
- SwiftShader runner: intentionally fails on the two documented chromatic print-RGB comparisons; other measurements recorded.
- `git diff --check`: passed.
