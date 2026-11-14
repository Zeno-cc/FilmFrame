# Physical 135 defect-review record — 2026-11-08

## Migration compatibility follow-up — 2026-11-11

The independent migration review initially returned NO-GO on two legacy-data paths: missing `imagingMode` in old preference envelopes inherited the new spectral default, and recipes lacking the new mode fields inherited physical135/spectral instead of their original real-135 behavior.

Both are now corrected:

- Historical preference envelopes restore missing `edgeRenderMode` to `legacy-template` **and** missing `imagingMode` to `legacy`. Explicit spectral choices remain preserved.
- Recipe application uses the same legacy semantics for fields absent from the saved recipe, so old real-135 recipes restore their original single-frame and strip workflow rather than inheriting the current session's physical default.
- Migration tests now include actual legacy-envelope single/strip rendering and applying a legacy recipe from a physical-default session, followed by a successful real-135 strip. All four migration tests pass; full validation and a fresh independent verdict are pending.

These fixes do not change the physical renderer's validated behavior or the remaining distribution-rights and native-imaging limitations.


## Final budget/admission follow-up — 2026-11-10

The successful independent review closed local-imprint and strip-output allocation issues but found remaining single-frame allocation order and stale legacy-size admission calculations. These are now addressed in the working tree:

- `renderAdmission` uses the same `physicalPlanForSettings` and `createPhysicalStripPlan` as production for physical single/strip and scanner-output dimensions. A ten-frame preview admission is 9500x875, matching the actual physical strip rather than the old 3998x3120 template layout.
- Main and Worker single-frame output Canvas allocations now happen only after `assertCanvasBudget`, including the optional scanner/output surface. Strip allocation was already corrected and remains covered.
- A browser budget test invokes real main and Worker paths with `maxPixels: 1`, counting actual main Canvas and Worker OffscreenCanvas allocations. Both reject with no render surface created; the Worker scheduler itself is not misreported as a Canvas allocation.
- The straightened DX test now calls the actual Worker `generateFilmStrip`, decodes its final PNG Blob and samples the corresponding developed imprint pixel, in addition to checking the local mask alpha 255. Both assertions pass.
- Focused admission tests: 5/5, including exact physical ten-frame and rotated single-frame production dimensions and maxPixels rejection. The final full checks are running; no default migration, commit, push or release is performed.


## Follow-up independent findings and repair — 2026-11-10

The final-candidate reviewer accepted the seed/lifecycle/orientation and roll-mm material repairs but found two additional production-boundary issues, so the first final review remained NO-GO for migration:

1. The shared strip imprint mask used a full-roll rotation center, unlike the local frame gate/perforations. Existing seam checks skipped imprint pixels and therefore could not detect this.
2. `renderPhysicalStripCanvas` constructed its output Canvas before checking the caller's budget.

Repairs and fresh evidence:

- Strip imprints retain one roll layout but are converted with the shared `physicalStripFrameImprints` helper into each frame's local coordinates and painted with that frame's scan transform. The full-roll-center mask/crop path is removed. Rectangle coverage now uses the original local film-mm rectangle, not the already-rotated output corners.
- A real Chrome DX-center probe changed from alpha 0 to **alpha 255**, with analytic coverage 1, after the correction. The physical browser suite now includes this production-shared local-imprint check rather than skipping all DX pixels as proof of correctness.
- Output Canvas budget validation happens before construction. A lower-level `maxPixels: 1` OffscreenCanvas allocation regression confirms rejection without allocation or photo decode.
- Focused raster/stock tests: **26/26**. Targeted Chrome DX + both-angle five-frame tests: **3/3**; the complete physical suite and final full checks are being rerun before a fresh independent verdict. Default remains legacy-template; no migration/commit/push/release is performed.
- Final checks after both fixes: `npm run check` **32 files / 265 tests**, spectral parity, TypeScript and production build pass; actual-Chrome physical **11/11**; full serial browser **65/65** including DX, both-angle strips, Firefox/WebKit; provenance **7/7** and `git diff --check` pass. A fresh independent verdict is pending.


## Independent verdict on the first repaired candidate — 2026-11-10: PARTIAL / MIGRATION NO-GO

A fresh `trellis-check` accepted the photograph-seed/lifecycle work, native/manual orientation evidence, unsigned seed/roll-material corrections and the zero-straightening five-frame seam repair. It verified `npm run check` (32 files/262 tests), full actual-Chrome Playwright (63/63), provenance (7/7) and `git diff --check`.

It found a separate **high-severity nonzero-straightening strip blocker**: local scan coordinates and roll-mm material sampling disagree, with large presence/backing/material differences in its overlap probe. `research/independent-check-probe.ts` preserves that reproduction. The existing browser seam test used zero straightening, so the earlier 63/63 pass did not cover this case. This blocks Phase C completion and any default migration.

A focused implementation agent is now resolving the local-window versus roll-coordinate contract, including a review of whether different photo scan seeds make two overlap pixels genuinely different physical samples. No conclusion is inferred from merely reducing the magnitude of a difference. The threshold remains <=1/255; no production default, commit, push or release is changed.

### Probe follow-up — independent reviewer withdrew the nonzero-straightening blocker

The same independent reviewer re-ran a discriminating local/roll-coordinate probe on the subsequently corrected mapping. With identical photograph seed 1, the local sample difference is approximately `s=-0.0000068535mm`, `t=-0.0005235390mm`; presence/backing/wall differences are zero, maximum filmBase difference is `0.00000320375`, fog differs by `8.89e-12` and leak by `4.32e-10`. The residual matches the output-window center and scan rotation, not a reset of roll material. Different photograph seeds can legitimately shift the scan window and must not be forced into identical pixels.

The reviewer therefore withdrew the earlier claim of a proven same-point nonzero-straightening defect. Remaining focused failures are test-contract issues: old seed assertions, manually double-shifted exposure coordinates and comparisons that must distinguish identical samples from adjacent pixels. The implementation agent is completing those contracts and rerunning actual production/browser checks. Default migration remains separately blocked by visual/performance/licensing and the explicit Phase D decision.

### Nonzero-straightening production verification — 2026-11-10

The coordinate implementation is now explicit: `filmToCanvas` and `canvasToFilm` map between local physical geometry and the affine scan window, with the frame's advance included exactly once. The rotation center is the fixed local 38x35mm frame, not the full-roll width or an expanded output window. `filmToRollPoint` is the only local-to-roll material translation used by raster and spectral edge exposure; there is no second implicit advance compensation. Perforation identity remains global while its SDF is local.

- Focused plan/raster/stock regressions: **34/34 pass**. The nonzero-straightening test compares roll-mm coordinates first, then requires <0.0001 presence/backing/wall/filmBase residual rather than demanding different sample positions be identical.
- Actual Chrome physical production tests: **10/10 pass**, now including five-frame strips at both **0° and 1.5°**, with the original **maxSeamStep <= 1/255** assertion unchanged.
- Existing source-reference native portrait and manual 90-degree orientation tests pass; no extra output rotation was introduced.
- Full current `npm run check`: **32 files / 263 tests**, spectral parity, TypeScript and production build pass. Provenance: **7/7**; `git diff --check`: pass.
- Complete serial actual-Chrome Playwright: **64/64**, including both straightening variants and Firefox/WebKit workflows. The five-frame test now waits for all five uploads to be admitted before development; no render timeout was raised.
- The preserved independent probe now uses `filmToRollPoint` for its residual assertion, rather than comparing local and roll `s` values as if they shared an origin. It passes with **zero** presence/backing/wall/filmBase/fog/leak difference at the same roll-mm point under 1.5° straightening; Pro 400H residual remains 0.970758 and rejected. The earlier local-only `38mm` assertion was a coordinate-domain mismatch, not a rendering failure.
- These close the reproduced nonzero-straightening geometry defect. They do not by themselves authorize Phase D, remove licensing blockers or establish complete native SpektraLab imaging parity.



## Candidate verification pending a new independent verdict — 2026-11-10

The previous NO-GO findings have been addressed in the current working tree and are under a fresh independent `trellis-check`; this section does not pre-empt its verdict.

- Selected-photo identity is separate from the actively rendering card; per-photo seeds are used consistently by batch, retry, display, preview, export and result acceptance. Real two-development and two-photo selection checks pass.
- Native portrait and manual 90-degree rotation are compared against source-image references. Aperture saturated-row checks pass; canvas orientation is not used as a substitute for subject orientation.
- Cross-window perforation identity and roll material no longer reset with the photograph's frame seed. Local SDF and roll-mm material coordinates are explicit. Strict five-frame seam acceptance remains <=1/255 and passes.
- Full current-candidate `npm run check`: 32 files and 262 tests, stock stage parity, TypeScript and production build passed.
- Full actual-Chrome Playwright: 63/63 passed, including all nine physical tests plus Firefox and WebKit compatibility workflows.
- `npm run test:provenance`: 7/7; `git diff --check`: passed.
- All 23 stocks have current single/two-frame-strip render evidence; 22 admissible combinations have zero saturated white rows. Pro 400H is explicitly rejected for the 0.971 base residual, not promoted to complete spectral physical rendering.
- The default remains `legacy-template`; no commit, push, release, default migration or license clearance has been performed.


## Independent review — 2026-11-09: NO-GO for default migration

A new `trellis-check` completed a full-scope review of the stock-wide physical-edge candidate. It made focused fixes for originally-portrait output restoration, global/portrait fog coordinates, stock-specific imprint EV, scratch-Canvas budgets and per-frame Canvas reuse, with 30 focused tests, TypeScript, 7 provenance checks and `git diff --check` passing. It did not run the post-edit browser suite.

Its verdict is **NO-GO for default migration or complete physical-fidelity acceptance**:

1. Frame seeds are roll-global rather than image/roll-position-specific; single/strip perforation hashing also needs one physical identity.
2. Straightening affects material but not all photograph, imprint and perforation sampling, so it is not one coherent scan transform.
3. `maxBaseResidual` is not checked at the production boundary and clear-receiver exposure is not accepted for every supported stock.
4. Some unsupported combinations and output allocations happen before the required preflight checks.
5. Post-edit browser evidence is required.

A subsequent main-session full browser run on this candidate produced **58 passed, 4 failed**: spectral Worker-to-main fallback, true-portrait output, spectral strip and manual rotation. Those failures are active acceptance blockers, not optional cleanup. Legacy-template remains the default. Work continues on the reproductions and the independent findings before any Phase D migration review.

## Current acceptance update — later on 2026-11-09

The all-stock edge/layout work and the real Portra portrait have been revalidated locally, but the complete physical candidate is **not accepted**. The manual landscape-to-portrait path still renders the subject sideways; attempts to compensate it with additional output/in-gate rotations were rejected and must not be treated as fixes. The current physical 135 remains experimental and legacy-template remains the default.

Focused checks have covered per-photo frame-seed ownership, unified scan-coordinate inversion, 11 supported stock hole-density solutions plus the explicit Pro 400H residual boundary, manufacturer-specific edge identities and actual all-stock single-frame rendering. The real Portra portrait remains upright with no horizontal white backing lines. These do not close the remaining browser failures.

The active blockers are manual rotation, the remaining five-frame seam value, seed-control workflow validation, full browser regression, and a fresh review after those fixes. No default migration, release, commit or push is authorized by this work.

## Previous independent-agent status
## Independent-agent status

A `trellis-check` agent was dispatched for this defect repair, but stopped with a budget-limit error and returned no verdict. It is **not** recorded as an independent approval. Files changed during its run were preserved and inspected in the main-session `trellis-check` pass; no unknown changes were reverted or included in a commit. A fresh independent review remains required before treating Phase C as complete.

## Main-session review findings addressed

1. Portrait raster dimensions were transposed a second time, misaligning presence/backing with the Canvas and producing dense white backing lines. The raster now uses the plan's dimensions and rejects Canvas mismatches.
2. Output orientation now distinguishes originally portrait sources from manually rotated landscape sources; the existing automatic portrait restoration is not applied indiscriminately.
3. Continuous strips use 38mm advances, local gate/perforation coordinates and global material-scan offsets. Material is sampled once per frame. Adjacent-frame numerical and browser seam assertions pass.
4. Physical single-frame output preserves the existing optional 4:3 scanner-background composition before output orientation. Main/Worker JPEG/PNG and scanner geometry contracts are covered.
5. The new regression uses a locally generated natural-color PNG and final rendered pixels rather than only a mostly black template, Blob existence or image dimensions. A full-aperture production-plan inspection found zero saturated backing rows and zero white-pixel fraction in the interior sample.
6. Temporary pixel/Worker diagnostic probes were removed. `git diff --check` and TypeScript pass. No old-template fallback is used to hide a requested physical/spectral result.

## Verified commands and outcomes

- `npm run check`: 30 test files, 239 tests, 120 stock/stage comparisons, TypeScript and production Vite build passed.
- Complete `npm run test:e2e` with actual Chrome path: 62 Chromium/Firefox/WebKit tests passed, including the physical single/strip, manual-rotation backing, five-frame, Worker fallback and scanner/JPEG contracts.
- `npm run test:provenance`: 7 checks passed; distribution blockers remain.
- Targeted five-frame browser regression after final review edits: passed again, including adjacent seam and backing checks.
- `npm run typecheck` and `git diff --check` after the final aperture-boundary verification and spec edit: passed.

## Acceptance boundary

This is a verified repair of the reported scanline mechanism, not approval to replace the real-135 default or publish a release. Exact original-user-photo acceptance cannot be claimed because those source photos/settings were not available to this session. Physical 135 stays experimental and `legacy-template` stays the default. Complete fit/100%/200% representative-stock visual review, independent code review, remaining lifecycle/performance acceptance and a deliberate migration decision are still open. No commit/push/release or licensing clearance is implied.
