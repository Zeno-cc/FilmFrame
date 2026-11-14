# Integrate experimental spectral film look into FilmFrame

## Goal

Offer the validated Portra spectral result as an explicit, reversible FilmFrame experiment while preserving existing recipes, local-only processing, Canvas composition, fallback, export and stale-result behavior.

## Parent and Dependencies

- Parent: `.trellis/tasks/11-06-integrate-spektralab-negative/prd.md`.
- Depends on `.trellis/tasks/11-06-spectral-negative-print-prototype/prd.md` passing numerical, visual and performance go/no-go review.
- Public distribution also depends on `.trellis/tasks/11-06-spectral-license-provenance/prd.md` completing its rights and notices gate.
- A physical film-edge upgrade is not a prerequisite; retain existing template geometry in this task.

## Requirements

- R1: Add an explicit optional imaging-mode setting, with legacy mode as the compatibility default; the UI must identify spectral output as experimental and disclose material approximation limits.
- R2: Initial user-facing scope is Portra 400 with the existing real-135 single frame and its current template; ordinary positive digital photos are the input, not camera-negative scans.
- R3: Apply spectral processing only to aperture/emulsion pixels after crop/cover/rotation and before grain, border/template, markings and export. Do not color the film rebate or modify template geometry.
- R4: Keep float negative density outside display RGB until print/scan processing is complete. Use the prototype's bounded CPU path in both main and Worker contexts; do not silently substitute the legacy look when spectral mode fails.
- R5: Preserve terminal cancellation, Worker failure fallback, current settings/transform keys, image/strip ordering, Blob+byteSize result, preview cleanup, JPEG/PNG MIME/quality, scanner background and Canvas admission controls.
- R6: Extend FilmSettings normalization, existing v1 preferences/recipes, controlled desktop/mobile inspector, summary and stable render keys without persisting runtime profiles, image files, GPU objects or URLs.
- R7: Expand admission accounting for float RGB/density working planes and any scratch canvas before allocation; unsupported dimensions/memory fail with an actionable error rather than an unbounded allocation.
- R8: A later GPU accelerator must be separately justified by prototype benchmarks and must have equivalent CPU behavior, capability detection, resource cleanup and context-loss/error fallback.

## Acceptance Criteria

- [ ] Existing users/recipes retain legacy output by default; opting into spectral mode changes only the intended aperture pixels and visibly distinguishes Portra's film/paper response from the old no-color template path.
- [ ] Portra spectral single-frame render works through Worker and forced-main CPU routes, with matching documented numerical tolerances and no processing of template pixels.
- [ ] Changing imaging mode invalidates old single/strip artifacts as specified; preferences and old/new recipes round-trip safely and unknown/invalid values normalize predictably.
- [ ] Cancellation never falls back to new CPU work; late results are revoked; ordinary renderer errors preserve the existing main-thread retry contract and report spectral failures honestly.
- [ ] Desktop and 390px mobile expose the same controlled setting with accessible naming, focus behavior and concise experimental/approximation status.
- [ ] Unit, integration and real-browser tests cover neutral/skin/saturated/shadow/highlight inputs, portrait/user rotation, grain=0 comparisons, memory rejection, local-only requests, JPEG/PNG export and current legacy regression flows.
- [ ] Production distribution has the required license/credits; UI and documentation do not promise full SpektraLab parity or camera-negative inversion.

## Out of Scope / Deferred

- Multi-stock rollout, continuous-strip spectral optimization, automatic GPU selection, physical grain/halation, paper/enlarger controls, RAW and scanned-negative ingestion.
- Rewriting App state, Worker protocol, template geometry, classic renderer, all 16 film templates, or export/ZIP architecture.
- Changing legacy film looks or silently enabling spectral processing for every user.

## Evidence

- `../11-06-integrate-spektralab-negative/research/filmframe-integration-boundaries.md`: insertion point and compatibility contracts.
- `../11-06-integrate-spektralab-negative/research/spektralab-negative-pipeline.md`: required float density domain and omitted-stage constraints.
