# Physical 135 implementation validation — 2026-11-07

## Current candidate lifecycle, orientation and stock audit — 2026-11-10

This section reports newly executed checks, not the older passing claims below. The legacy real-135 default is unchanged. The zero/nonzero seam, local-imprint and budget-preflight gates now pass their production checks. A fresh independent verdict is still pending; Phase D also retains separately documented visual/performance/licensing decisions.

- Diagnosed the stale/processing symptom with production-path key probes. The display/export path omitted the photograph seed and reused global default `1`; retry had the same omission. A separate state conflation used `activeImageId` both for the currently rendering card and for the selected photograph, leaving the card marked processing after the seed control changed it. These are now separate selected/rendering identities, and all image artifact paths pass the photograph seed.
- A real second render initially failed because `plan.frameSeed ^ 0xa5a5a5a5` could become a signed negative seed, and scan straightening can sample the fog-noise lattice at `-1`. The derived fog seed is explicitly unsigned; only that periodic lattice uses wrapped indices. Normal perforation seed indices remain checked. `physical135Stocks.test.ts` reproduces the failure and verifies continuous coordinates.
- Actual Chrome WebGL2 second-render lifecycle: after changing body, selected frame, backing, straightening, fog and leaks, the application reports `1 已出片 · 0 待冲洗`, not a stale/processing card. Two-photo selection tests confirm that each photo retains its own frame seed when opened, changed and reopened.
- Native portrait and manual landscape-to-portrait are checked against actual source-image references rather than canvas dimensions alone. The native portrait is closer to its unrotated source; the manually rotated image is closer to a clockwise 90-degree source. The latter also has zero saturated aperture rows.
- Focused geometry/seed/raster/signature tests: 59 tests pass; `npx tsc --noEmit` passes. Five additional lifecycle/portrait/fallback/compatibility browser checks pass in actual Chrome.
- Regenerated all 23 stock single frames and two-frame strips using `output/playwright/stock-edge-matrix.mjs`. All 22 admissible combinations report zero saturated white rows in single and strip output. Fuji Pro 400H is still rejected explicitly because its base-canceling residual is 0.971; this is not counted as successful full spectral physical rendering. Compatibility stocks retain their geometry-only classification.
- Five-frame seam repair verified after independent read-only research: a shared perforation was re-indexed from its local window, and roll material incorrectly used each photograph's frame seed. The same physical perforation now has a roll-coordinate identity; roll material and edge exposure use the stable body seed while each photograph seed still controls its scan registration. SDF distance uses local millimetres, while roughness/reflection material uses roll millimetres; spectral edge exposure adds the advance offset exactly once. New raster and stock tests fail on the original implementation and pass now. The strict five-frame assertion remains **at most 1/255 per RGB channel** and passes in actual Chrome; no saturated rows remain. The threshold was not relaxed.
- Default Playwright Chromium in this environment cannot create WebGL2 even with the software-renderer flag; explicit WebGL2 fails as designed rather than silently switching to legacy. Actual Chrome was used for physical WebGL2 checks.
- The final coordinate implementation uses a fixed local frame center and explicit local↔roll conversion; `filmToRollPoint` is the sole material translation. Focused plan/raster/stock tests: 34/34. Actual Chrome physical tests: 10/10, including five-frame strict seams at both 0° and 1.5°.
- Full `npm run check` after the coordinate and type-export corrections: 32 files / 263 tests, spectral parity, TypeScript and production build pass. `npm run test:provenance`: 7/7; `git diff --check`: pass.
- A full-suite run found a five-frame test setup race: batch upload had not completed before the next click, leaving zero photos. The test now waits for `冲洗待更新照片 (5)` to be enabled before developing. No render timeout or acceptance threshold was weakened.
- Final local-imprint and budget-preflight candidate: focused raster/stock **26/26**, `npm run check` **32 files / 265 tests**, spectral parity, TypeScript and production build pass; actual-Chrome physical **11/11**; complete serial browser **65/65** including local DX mask, both-angle five-frame strips and Firefox/WebKit workflows; provenance **7/7** and `git diff --check` pass.
- The latest independent review dispatch failed with an API connection timeout and produced no verdict. It was resumed for another attempt; this infrastructure failure is not counted as independent acceptance.
- A later completed independent review accepted local imprints and strip allocation but found single-frame allocation order and stale template-size admission. The current candidate now uses production physical plans for all admission dimensions, asserts budgets before main/Worker/output Canvas allocation, and samples the actual Worker-exported DX pixel as well as the mask. Admission tests: 5/5; targeted browser budget+DX: 2/2.
- Final candidate checks after these fixes: `npm run check` **32 files / 266 tests**, spectral parity, TypeScript and production build pass; actual-Chrome physical **12/12**; complete serial browser **66/66** including actual Worker-exported DX, zero-allocation budget rejection, both-angle strips and Firefox/WebKit workflows; provenance **7/7** and `git diff --check` pass. A fresh independent verdict is pending; default remains legacy-template.


## Portra 400 physical-edge implementation — 2026-11-09

The user-supplied actual portrait was rendered locally through the real application Worker path; no upload or server-side processing was used. The implementation now uses the pinned GPL SpektraLab edge model for the full-frame 135 gate, perforation registration, Kodak half-frame imprints, DX encoding and exposure-domain marks. It no longer draws a generic black frame with decorative barcode stripes.

Verified for this increment:

- One shared film-mm coordinate system for gate, photo, imprints, raster and scan composition. Portrait output is decided once in the plan, without an additional automatic output rotation.
- Actual portrait single-frame output: correct upright photo, two perforation rails, correctly oriented stock name, DX data, half-frame marks and no white scanlines in the aperture.
- Three actual portrait photos through the production workflow completed in about 13.6 seconds. Three/five-frame strips have continuous material and shared cross-frame perforations; later frames are not blank/white.
- Eight physical browser tests pass: Worker single, body/frame seeds, portrait orientation, strip, five-frame backing/seam assertions, manual rotation, forced-main JPEG/4:3 scanner, and legacy spectral-strip rejection.
- Full browser regression: 62 tests pass across Chromium, Firefox and WebKit, including legacy stocks, spectral picker, Worker/main fallback, physical rotation and five-frame seam continuity.
- `npm run check`: 241 unit tests, 120 stock/stage comparisons, TypeScript and production build pass. `npm run test:provenance`: 7 checks pass; `git diff --check` passes.

This is evidence for Portra 400 and the Kodak 135 family implemented here, not proof of identical native pixels or complete acceptance of every film stock. Browser imprint exposure is calibrated against the measured response of this WebGL2/CPU pipeline. The original native halation/spatial/DIR model is not implemented by this increment. Other manufacturers and B&W/slide/CineStill layouts must not be represented by the Kodak layout as if they were independently matched.

Legacy real-135 remains the default; no default migration, commit, push, release or license clearance is claimed. Independent review and the broader representative-stock visual/performance gate remain open.

## Earlier production visual acceptance — REPAIR VERIFIED; REPLACEMENT STILL BLOCKED

The reported dense-white-line mechanism was reproduced and repaired. Portrait raster width/height had been transposed twice, so row-major film-presence/backing samples were read through the wrong Canvas stride and backing entered the aperture. `createPhysicalRaster` now uses `plan.outputWidth/outputHeight`, returns its dimensions, and rejects a mismatched Canvas. Main/Worker orientation handling and continuous-strip coordinates were corrected as separate contracts.

Evidence after the repair:

- `npm run check`: 239 tests, 120 stock/stage comparisons, TypeScript and production build passed.
- Full browser suite: 62 tests passed across Chromium, Firefox and WebKit. The physical matrix includes natural-color manual rotation, saturated-backing detection, five-frame output and seam assertions, forced-main JPEG/4:3 scanner output, and legacy compatibility.
- A targeted production-plan full-aperture inspection found zero saturated backing rows and zero white-pixel fraction in the sampled interior after a manual 90-degree rotation.
- `npm run test:provenance`: 7 checks passed; `git diff --check` passed.

This verifies the defect repair, not full Phase C or a default migration. Exact original-user-photo acceptance cannot be claimed because those photos/settings were unavailable. Physical 135 remains experimental and legacy-template remains the default. The independent check agent stopped with a budget error; see `independent-check.md` for that limitation and the main-session review. A fresh independent review and complete representative-stock visual/performance acceptance remain required.

## Implemented and verified

- Physical film-mm plan with landscape/portrait transposition, coherent body/frame seeds, two perforation rails, backing and scan straightening.
- CPU and WebGL2 negative -> base-canceling perforation density -> paper -> scan order. The GPU presence pass writes a temporary texture rather than destroying the original negative, and presence textures are released on success/error.
- Main HTMLCanvas and Worker OffscreenCanvas single/strip routes, including four/five-frame strip geometry and actual PNG/JPEG exports. Main-thread strip uses HTMLCanvas export; Worker uses OffscreenCanvas convertToBlob.
- Independent settings for edge renderer and imaging mode, normalized physical settings and render-result identity. Legacy real-135 remains the default.
- Legacy spectral strip rejection remains intact; physical spectral strips now use their own per-frame developed/printed rendering, not one oversized shared negative.

## Numerical evidence

- `physical135Plan.test.ts`: exact and overdetermined least-squares fixtures, independent seed domains, unsupported mode rejection, portrait gate/perforation transposition, actual Portra dye/base solve.
- `physical135Raster.test.ts`: both perforation rails, zero fog/leak controls, backing, deterministic seeds, straightening and continuous perforation phase across strips.
- Independent NumPy cross-check of overdetermined hole-density solution and residual; a zero-residual independent exact fixture. No zero-density alpha-cutout approximation is used.

## Production/browser evidence

- Five physical-focused Playwright tests on actual Chrome hardware GPU pass: single, seed controls, portrait, continuous strip and legacy spectral-strip rejection.
- Real CPU/GPU and Worker/main aperture comparisons were zero-difference in the tested 200x200 region.
- Five-frame GPU strip: 4700x875 output, approximately 9.1s complete strip generation in the measured run.
- Four-frame forced-main CPU strip: completed successfully in approximately 9.4s after separating HTMLCanvas export from OffscreenCanvas export.
- Full validation after the implementation: 237 unit tests, 120 spectral-stock stage comparisons, production typecheck/build, 59 Playwright tests and 7 provenance tests pass. `git diff --check` passes.

## Known approximation and remaining acceptance boundary

- Gate, hole geometry, dye-density compensation, backing and scan composition are implemented. Fog/leak is a restrained **exposure/material approximation**, not independently measured spectral halation/development. UI copy now states this explicitly; leaks default to zero.
- Physical imprints are procedural text, not independently measured stock-specific DX/glyph scans. No claims of full native spatial/stochastic SpektraLab parity, exact camera-gate measurements or B&W/slide/CineStill full support.
- CPU spectral work is significantly slower in software-only test environments. Physical production tests use actual GPU where available; the CPU path remains a correct fallback, not a promised interactive experience for every device.
- Technical feasibility of physical single/strip output is demonstrated. **Default real-135 replacement has not been switched on.** Phase D still requires final visual comparison, complete lifecycle/performance review, and an explicit migration decision with classic compatibility. No commit/push/release or license clearance is implied.
