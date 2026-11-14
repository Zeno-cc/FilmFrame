# Implementation Contract: SpektraLab Integration

- Date: 2026-11-06
- Status: approved planning constraints; implementation still requires final user approval.
- Purpose: concise subagent context that stays below injection limits. Full evidence remains in the sibling research files; do not treat this summary as permission to skip the active child's detailed plan.

## Approved Direction

The user accepts GPL-3.0-or-later for reused/derived covered code and CC BY-SA 4.0 for reused/derived measured profiles/LUTs. Preserve notices, attribution, modification records and distribution/source obligations. Accepting these licenses does not clear FilmFrame's historical assets or unresolved spectral-data provenance.

The first target is **ordinary positive photo -> Portra 400 negative -> Portra Endura paper -> positive scan**. It is not imported camera-negative inversion. Preserve FilmFrame's current UI, templates and default behavior. Prove an isolated prototype before production UI. Physical film edges are a separate deferred child.

## Required Reading by Role

- Numeric prototype: `spektralab-negative-pipeline.md` sections 1–5, plus license boundaries in section 6; `filmframe-integration-boundaries.md` sections 3, 5–6.
- FilmFrame UI integration: all of `filmframe-integration-boundaries.md`, especially sections 2–6; pipeline sections 1–5 for numerical/domain constraints.
- Review/licensing: pipeline section 6 and `spektralab-film-edge-and-licensing.md` licensing section; verify the license child's full PRD.
- Child PRDs contain dependencies and acceptance; parent `design.md`/`implement.md` define ordering and gates. Large files may be truncated by automatic injection, so explicitly Read their cited sections.

## Source Baseline

- SpektraLab `02d82b56cf65f0f8e802a708612edc4e9a4790af`.
- spektrafilm `3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`.
- Upstream `tests/regression_baselines.py`: Portra 400/Endura gray-ramp16 `film_raw`, `negative_density`, `print_rgb`, and green-patch8 `print_rgb`; upstream uses `rtol=1.5e-3`, `atol=1e-6` for its own cases. Any browser tolerance needs measured justification.
- Upstream source configuration must match the ported stage/omissions. Native defaults or screenshots are not interchangeable with the pointwise experiment.

## Prototype Rules

1. Pin/digest/license every imported code, profile, LUT, spectral table and test baseline before redistribution. No unverified SpektraLab artwork/fonts/icon.
2. Preserve scene RGB/exposure -> three-channel negative density -> paper density -> output RGB. Never reduce negative density to 8-bit display RGB before printing.
3. TypeScript + Float32Array reference first; Canvas is fixture/display IO. Bound dimensions and every working-plane allocation. No network processing, CDN, native application or remote GPU.
4. Initially isolate/disable DIR diffusion, grain, halation, glare, unsharp and unported gamut/normalization stages. Document exactly what differs; do not claim full parity.
5. Match intermediate and final upstream fixtures; investigate mismatches rather than loosening thresholds to hide them.
6. Benchmark <=1920x1080 first with device/browser/config reported. Multiple float planes and two 81-wavelength integrals may be costly; no native-timing promises.
7. UI integration is blocked until numerical correctness, useful A/B visual evidence, feasible resource/performance, and input provenance pass review.

## FilmFrame Integration Rules

1. Opt-in experimental Portra real-135 single-frame only; legacy remains default. No negative-scan UI or unsupported spectral strip behavior.
2. Insert after aperture cover/crop/rotation, before grain/template/base/sprockets/frame numbers/export: `services/filmEngine.ts:697-728`, `services/filmWorker.ts:539-566`. Never recolor template pixels or alter existing 1307x1203/aperture geometry.
3. Share typed CPU numeric services across main/Offscreen paths. Do not bypass types with Canvas casts. A failed spectral path must report failure, not silently emit legacy output.
4. Preserve `filmWorkerClient` facade, terminal cancellation, ordinary Worker main-thread retry, settings/transform currentness, late-result URL revocation, `{url,byteSize}`, MIME/quality, scanner composition and export.
5. New output-affecting settings must update domain defaults, settings/recipe normalization, controlled desktop/mobile UI, summary and `createRenderSettingsKey`. Missing old fields default to legacy. Do not persist runtime data/files/URLs.
6. Existing per-Canvas RGBA budget is not total float/GPU/WASM memory. Extend admission for source/negative/paper/work/output planes before allocation; release scratch resources on success/error/cancel/dispose.
7. Do not rewrite App state, Worker protocol, classic renderer, all templates, grain, frame numbering, ZIP/export or preview controller as a prerequisite.

## Child Execution Order

- A `11-06-spectral-license-provenance`: parallel with B, required before public distribution.
- B `11-06-spectral-negative-print-prototype`: first implementation; isolated tests/benchmarks and go/no-go.
- C `11-06-spectral-look-ui-integration`: only after B passes; separate detailed plan and regression checks.
- D `11-06-physical-135-film-edge`: deferred independent references/design/approval; no half-frame/120/all-stock expansion.

Each active child needs its own detailed design/implementation checklist and curated manifests before `task.py start`. No public push/deploy is implied by this planning or route decision.
