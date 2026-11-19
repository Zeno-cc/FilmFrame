# WebGL2 Feasibility Evidence

- Date: 2026-11-06
- Status: validated on Apple M4 Chromium / ANGLE Metal plus focused Firefox/WebKit runs. This is not a universal device claim or a production migration completion.

## Verified capabilities

- WebGL2 + `EXT_color_buffer_float` with RGBA32F render targets and FLOAT readback.
- Separate film exposure, film development, paper exposure, paper development and scan passes avoid MRT/feedback issues found in the initial implementation.
- Negative and paper density remain floating-point textures; only explicit test/integration output is read back.
- CPU/GPU strict small-fixture comparisons pass on gray-ramp16, green8 and synthetic sRGB64, including actual sRGB->ProPhoto conversion.
- Budget rejection, context loss, disposal, resource release and no-silent-legacy-fallback checks pass.

## Current Chromium report

`webgl-browser-validation.json` has `status: passed`, Apple M4 / ANGLE Metal, no failures. Green first RGB differs by about `1.16e-6`; synthetic output differences are at small FP32 levels. Do not mix this report with older failed reports created during debugging.

- 256x256: first render `5.2ms`, output readback about `4.7ms`, repeat print below `1ms`.
- 1920x1080: first render `24.5ms`, repeat print below `1ms`; readback is separately measured and significantly more expensive than GPU-only draw.
- GPU logical textures: `200,460,816` bytes total (about 191MiB), `232,243,200` bytes for seven RGBA32F frame textures (221.5MiB), `1,395,216` bytes setup, and temporary packed input.
- CPU comparison first render: about `4564ms` in the same harness; GPU provides a substantial measured acceleration on this device.

## Debugging resolved

- Initial DIR texture orientation and MRT binding were incorrect; the implementation now uses separate passes and correct donor-row/receiver-column semantics.
- Hue grid interpolation needed consistent coordinate/local-fraction semantics; final direct matrix and OkLch probes agree with the CPU path within measured FP32 tolerance.
- Shader debug output/uniform optimizer errors and framebuffer ownership issues were fixed; context loss and disposal are terminal rather than silently producing a different look.

## Next boundary

Integrate a backend-aware spectral color stage into real FilmFrame aperture rendering with equivalent CPU fallback. Preserve current default/legacy behavior, templates, cancellation, export and Object URL ownership. Only after that real-renderer validation should duplicate negative looks be replaced and new negative stocks added.

Unresolved Hanatos/KG3 and historical asset redistribution rights remain separate blockers; no public distribution clearance is implied.
