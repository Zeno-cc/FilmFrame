# Stock-wide physical 135 edge audit — 2026-11-09

## Why this review is required

The Portra 400 repair proved one Kodak layout, not the correctness of other stocks. The previous shared renderer applied Kodak imprints, DX identity and exposure behavior to every supported stock. That is a real stock-identity defect, not merely an aesthetic difference.

## Shared defects and separate stock-specific contracts

- Shared: 135 millimetre coordinates, gate, perforations, optical softness, backing, orientation, Worker/main output and continuous-strip registration.
- Kodak: stock-specific text, 19mm half-frame grid, DX tracks, full/A-frame numerals and arrows.
- Fuji negative: dot-matrix imprints, distinct DX length/data and per-stock layer weights; X-Tra 400 is not Superia 400.
- Vision3: EASTMAN stock number, dash cadence, no DX bars or ordinary frame numbering.
- Ilford HP5: reversed layout, HP5-specific DX and dot-matrix name. Exact frame-number evidence is incomplete upstream; do not invent a measured layout.
- CineStill: its own name, number/arrow sequence and no DX bars. Its separate spatial/halation model is not implied by an edge implementation.
- Positive/slide and B&W profiles require separate imaging support. Physical geometry alone is not a claim of a complete spectral negative-to-print process.
- Missing exact stock data must not inherit Portra 400, Gold or any other stock's DX code, name, spectral profile or paper identity.

## Route matrix

| Stocks | Physical edge | Imaging | Required presentation |
| --- | --- | --- | --- |
| Portra 160/400/800, Gold 200, Ektar 100, Ultramax 400 | Kodak | Exact registered spectral | Color-negative development and Kodak edge. |
| Fuji C200 | Kodak-family, light numerals | Exact registered spectral | Fuji text, not Portra identity. |
| Fuji X-Tra 400 / Pro 400H | Fuji-negative dots | Exact registered spectral | Distinct stock, paper and edge. |
| Vision3 50D/200T/250D/500T | Vision3 | Exact registered spectral | EASTMAN number and dashes, no DX. |
| ColorPlus, ProImage, Superia, T-Max 400, P3200 | Geometry compatibility only | No exact spectral registration | Do not claim complete spectral fidelity or borrow another DX. |
| Ektachrome E100 | Geometry compatibility only | Positive/slide model is separate | No color-negative spectral claim. |
| Tri-X, T-Max 100, HP5 | Geometry compatibility only | B&W model is separate | No color-negative spectral claim. |
| CineStill 800T | CineStill layout | Separate no-rem-jet/halation model | No claim of complete spectral spatial fidelity. |

## Acceptance

Every supported edge/imaging combination must be checked on the actual application route for correct text/layout, no white aperture lines, nonblank frames, coherent perforation phase and an honest unsupported-mode boundary. Stock-specific exact profile identity is separate from physical geometry. No default real-135 replacement before the full acceptance and migration gate.

## Reproduction and correction work — 2026-11-09

The first stock-wide screenshots found that shared geometry was not sufficient: Ilford DX was stretched into broad gray bands, CineStill names were clipped into fragments, and generic dot glyphs had been substituted for manufacturer-specific matrix faces. The previous four stock tests passed despite those defects, so they were not accepted as visual evidence.

The pinned GPL reference `engine/src/pipeline/overscan.cpp` at SpektraLab `02d82b56cf65f0f8e802a708612edc4e9a4790af` was re-read for `imprint_groups`, `matrix_text`, `dot_text` and the distinct dot faces. The following browser contracts are now explicit and tested:

- Ilford uses the HP5 DX code, 31 modules over 13.06mm, a 19mm code cadence and a half-turn of both coordinate axes. Sorting each transformed rectangle's endpoints is necessary before Canvas rasterization. Its frame-number layout remains an upstream-stated assumption, not an independently measured one.
- CineStill uses a square matrix name, widened monospace numerals, its own four-tier arrow and `NA` label, with no DX. The name intentionally crosses an advance boundary: the neighboring grid's exposure must remain in the generated plan, not be clipped into a fragment or confused with a duplicated name.
- Vision3 uses a square matrix EASTMAN name and 1.16mm dashes; there are no ordinary DX tracks or frame numerals.
- Fuji negative uses separate 7x9 name and 8x12 number dot faces with a 0.114mm disc, not a generic 5x7 dot font. Its DX remains distinct from Kodak's.
- A separate compatibility-path defect paints imprints once during photo painting and again during strip imprint exposure. Shared cross-advance perforations also require a stable global identity for their small geometry variations; array position after filtering is not a physical hole identity. A focused implementation agent is investigating those strip-only contracts without changing manufacturer layouts.

Five focused stock identity/layout tests now pass. Their assertions distinguish matrix cells from dot glyphs, exact DX intervals from broad bars, and continuous imprints from arbitrary nonnegative-coordinate filtering. Full browser and all-stock visual evidence is pending; no default migration, release, commit or complete-native-parity claim follows from the unit result.

## Actual all-stock review findings — later on 2026-11-09

A complete 23-stock render run succeeded after disabling the diagnostic browser's Vite HMR client; earlier runs with `Execution context was destroyed` were not accepted as evidence. Visual review then found two additional identity/layout defects that the first passing unit tests had missed:

- ColorPlus and ProImage used `dx: 0` as a placeholder and consequently drew a real DX-shaped clock/data pattern. Their registry entries now omit DX entirely; an empty edge is more honest than an invented code. A regression asserts no DX rectangles.
- Superia's unbounded dot-matrix name overlapped the neighboring `0A`. The Fuji name now follows the source's 9.8mm slot and whole-word truncation rule. C200/Tri-X light numerals and Kodak-family name-slot calculations were also brought into focused tests. ProImage's complete name remains within the source-derived slot and is not arbitrarily truncated.

A five-frame production strip still measured the same bottom-edge `7/255` seam after global hole/material identity repairs. Direct pixel measurements showed the identical `[210,92,74] -> [206,86,67]` jump at every 38mm boundary. One defect was strip rendering regenerating the entire roll's imprints with each photo's frame number: the same physical DX barcode could be encoded differently in adjacent windows. A second was spectral fog/leak sampling using local advance coordinates. Both were corrected, but the final `7/255` measurement persisted, so neither was accepted as the complete root cause.

A subsequent stage-isolation measurement held raster presence/backing/wall and the global DX intervals constant and still reproduced the output difference. Measuring the imprint mask itself then showed the discriminating evidence: at the same roll-mm pixel the left local Canvas returned alpha 255, the right local Canvas returned 228, while a globally rasterized roll mask returned exactly those same respective values. The discontinuity was therefore caused by **independent Canvas antialiasing of the same continuous imprint at each crop boundary**, not by the film profile, perforation identity or an acceptable one-pixel material gradient. The production strip now rasterizes the roll's imprint exposure once, then reads each frame's pixel window from that shared mask for both spectral and compatibility development. The photograph still develops independently per frame.

The remaining acceptance gate is final production-pixel and browser evidence, not the green pure-geometry result alone. All unsupported imaging routes remain compatibility-only, and legacy-template remains the default.

## Final candidate stock/strip verification — 2026-11-10

- Regenerated every stock's single and two-frame strip after the continuous-material repair. The 22 admissible combinations have zero saturated white rows in both outputs. Fuji Pro 400H remains an explicit rejection because its base-canceling residual is 0.971; its rejection is not counted as full physical spectral acceptance.
- Actual CineStill and Ilford continuous strips were inspected: names span the advance coherently, perforations are present in both frames, no broad gray DX blocks or blank/white frames recur. These remain distinct layout/geometry capabilities; B&W and CineStill-specific spatial development are not claimed.
- The residual 2/255 seam at the far-hole soft edge was traced independently to local perforation re-indexing and per-photo frame seeds resetting roll material. Both are corrected; roll-mm identity/material and local SDF coordinates are separate. The strict <=1/255 browser assertion now passes with no threshold change.
- Complete current browser regression: 63/63 across Chromium/Firefox/WebKit; all nine physical production tests pass. A fresh independent check is evaluating the candidate; the default remains legacy-template.



- The real Portra 400 portrait was rendered locally through the production Worker path in 6.64 seconds, yielding 1155x1254. The final PNG was inspected: upright portrait, two perforation rails, Kodak imprint, no dense horizontal white backing lines. The diagnostic HMR stub intentionally removes Vite style injection, so its UI screenshot is not used for UI visual acceptance; the exported PNG is the render evidence. EXIF-JS separately logs `n is not defined` for this JPEG; this is not suppressed or claimed fixed by the edge work.
- All eight physical Chromium production tests pass: Worker single, body/frame seeds, portrait, strip, five-frame, manual rotation, forced-main JPEG/scanner background, and explicit legacy-spectral-strip rejection.
- The five-frame gate-to-perforation rebate test preserves a strict `<=1/255` continuity assertion and requires actual unexposed samples. The earlier bottom-DX `7/255` value was a developed barcode edge at `38.0358056507mm`, not a base-film break. The final test does not relax that base-film threshold or call every pixel equal; it uses the production imprint mask to distinguish barcode edges from physical rebate, and separately tests analytic imprint coverage across arbitrary crop origins.
- Rectangle/matrix imprint coverage is calculated from the pixel footprint in film-mm coordinates, so a crop origin cannot change its exposure. Continuous text and dot faces retain their stock-specific layouts. Full-roll imprint coverage is shared for spectral and compatibility strip development.
- `npm run test:provenance`: all 7 checks pass, with existing source/profile/historic-asset distribution blockers still in force.

These results close the reproduced geometry/identity/seam defects on the tested routes. They do not establish native SpektraLab pixel parity, B&W/slide/CineStill full imaging, complete native halation/spatial development, or public-release clearance. Full `npm run check`, full browser regression, final all-stock visual review and a new independent `trellis-check` remain the release-gate evidence to collect.
