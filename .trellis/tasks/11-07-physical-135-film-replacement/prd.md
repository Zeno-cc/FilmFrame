# Replace real 135 with a complete physical film pipeline

## Goal

Replace the current real-135 stock-template appearance with a full-frame physical film-edge and development pipeline: one photograph is expanded into a 135 film canvas, developed with its edge exposure and markings, then composited with scan light. The legacy templates remain available only as an explicit classic/compatibility rendering choice.

This is a **real-135 replacement**, not another optional border decoration. Full-frame 135 must be complete and visually coherent before half-frame, 120 or XPan is considered.

## Confirmed Product Decisions

- The user explicitly wants the physical model to **replace the existing real-135 look** after validated comparison, rather than remain a permanent side experiment.
- Spectral film color and physical film edge must not be treated as independent layers simply composited afterward. Edge imprints/fog participate in exposure and development. Perforations are **absent film, not black or transparent image pixels**: before paper exposure they must receive the stock-specific base-canceling CMY density so the enlarger effectively sees clear light; backing/cut-wall light is composited only after print/scan.
- Existing real-135 templates become a classic compatibility route. Classic rendering remains available; no silent substitution of one film stock for another.
- Work is broken into independently reviewable increments. Do not switch the production default before numerical/geometry, real-renderer, lifecycle and human visual gates pass.
- All photo processing remains in the browser, using existing main Canvas/Worker/export architecture. No remote photo service or native application dependency.
- GPL-derived code and CC BY-SA profile reuse follow the existing accepted route and provenance records. No unlicensed SpektraLab screenshots, covers, fonts, branding or unverified reference scans. Unresolved rights still block public distribution independently of technical completion.

## Confirmed Current-State Evidence

- `services/filmGeometry.ts`, `filmOverlay.ts` and the existing normalized templates provide nominal 135 geometry and compatibility baselines, not an exact measured gate for every stock.
- `services/spectral` provides shared CPU/WebGL2 film → print → scan stages for supported color-negative stocks. Its current aperture adapter deliberately processes only the aperture.
- Current real-135 borders, sprocket masks, Gold look and grain are composited separately and cannot be stacked on the new physical model without double-counting effects.
- SpektraLab's overscan model precedes development and includes gate/perforation geometry, seeded body/frame variation, imprints, fog/leaks and scan-light/cut-wall composition. Its Metal/Vulkan code is not a browser drop-in.
- Prior research: `../11-06-integrate-spektralab-negative/research/spektralab-film-edge-and-licensing.md` and `filmframe-integration-boundaries.md`; spectral registry and backend contracts are in `../11-06-webgl2-spectral-migration/`.

## Requirements

### R1 — One physical 135 pipeline and rendering order

- Implement full-frame 135 film-space geometry in millimetres, with explicit px/mm, portrait orientation, crop-in-gate and output-scan transforms.
- Order the spectral negative route as: source positive photograph/crop → expanded gate/film exposure → edge imprints, restrained fog/leaks → halation/spatial development as enabled → film/negative development → film-presence blending with stock-specific base-canceling hole CMY → paper exposure/development/scan → backing/cut-wall light → export. A mask that merely makes holes transparent/black without this density correction is explicitly incorrect.
- Geometry/backing-only physical compatibility may be used without spectral color only when explicitly labeled. It must not pretend that edge fog/imprints underwent spectral development or substitute a legacy stock transform for the selected spectral identity.
- Keep spectral color and physical-edge acceptance separately measurable, but allow their required processing domains to interact in the correct order. Do not put a spectral photo behind another decorative border.
- Do not apply legacy stock-color transforms, legacy template grain, overlay PNGs, tint masks or duplicate markings to the physical pipeline.

### R2 — Physical geometry, gate and perforations

- Derive a stock-specific base-canceling hole-density solution from the film's spectral dye/base response and the paper receiver; reject degenerate/unvalidated solutions. Hole density blends by film-presence coverage, including soft edges, before paper exposure. The final backing must not be fed back through development.
- Use a declared, evidenced full-frame 135 gate/film/advance model, with provenance for every measured, nominal and artistic value. Do not claim the existing shared `1123/800` aperture or nominal `36x24` is a universally measured gate.
- Support square full-frame gate, physical perforation registration, subtle corner/edge variation and resolution-dependent softness; preserve gate crop and no opaque aperture seams.
- Provide black/open scan backing and restrained cut-wall treatment. Do not render identical hard holes surrounded by uniform dark rings.
- Single frames and continuous strips share a coherent perforation/advance grid, rather than repeating complete cards with independently reset holes.

### R3 — Edge imprints and stock identity

- Model stock-specific edge text, frame number, simple marks and documented DX layout in film-space before development so they share optical softness/material texture.
- Bind a physical edge layout to an exact film identity. Compatible/approximate layouts must be explicitly labeled, never represented as an independently measured template for that stock.
- Keep unsupported B&W, positive/slide and CineStill-specific spatial behavior distinct. Do not turn a color-negative layout into a false full-fidelity claim for those models.
- Reuse existing roll numbering/order and explicit number-color semantics where meaningful; do not recolor baked stock branding or introduce an unrelated frame-number model.

### R4 — Fog, leaks, optical softness and material

- Provide restrained, controllable edge fog with zero disabling it, plus localized spool/cassette leak contributions with default zero.
- Treat first-pass colored fog/leak curves as an explicit approximation unless evaluated in the proper film-exposure/sensitivity domain. No fixed orange CSS overlay sold as chemical fidelity.
- Parameterize gate softness from the declared optical model and available aperture/f-number evidence; missing EXIF must produce a documented default, not an invented measurement.
- Keep material variation coherent and restrained; no excessive scratches, dark rims, hard fog edges or random texture changes on re-render.

### R5 — Deterministic body/frame identity

- Introduce independent, stable body and frame/advance/scan seeds. Body characteristics persist across a roll; frame-specific registration, fog/leaks and small scan variations do not regenerate the body.
- Seeds derive from stable session/roll/image identifiers and render settings, never local path disclosure, network requests or timestamps on every render. Changing a frame seed must not regenerate body characteristics.
- Persist/normalize seed settings and include every output-affecting value in preferences, recipes and single/strip render-result keys. Provide “another body” and “another advance/frame” controls without changing photo inclusion/order.
- Identical settings/seeds/source produce identical geometry and deterministic texture at the same browser/resolution; preview/high share physical composition rather than re-randomizing.

### R6 — UI, persistence and migration

- Separate the **border/edge renderer** from the **imaging mode**. Do not overload `frameRenderMode: classic | real135` or `imagingMode: legacy | spectral` to mean both. Introduce an explicit physical-vs-legacy-template edge setting while preserving the existing compatibility meanings of those fields.
- Support an explicit compatibility matrix: legacy-template + legacy color; physical edge + legacy color only as a labeled geometry/backing approximation; physical edge + spectral negative for validated supported color-negative stocks; classic border for existing behavior. Unsupported combinations must be rejected before rendering rather than silently changing a mode.
- Add a coherent 135 physical-edge panel: enable/mode, gate/crop-in-gate behavior, view (single/strip as applicable), straighten, backing, body/frame seed controls, frame number, fog/leaks and concise optical explanations.
- Map current meaningful preferences/recipes where possible, with explicit defaults for new fields. Existing legacy `classic` and old recipes remain safe; do not change old stored preferences into an unvalidated new default before the switch gate.
- Define a versioned migration/switch decision: during development legacy real-135 remains default; only after final acceptance does physical full-frame become the real-135 default. Keep `经典边框/经典片边` compatibility explicit.
- Selecting a supported film does not silently enable spectral mode; choosing the physical 135 output mode must not silently replace a film's spectral identity.

### R7 — Shared main/Worker architecture and resource lifecycle

- Use shared typed film-space geometry/seed plans and shared Canvas-compatible drawing helpers for main and Worker. Use a separate WebGL2 scratch surface for float exposure/development, never a second context on a 2D destination canvas.
- Preserve current crop transforms, automatic portrait handling, output scanner aspect, JPEG/PNG MIME/quality, Blob+byteSize, Object URL ownership, ordered strip, cancellation and stale-result rejection.
- Maintain bounded CPU/GPU/Canvas allocations, including overscan-expanded frames and strips. Validate all scratch surfaces before allocation and clean up textures, framebuffers, programs, VAOs, bitmaps and temporary canvases on success/error/disposal.
- A Worker failure may retry once on main with identical physical settings; cancellation is terminal. GPU failure/context loss must use the equivalent CPU physical path or fail explicitly, never silently switch to a legacy template.

### R8 — Evidence, licensing and rollout

- Record every reused code/data/reference source, license and modification. Label geometry measured/nominal/artistic and do not infer independent verification from upstream comments.
- Keep current source/license blockers visible. Technical acceptance is not public-release clearance.
- Build fixed deterministic references and an old-vs-new comparison harness with grain disabled where isolation is needed. Validate actual production main/Worker output, not only isolated math or harness screenshots.

## Acceptance Criteria

> 2026-11-19 收尾：本任务已实现并被后续任务取代，以下的「取代前门禁」清单不作为归档门禁逐项回填。逐项证据与取代关系见 `closure.md`。

### Geometry and deterministic behavior

- [ ] Full-frame 135 gate/advance/perforation geometry, orientation transposition, crop registration and output dimensions have unit tests with explicit provenance.
- [ ] Same body/frame inputs produce identical output at the same browser/resolution; body/frame controls affect only their intended domains and participate in stable single/strip identity.
- [ ] Single and continuous-strip frames align at equivalent px/mm, with coherent continuous perforation/advance and no repeated-card seams.
- [ ] Preview/high resolutions preserve physical composition; holes have bounded softness without uniform dark rings or opaque gate seams.

### Physical image and visual quality

- [ ] Each supported stock's hole-density/base-canceling solution has numerical evidence: film-present pixels are unchanged, absent film passes the expected clear receiver exposure within tolerance, and soft edges blend rather than switch abruptly. Backing selection cannot alter the negative/paper input.
- [ ] The complete physical/spectral claim is limited to validated supported color-negative stocks. B&W, positive/slide, missing exact profiles and CineStill-specific halation remain classic or explicitly labeled compatibility, not silently promoted to full physical/spectral parity.
- [ ] Edge text/frame marks, fog/leaks and material share the appropriate development/texture stages; no duplicate legacy border/color/grain is applied.
- [ ] Zero fog/leak controls remove those effects; optical defaults for missing EXIF are documented. Bright/dark sources, multiple seeds, portrait rotation and one/four/five-frame strips are checked.
- [ ] Human review at fit/100%/200% approves continuous film material, gate edges, perforation softness, markings, restrained fog and no text collisions across representative stock families.
- [ ] Exact supported stocks and approximate/compatibility layouts are identified honestly; no unimplemented B&W/positive/CineStill/full-native parity is claimed.

### Application compatibility and performance

- [ ] Desktop/mobile controls, preferences/recipes/render identity, crop, JPEG/PNG export, cancellation, stale URLs and current legacy flows pass.
- [ ] Main/Worker and CPU/GPU routes implement the same requested physical look within documented tolerances; forced failure never silently produces a different template/look. Test every supported edge/imaging combination, including explicit rejection of unsupported combinations.
- [ ] Expanded-canvas memory, 1080p-class single/strip timing, readback, disposal and no-external-request behavior are measured on real production routes.
- [ ] Final switch to physical real-135 default is an explicit reviewed migration with classic compatibility and rollback, not a silent mid-development default change.

### Closure

- [ ] Complete unit/integration/browser/visual/provenance checks, independent `trellis-check`, recorded go/no-go decision and task evidence.
- [ ] No public distribution is claimed while existing source/profile/historic-asset/corresponding-source blockers remain.

## Out of Scope for the Complete 135 Increment

- Half-frame pair composition, all 120 formats, XPan, non-square gate families, mounted/filed scan modes, Date Back, full stock-specific DX fidelity without independently established data.
- RAW decoding, camera-negative scan inversion, arbitrary scanner calibration or an all-stock claim of measured physical fidelity.
- Replacing the React/session architecture, remote rendering, native macOS application port, or full native SpektraLab pixel parity without separate evidence.

## Planning Constraints

- Keep `prd.md` requirement-focused; `design.md` owns architecture/data flow and `implement.md` owns ordered gates.
- Preserve the prior `11-06-physical-135-film-edge` research task as historical scope. This task supersedes its deferred optional-only direction with the user's explicit replacement goal; do not duplicate or rewrite that historical record.
