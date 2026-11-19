# Physical 135 visual and performance acceptance — 2026-11-11

## Scope and evidence

This is a local candidate acceptance record, not native SpektraLab pixel parity, full-stock imaging coverage or public-release clearance. The legacy real-135 default remains unchanged while the migration is reviewed.

Artifacts and commands:

- `output/playwright/physical-visual-acceptance.mjs`: real single/strip rendering for Portra 400, Gold 200, Fuji X-Tra 400, Vision3 500T, Ilford HP5 Plus and CineStill 800T. Each has bright/dark photographs and frame seeds 1/7; strips contain 1, 4 and 5 frames. Five-frame strips use 1.5° straightening; other strips use 0°.
- `output/playwright/compose-physical-contact.mjs`: fit/100%/200% contact sheets after every image has decoded. Empty/broken placeholder sheets are rejected, not accepted.
- `output/playwright/physical-performance.mjs`: real main application Worker-client paths for a 1920×1080 locally generated photograph. It measures single first/reprint and 1/4/5-frame strip exports with WebGL2 and CPU, plus a lower-level physical GPU development/readback/disposal probe.
- Raw data: `output/playwright/physical-acceptance/visual-manifest.json`, `performance.json`, representative original PNGs and `contact-*.png`.

## Visual review

Reviewed the decoded contact sheets and original five-frame exports. Bright/dark images and both frame seeds retain visible photo content; no dense white scanlines, blank frames, manufacturer-wide Kodak substitutions or broad Ilford gray DX blocks were found. Kodak, Fuji dot-matrix, EASTMAN, Ilford and CineStill identities remain distinct. CineStill's cross-advance name is continuous and is explicitly geometry-compatible, not a claim of full no-rem-jet/halation development.

At fit/100%/200%, gate edges, perforations and imprints remain legible and coherent. Five-frame 1.5° output tilts the whole scan as intended: photo, gate, holes and imprints share the same local scan transform. No new full-roll-center imprint offset is present. Ilford and CineStill remain explicitly labeled geometry compatibility; they do not acquire color-negative spectral development from these layouts.

This covers representative real rendering, not all source photographs, all physical cameras or a native reference-pixel comparison. Pro 400H is not silently included: its base-canceling residual remains rejected by the production boundary.

## Performance and resource lifecycle

Environment: actual Chrome 157 on the local Apple M4 / ANGLE Metal renderer, devicePixelRatio 1, hardwareConcurrency 10. Timings below are one measured local run, not a device-independent guarantee. All processing and test photos remain in the browser; no server GPU or photo upload is used.

| Real Worker-client operation | WebGL2 | CPU |
| --- | ---: | ---: |
| 1080p single, first | 5.183 s | 19.158 s |
| 1080p single, reprint | 4.262 s | 20.609 s |
| One-frame strip | 1.681 s | 13.721 s |
| Four-frame strip | 7.894 s | 58.793 s |
| Five-frame strip (1.5°) | 12.344 s | 65.438 s |

PNG export sizes were approximately 138 KB for single, 94 KB for one frame, 357 KB for four frames and 441 KB for five frames. Browser `performance.memory` values are also recorded but are not treated as deterministic peak-GPU or complete-process measurements.

Lower-level physical GPU probe, 1254×1155 frame on Apple M4:

- setup-only texture bytes: 1,395,216; initial active frames: 0.
- upload/pack: 38.2/27.5 ms; film/paper/scan: 6.4/3.5/3.8 ms; total renderer call: 228.7 ms; print-RGB readback: 144.3 ms.
- before release: 140,438,736 texture bytes, 162,217,440 frame texture bytes, one active frame, one FLOAT readback of 23,173,920 bytes.
- after release: setup-only 1,395,216 bytes, zero frame texture bytes and zero active frames.
- after dispose: zero texture bytes and zero active frames.

This verifies the measured backend's cleanup, not every possible device/context-loss scenario. Explicit WebGL2 failure and CPU compatibility behavior remain governed by the existing tests; no silent legacy-template fallback is used.

## Remaining boundary

The candidate now has representative visual and measured performance evidence. It does not establish every film stock's complete imaging model, universal interactive CPU performance or public distribution rights. Default migration still requires the explicit versioned switch, settings-level rollback proof and an independent migration review. Existing historical asset, spectral-data, project-rights, corresponding-source and dependency/credits blockers remain separate from technical acceptance.
