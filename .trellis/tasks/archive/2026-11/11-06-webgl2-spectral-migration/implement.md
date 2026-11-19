# Implement: WebGL2 Spectral Migration

## Phase A — Feasibility First

- [x] Build WebGL2 float-texture spectral backend behind a shared interface, with capability checks, disposal and failure/context-loss behavior.
- [x] Compare CPU/GPU film/negative/paper/output on strict small fixtures and actual sRGB-to-ProPhoto conversion; record precision-based tolerance. ANGLE Metal, Firefox and WebKit pass original thresholds; SwiftShader chromatic print-RGB residual is documented as an unresolved limitation.
- [x] Benchmark setup/upload/render/readback/repeat at 256x256 and 1920x1080, including actual texture sizes and cleanup; focused Firefox/WebKit.
- [x] Persist measured feasibility, not a claim based on native GPU timing. See `research/phase-a-feasibility.md` and browser JSON evidence.

## Phase B — One Real FilmFrame Path

- [x] Add explicit opt-in experimental Portra 400 real-135 single-frame setting with legacy default.
- [x] Integrate backend after aperture transform and before existing grain/template/markings/export; main/Worker capability-aware selection and CPU fallback.
- [x] Add normalized settings/preferences/recipes/render-result identity and accessible desktop/mobile control.
- [x] Verify real-renderer A/B, cancellation, stale URL ownership, memory/error handling, export and no external requests.

## Phase C — Data-Driven Stock Migration

- [x] Generate validated per-stock setup data with exact profile/paper/source/filter digests and licenses.
- [x] Migrate Gold/Portra/Ektar/Ultramax aperture looks with common backend, preserving owned border/template geometry.
- [x] Resolve Superia and other mapping metadata from pinned profile JSON; add supported missing negative profiles in small tested batches.
- [x] Do not substitute mismatched brands or slide/print-paper types; document any exact-match blockers.
- [x] Verify every registered stock's actual rendering, settings/recipes/result identity and duplicate/replacement semantics.

## Phase D — Closure

- [x] Independent numerical/code/browser/provenance review; fix concrete findings.
- [x] Full `npm run check`, focused cross-browser, `npm run test:e2e`, `npm run test:provenance`, `git diff --check`.
- [x] Update project/spec rendering and license/provenance documents with verified contracts.
- [x] Audit every objective requirement against artifacts; no claim of production/public release while rights remain unresolved.

## Final Objective Audit — 2026-11-07

- The rollout child's independent reviewer found and re-verified fixes for Gold layered spectral bypass and unsupported/async spectral strip behavior. No new technical blockers remained in that focused re-review; see `../11-06-spectral-negative-stock-rollout/research/independent-review.md`.
- Production lazy loading is per stock, verifies source identity and array digests before allocation, and preserves explicit resource selection. Gold's special layered route has actual Chrome hardware-GPU/CPU and Worker/main aperture parity in `../11-06-spectral-negative-stock-rollout/research/gold-production-validation.json`.
- Final `npm run check`: 217 unit tests, 120 stock/stage comparisons, typecheck/build. Full Playwright: 50/50. Provenance: 7/7. `git diff --check` passed.
- Measured 1080p figures remain isolated-backend evidence, not complete FilmFrame production latency. No claim of universal device/full-frame pixel parity or native spatial/stochastic parity. Spectral strips are explicitly rejected before Worker creation; legacy strips remain supported.
- Public distribution remains blocked by the license/provenance child. No commit/push/release has been performed by this technical closure.

## Change Boundary

New WebGL backend/harness/registry initially; only after parity touch `types.ts`, settings/storage/result, App/UI and existing filmEngine/filmWorker at the aperture boundary. No React/state rewrite, no GPU server, no full native spatial pipeline and no all-at-once unverified catalog port.
