# Implementation Plan: SpektraLab negative-film integration

## Planning Status

This is the parent execution roadmap. The user approved open-source reuse on 2026-11-06; final implementation approval is still required. Do not start all children concurrently or treat the physical-edge task as part of the first code change.

## Ordered Checklist

### Phase A — Rights and Reusable Inputs (independent child)

- [ ] Work `.trellis/tasks/11-06-spectral-license-provenance/prd.md` in parallel with the isolated prototype.
- [ ] Pin sources/digests, copy GPL/CC license texts and attribution, and record modifications separately.
- [ ] Inventory FilmFrame's historical assets and resolve/exclude any without distribution rights; clarify spectral-constant provenance.
- [ ] Add provenance validation and corresponding-source release documentation before distributing derived code/data.
- **Gate:** no public derived release until this passes. A local prototype may proceed only with source notices and recorded inputs.

### Phase B — Portra Spectral Feasibility (first implementation child)

- [ ] Start only `.trellis/tasks/11-06-spectral-negative-print-prototype/prd.md` after explicit approval of this roadmap.
- [ ] Before coding, load the curated frontend specs and three research documents; write the child's detailed `design.md`/`implement.md` including exact upstream stage/config mappings, imported-resource digests, omitted stages and tolerance targets.
- [ ] Import/pin the approved Portra 400, Portra Endura and spectral reference inputs without unverified artwork/fonts.
- [ ] Implement pure TypeScript float-array film/print/scan stages and deterministic small fixture adapters. Preserve intermediate density, alpha boundary and bounded dimensions.
- [ ] Port/compare upstream gray-ramp film raw, negative density and print RGB plus green patch print RGB; do not weaken tolerances to conceal an unexplained mismatch.
- [ ] Build isolated visual A/B fixtures with grain=0 and unchanged film borders; benchmark small and <=1920x1080 cases in Chromium, then Firefox/WebKit.
- [ ] Record measured errors, timings, memory estimates, limitations and go/no-go recommendation in the child's research/review artifacts.
- **Gate:** numerical agreement + visibly useful result + feasible resource/performance + provenance for inputs. Failure stops UI integration; revise model rather than force a full engine port.

### Phase C — Explicit Experimental FilmFrame Mode (dependent child)

- [ ] Activate `.trellis/tasks/11-06-spectral-look-ui-integration/prd.md` only after B's go decision and its own final plan review.
- [ ] Add optional legacy-default imaging-mode setting through domain types/defaults, storage/recipes, render keys, controlled inspector and mobile/desktop surfaces.
- [ ] Integrate the validated service at the real-135 Portra aperture/emulsion stage, before grain/template/markings, without changing border pixels or geometry.
- [ ] Share typed CPU processing between Worker and main; preserve cancellation, failure/fallback semantics, stale URL cleanup, `{url,byteSize}` and export behavior.
- [ ] Extend render admission for float working planes; reject excessive allocations before work.
- [ ] Add unit/browser/visual coverage, disclosure/credits and honest experimental labeling. Do not expose negative-scan inversion or unsupported spectral strip behavior.
- **Gate:** complete frontend regression plus focused real-browser checks, usable performance and completed distribution license/provenance review.

### Phase D — Separate Physical Film-Edge Increment (deferred child)

- [ ] Revisit `.trellis/tasks/11-06-physical-135-film-edge/prd.md` only after the first imaging increment is reviewed.
- [ ] Acquire/license reference film or document owned/nominal geometry; decide whether to adapt GPL Film Edge code and record that derivation.
- [ ] Produce detailed design for shared mm geometry, deterministic body/frame seeds, perforation/scan-light material, markings and continuous strip.
- [ ] Implement only after separate approval and validate geometry/determinism independently from color.
- **Gate:** no half-frame/120/all-stock expansion in the first edge increment.

### Parent Integration Review

- [ ] Verify child acceptance and dependency evidence; no child claims unsupported full SpektraLab parity.
- [ ] Run full project checks and inspect final source/provenance diff.
- [ ] Update rendering/project documentation and reusable specs with verified new contracts.
- [ ] Review license/credits/source availability and unresolved asset register before any release.
- [ ] Commit only scoped changes with user authorization; no push/deploy without explicit approval.

## Validation Commands

For prototype/UI child as applicable:

```bash
npm test -- --run tests/spectralFilm.test.ts tests/settingsStorage.test.ts tests/recipeStorage.test.ts tests/renderResult.test.ts
npm run check
npm run test:e2e
git diff --check
```

Add focused test filenames once the child's design chooses module boundaries. Run real Chromium/Firefox/WebKit visual/fallback tests and required physical mobile smoke evidence for user-facing rollout. Browser benchmarks must report device/browser/resolution/configuration and are not replaced by unit tests.

For provenance tooling, add a focused validator/test command and run it in CI/release checks; `npm run check` alone cannot prove asset rights or license completeness.

## High-Risk Files / Rollback Points

- New spectral service/resources: numerical stage order, float precision, license/digest provenance and large working planes. Keep behind isolated API; remove without changing legacy renderer.
- `services/filmEngine.ts` and `services/filmWorker.ts`: insertion order and parity. Small guarded call-site diffs; avoid broad renderer refactor.
- `services/filmWorkerClient.ts`: cancellation/fallback must remain semantically unchanged; do not rewrite protocol for the prototype.
- `types.ts`, `services/settingsStorage.ts`, `services/renderResult.ts`: legacy default, normalized allowlist and artifact identity must change together.
- `services/renderAdmission.ts`, `services/batchAdmission.ts`: account for additional float planes rather than treating Canvas budget as total memory.
- `App.tsx`/settings components: keep orchestration/controlled props and desktop/mobile parity.
- License/provenance/release files: public distribution gate; unresolved historical asset rights cannot be waived by implementation convenience.

## Follow-up Checks Before Starting Each Child

- Read child PRD and parent `design.md`; write child's complex-task design/implementation details.
- Curate that child's `implement.jsonl` and `check.jsonl` with only relevant specs/research.
- Resolve its remaining technical unknowns or document them without changing approved MVP behavior.
- Obtain explicit user approval for the final roadmap; later material scope changes return to planning.
