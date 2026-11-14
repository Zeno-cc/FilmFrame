# Prototype browser spectral film and print rendering

## Goal

Prove that a pinned, openly licensed Portra 400 -> Portra Endura negative-to-print pipeline can run locally in FilmFrame's browser architecture with verifiable intermediate densities, visibly useful output, and measured performance before integrating a new user-facing film mode.

## Parent and Dependencies

- Parent: `.trellis/tasks/11-06-integrate-spektralab-negative/prd.md`.
- Follow the user's 2026-11-06 decision to accept GPL-3.0-or-later and CC BY-SA 4.0 reuse.
- Start together with `.trellis/tasks/11-06-spectral-license-provenance/prd.md`; do not publicly distribute derived code/data until its release gate is satisfied.
- `.trellis/tasks/11-06-spectral-look-ui-integration/prd.md` depends on this task's validated pipeline, error bounds, benchmark and explicit approximation disclosures.

## Requirements

- R1: Pin SpektraLab `02d82b56cf65f0f8e802a708612edc4e9a4790af` and spektrafilm `3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`; use only code/resources whose provenance and notices are recorded.
- R2: Use Kodak Portra 400 as the camera negative and Kodak Portra Endura as the paired photographic paper, with fixed neutral enlarger/exposure settings and an explicit input color-space/transfer contract.
- R3: Preserve three meaningful domains: scene RGB/linear exposure -> three-channel negative density -> paper exposure/density -> scanned/output RGB. Do not flatten the experiment into an arbitrary RGB color preset.
- R4: Begin with a small TypeScript/float-array reference implementation, using the original GPL implementation and CC BY-SA profiles under their recorded terms. Reuse upstream tests/baselines where their licenses are recorded.
- R5: Match upstream Portra gray-ramp film raw/negative-density and print-RGB baselines plus the green patch within documented numerical tolerances. Compare equivalent stages and configuration, not unrelated native defaults.
- R6: Initially disable or separately measure spatial/stochastic features (DIR diffusion, grain, halation, glare, unsharp) and exact output-gamut stages not yet ported; label every omitted stage rather than claiming full parity.
- R7: Benchmark at least 256x256 and 1920x1080 on Chromium, with additional Firefox/WebKit checks before UI integration. Measure first render, repeated print render, peak array/canvas estimates and failure behavior.
- R8: Keep all image processing local; no hosted conversion, runtime CDN or native application dependency. Keep the prototype isolated from default FilmFrame recipes and exports.

## Acceptance Criteria

- [x] An experimental browser-local service executes the documented pointwise Portra film/print/scan pipeline with finite bounded outputs and preserved source alpha semantics at its API boundary.
- [x] Automated tests demonstrate negative-density and print-RGB agreement with upstream gray-ramp and green-patch references within documented tolerances; any remaining mismatch has a measured explanation.
- [x] Fixed test images show distinct, reviewable legacy-versus-spectral output with no film-border pixels involved in the comparison.
- [x] The prototype records timings and working-set estimates, including the two 81-wavelength integrals, and defines an evidence-based maximum initial preview resolution.
- [ ] A documented go/no-go review confirms numerical correctness, useful visible improvement and feasible browser performance before UI integration.
- [x] Source notices, profile license, modifications changelog, spectral-data provenance and input/output approximation disclosures accompany the prototype.
- [x] No production default, current film template, existing export artifact or user photo is changed by the isolated experiment.

## Out of Scope

- Imported orange-mask negative scans or scanner calibration.
- RAW camera decoding, all-film support, photographic-paper picker, enlarger UI, ICC export, complete CAM16 gamut mapping or full native feature parity.
- Full GPU/WASM rewrite, physical grain/halation/DIR diffusion, and replacing FilmFrame's existing Canvas composition.
- Public distribution before the sibling provenance/license task is complete.

## Evidence

- `../11-06-integrate-spektralab-negative/research/spektralab-negative-pipeline.md`: pipeline, portability, resource estimates and licenses.
- `../11-06-integrate-spektralab-negative/research/filmframe-integration-boundaries.md`: browser/Worker/fallback constraints.
- Upstream `tests/regression_baselines.py` pins Portra 400/Endura gray-ramp16 `film_raw`, `negative_density`, `print_rgb`, and green-patch8 `print_rgb` cases, with `rtol=1.5e-3`, `atol=1e-6` for its own snapshots.

## Final Review Outcome — 2026-11-06

- Independent targeted review found no remaining code blocker in the reviewed fixes: input color conversion, strict green/non-dark-gray tolerances, resource integrity, pinned profiles and core/reprint memory accounting were verified.
- Focused tests are 10/10; full frontend check has 214 tests plus typecheck/build; provenance has 7 tests. Firefox/WebKit focused numerical checks pass.
- **NO-GO for production UI/public release remains intentional and accepted as this task's outcome.** The numerical prototype is complete, but actual FilmFrame visual usefulness is unproven, historical dark-gray drift remains documented, 1080p CPU rendering is non-interactive, and Hanatos/KG3/global asset rights remain unresolved.
- The unchecked UI-go acceptance criterion above is deliberately not marked complete. A later low-resolution experiment requires separate approval and a real-renderer A/B, Worker/memory plan and license clearance.
