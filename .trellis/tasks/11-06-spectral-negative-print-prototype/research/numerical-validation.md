# Numerical Validation: Portra Prototype

- Date: 2026-11-06
- Status: isolated current-upstream numerical slice passing focused tests; browser/performance and old-baseline review still open.
- Environment for references: Python 3.13.12, NumPy 2.4.2, SciPy 1.17.1, colour-science 0.4.6 in the isolated pinned environment.

## What was actually verified

`npm run typecheck` and `npm test -- --run tests/spectralPortra.test.ts` pass with **10/10 tests** after independent-review corrections. These tests are not a full native-engine parity claim.

| Stage / behavior | Current measured result |
| --- | --- |
| Gray-ramp film raw | Max abs `4.622104599061316e-8`; 0 violations |
| Gray-ramp negative density | Max abs `5.85783892503855e-8`; 0 violations |
| Gray-ramp paper log exposure | Max abs `0.000032414734456864824`; 16 edge/rounding violations of the original relative threshold |
| Gray-ramp paper density | Max abs `0.00010087353051169146`; 0 violations |
| Gray-ramp current-upstream print RGB | Max abs `0.00003574890181029522`, mean abs `0.000015584313257029313`; 0 violations |
| Green current-upstream print RGB | Original pinned tolerance: 0 violations; independent probe max abs `0.000012954305936896393` |
| Alpha/determinism/input guards | Passed |
| Pinned baseline/intermediate identities | Passed |

The tests compare against current-code intermediate fixtures, not only old final screenshots. Numerical output still uses Float32 planes and is not expected to be bit-identical to Python float64.

## Bugs found and corrected during this prototype

- The reference exporter initially derived DIR correction curves from the wrong curve domain; it now uses normalized film curves, matching `develop.py` and `couplers.py`. The DIR donor-row/receiver-column convention was preserved.
- The spectral resources now carry separate valid-wavelength masks for film and paper. `nan_to_num` alone incorrectly admitted light at unmeasured wavelengths; upstream `density_to_light` turns those transmissions into zero. NaN can occur at arbitrary wavelengths, not just in a prefix.
- The typed resource boundary now decodes unknown JSON and validates schema/shape/finite values before constructing the pipeline; it does not use an unchecked `as PortraSetupResource` import assertion.
- The output configuration uses measured **OkLch**, not current default CAM16-UCS. The direct `compressOklch` implementation matches upstream on the fixed green linear-RGB input within numerical precision.

## Mid-gray calibration correction

A direct upstream probe established `density_spectral_midgray.shape == (1,1,81)` and a scalar normalization of `0.8357499244020924`. It is the geometric mean across 81 wavelength responses, not three RGB channels. The TypeScript scalar factor after masks is `0.835687686107377`, consistent within Float32/numeric sampling.

An earlier recommendation to use three per-channel normalization factors was incorrect and was corrected by direct source/execution evidence. The first gray negative density maps upstream to paper log `[0.70894626999154,0.7271062763357123,0.7344458496213865]`; the TypeScript pipeline now agrees within the reported tolerance.

## Historical baseline discrepancy remains open

The committed gray print-RGB fixture does not fully match the current upstream code under controlled OkLch execution. The darkest column has **48 channel violations**, max abs `0.007130636018971126`, mean abs `0.0004400957459287584`. This is visible in `tests/fixtures/spectral/manifest.json` and explicitly asserted by tests.

The current-upstream intermediate fixture and the historical committed baseline are separate evidence. A passing TypeScript/current-code comparison does not resolve or erase the historical discrepancy. No baseline file was regenerated to hide it.

## Additional reference-export corrections

- ProPhoto input is adapted from its D50 white to film D55 using CAT16 before RGB-to-XYZ; D50 scan is adapted to sRGB D65 using CAT02 before the sRGB inverse matrix. Exporter mistakes in these directions were corrected by direct transform probes, not curve tuning.
- Display-sRGB byte adaptation is a separate contract: decode the sRGB transfer function, convert sRGB primaries to linear ProPhoto D50, then feed the scene-linear ProPhoto film stage. It must not reuse the ProPhoto-to-D55 XYZ matrix as an sRGB-to-ProPhoto conversion. The exported `srgbToProPhoto` matrix preserves that distinction; alpha bytes are untouched.
- Mid-gray calibration uses `filmRawCurves`, the unnormalized `(256,3)` stock curves. Film development still uses normalized curves followed by the DIR-corrected curves. The shared interpolation routine had an upper-row indexing error; after correction, film raw and negative density pass with zero tolerance violations.
- `density_to_light` semantics require a complete-measurement mask: a wavelength is valid only when base and all three channel densities are finite. The exporter must not replace a missing base/channel with zero and then transmit light. Separate film and paper masks now reproduce this behavior while all exported numeric arrays stay finite.
- Current resource SHA-256 is `16f6217f8f1fa81c7064d5926f3ab4344f088a18520fd71e260c80fbbe5febd5`. Additional exact raw-curve/mask digests are recorded in `upstream-configuration-and-provenance.md`.

## Browser evidence and go/no-go

See `browser-benchmark.json` for the completed Playwright run and `synthetic-ab.png` / `browser-harness.png` for saved synthetic evidence. The A/B image has two labeled halves; the left is a deliberately simple byte-space reference, not production `filmEngine`, and neither half includes a template or film-border pixels.

The final completed run's exact timings are documented in `implement.md` and the JSON report. Do not substitute timings from an earlier run. The report distinguishes shared cold setup, per-size reinitialization, first full film/print/scan render, and repeated paper/scan work. Heap snapshots are browser-specific and include retained stage buffers/GC timing; they are not a proof of peak process RSS. Core-call and repeated-print retained-array estimates are now reported separately, with fixed setup and Canvas excluded explicitly.

At 1920x1080, the latest full CPU benchmark completed in `3556.7ms` for the first render and `3076.45ms` mean for two repeated paper/scan renders. Its first-render core working-array estimate is `174,184,344` bytes; the repeated-print retained-array estimate is **`223,950,744` bytes (213.57 MiB)** because the first stages, reprint log, density and scan output coexist. The latter excludes `1,302,672` bytes of fixed typed setup, retained JSON source values, RGBA/Canvas and GC overlap. This is not a heap/RSS guarantee. It is not interactive and must not be enabled as a default rendering route. An initial reviewable preview should start at or below `256x256`; a larger preview requires a separately approved blocking/low-resolution workflow and resource budget. There is no evidence-based interactive 1080p limit.

**Recommendation: numerical slice validated against current upstream, but NO-GO for production UI integration or public distribution.** The unresolved historical dark-gray discrepancy, unresolved Hanatos/KG3 provenance and global asset rights, non-interactive full-resolution CPU cost, and absence of a real FilmFrame production-renderer A/B remain blockers. A future separately approved low-resolution experiment must define its own photo/input, memory, Worker and visual-acceptance plan; this is not full native feature parity.

## Focused Firefox/WebKit checks

`cross-browser-validation.json` records real Playwright Firefox 151 and WebKit 26.5 runs on macOS arm64, with no external requests or console errors. Both passed small gray-ramp and green-patch checks with finite outputs and zero tolerance violations. Gray brightest-pixel print max abs was `0.000010200531536774804`; green first-pixel max abs was `0.000012954305936896393`. These are focused numerical checks, not full application compatibility, 1080p timings or a solution to the historical dark-gray mismatch.
