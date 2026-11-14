# Integrate SpektraLab negative-film capabilities into FilmFrame

## Goal

Improve FilmFrame's film color/tonality by bringing a validated SpektraLab/spektrafilm spectral negative-to-print slice into the existing browser-local workflow, then consider physical film-edge improvements independently.

The user considers SpektraLab's film/negative output better than FilmFrame's current output and wants to absorb that capability rather than build a separate product. Success is a measurable, useful FilmFrame improvement—not a claim of full native-engine parity.

## Decisions

- **2026-11-06 — Open-source reuse accepted:** use GPL-3.0-or-later for reused/derived covered code and CC BY-SA 4.0 for reused/derived measured profiles/LUTs, with complete attribution, modification records and distribution compliance.
- **Input semantics:** ordinary positive digital photos -> simulated negative -> positive print/scan. Imported orange-mask camera-negative inversion is a different feature and is not included.
- **First reference:** Kodak Portra 400 negative with Kodak Portra Endura paper because upstream supplies paired gray-ramp/green-patch regression references. Gold and other stocks are subsequent decisions.
- **Delivery:** isolated numerical/visual/browser prototype before an explicit experimental FilmFrame mode. Preserve legacy defaults, existing film templates and main/Worker/export architecture.
- **Film Edge:** later independent 135 increment; do not combine spectral color and border redesign in the first implementation.

## Confirmed Current-State Evidence

- SpektraLab (`02d82b56cf65f0f8e802a708612edc4e9a4790af`) is SwiftUI + C++20 Metal with a Vulkan backend. Its positive-scene pipeline synthesizes film density and then print/scan RGB. `scan_film` outputs the simulated negative; it does not ingest and invert an uploaded camera-negative scan (`research/spektralab-negative-pipeline.md`).
- SpektraLab/spektrafilm code is GPL-3.0-or-later. Original measured film/paper profiles and derived print LUTs are CC BY-SA 4.0. The provenance of every spectral constant was not established and must be cleared before redistribution.
- Upstream spektrafilm (`3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`) supplies Portra 400/Endura film-raw, negative-density, print-RGB gray-ramp16 and print-RGB green-patch8 regression cases. Its own snapshot tolerance is `rtol=1.5e-3`, `atol=1e-6`; browser tolerances must be justified by measured numerical differences.
- FilmFrame has 16 real-135 stocks/templates, but only Gold 200 currently applies a stock-conditioned photo-color transform; most other stock differences are border/template/preset appearance (`services/filmColor.ts:1-44`, `types.ts:92-186`).
- A spectral stage belongs after real-135 aperture crop/cover/rotation and before grain, border/template, markings and export (`services/filmEngine.ts:697-728`, `services/filmWorker.ts:539-566`). Classic rendering does not inherit it automatically (`research/filmframe-integration-boundaries.md`).
- The pinned upstream has no browser WebGL/WebGPU/WASM backend. Browser numerical parity, speed and memory limits are unverified; native Metal timings are not browser promises.
- FilmFrame currently has no project license and warns against assuming code/film asset permission (`README.md:202-204`). Accepting GPL reuse does not resolve historical template/mask/font/artwork rights.

## Child Task Map and Dependencies

| Child | Deliverable | Dependency / Gate |
| --- | --- | --- |
| `11-06-spectral-license-provenance` | Auditable GPL/CC reuse manifest, source notices, spectral-data evidence, existing FilmFrame asset rights inventory and distribution checks | May proceed alongside the prototype; mandatory before public distribution |
| `11-06-spectral-negative-print-prototype` | Isolated Portra spectral TypeScript pipeline, upstream intermediate/final comparisons, visual A/B and browser benchmarks | First implementation child; use provenance-recorded inputs; no public release until license gate |
| `11-06-spectral-look-ui-integration` | Explicit experimental Portra real-135 single-frame mode with legacy default and compatible settings/render lifecycle | Requires prototype numerical/visual/performance go decision; distribution requires license gate |
| `11-06-physical-135-film-edge` | Reviewed full-frame 135 continuous film geometry/material/seed upgrade | Deferred; own references, design and approval; does not block spectral prototype |

The parent owns cross-child scope and final integration review, not a parallel rewrite of the same renderer. Child artifacts record their detailed implementation dependencies.

## Requirements

- R1: Preserve three meaningful processing domains—scene exposure, negative density and print/scan RGB—rather than replacing the model with an arbitrary RGB preset.
- R2: Validate the Portra prototype against upstream intermediate negative-density and final print-RGB fixtures before judging screenshots.
- R3: Keep initial spatial/stochastic features and omitted output stages explicit; do not advertise full SpektraLab parity from a pointwise approximation.
- R4: Measure browser runtime and float-array working sets before user-facing integration; choose preview limits from evidence, not native GPU benchmarks.
- R5: Add any production spectral mode as opt-in with legacy default, normalized v1 preferences/recipes and stable render-result identity.
- R6: Apply production color only to aperture/emulsion pixels, leaving template/rebate pixels and existing crop geometry unchanged.
- R7: Preserve local-only image processing, Worker cancellation/failure fallback, stale-result rejection, Object URL cleanup, bounded allocations, JPEG/PNG export and current legacy behavior.
- R8: Document every derived code/data/test input, its license and modifications. Block public distribution on unresolved spectral-constant or FilmFrame asset rights.
- R9: Keep spectral imaging, UI integration and physical film-edge acceptance independently verifiable through child tasks.

## Acceptance Criteria

### Parent / Integration

- [ ] Three source-evidenced research reports and the child PRDs define the approved pipeline, integration boundaries, exclusions and licensing gates.
- [ ] The selected first stock has paired upstream film/print references; the prototype has an explicit numerical/visual/performance go/no-go review.
- [ ] No default recipe or existing film template changes as a side effect of the experiment.
- [ ] Production UI, if reached, behaves consistently through Worker and forced-main routes and honestly describes experimental limitations.
- [ ] The parent final review confirms child dependency evidence, no negative-scan/full-parity misrepresentation, and completed distribution rights/notices.
- [ ] This final planning summary receives explicit user approval before implementation starts.

### Prototype (child-owned, parent gate)

- [ ] Negative-density and print-RGB outputs match equivalent upstream gray-ramp/green-patch cases within documented, justified tolerances.
- [ ] Fixed fixtures provide reviewable legacy/spectral A/B output with grain disabled and borders excluded from color comparison.
- [ ] Browser timings/working-set estimates support an explicit initial resolution cap and the UI go/no-go decision.

### Production Integration (dependent child)

- [ ] Portra real-135 single-frame spectral mode is opt-in, locally processed, bounded, exportable and reversible to legacy output.
- [ ] Settings/preferences/recipes/result keys, cancellation, fallback, URL cleanup and desktop/mobile controls pass regression tests.
- [ ] Real-browser neutral/skin/saturated/shadow/highlight and portrait cases pass, with no border recoloring or external photo requests.

## Out of Scope for the First Imaging Increment

- Camera-negative scan inversion/scanner calibration, RAW decode, complete photographic-paper/enlarger UI or ICC export.
- All-film rollout, full native spectral parity, automatic GPU/WASM port, spatial DIR/grain/halation/glare, or full CAM16/output pipeline without separate validation.
- Replacing FilmFrame's UI/state/Worker/Canvas/export architecture or changing all 16 existing templates/looks.
- Physical film-edge formats beyond deferred full-frame 135, half-frame pairs, 120, XPan, mounted/filed scans or Date Back.
- Photo upload, hosted GPU conversion, runtime CDN dependencies, SpektraLab branding or unclear artwork/font redistribution.
- Public derived distribution before provenance/license clearance.

## Risks and Deferred Evidence

- **Rights:** historical FilmFrame template/asset provenance may require replacement or owner evidence before release; this is not solved by adopting GPL.
- **Spectral data:** unresolved individual constants require source-specific permission or independently sourced appropriately licensed data.
- **Performance:** two 81-wavelength integrals and multiple float planes may make small-preview CPU processing necessary before GPU investment.
- **Accuracy:** disabling spatial/stochastic/output stages changes the result; comparisons must use equivalent upstream configuration and disclose omissions.
- **Existing parity:** FilmFrame Worker/main Gold texture behavior already differs; the plan does not promise universal pixel identity or rewrite unrelated legacy paths.
- **Reference fidelity:** no upstream binary/reference film scan was built or independently measured during planning. Upstream baselines validate defined numerical cases, not universal visual accuracy.

## Planning Artifacts

- `design.md`: architecture, data flow, resource model, child dependencies, licensing and rollback.
- `implement.md`: ordered child execution, gates, validation commands and high-risk files.
- `implement.jsonl` / `check.jsonl`: curated specs/research for implementation and review subagents.
- `research/implementation-contract.md`: concise subagent scope/gates plus required full-report sections.
- `research/spektralab-negative-pipeline.md`
- `research/filmframe-integration-boundaries.md`
- `research/spektralab-film-edge-and-licensing.md`
- Four child PRDs listed in the task map.
