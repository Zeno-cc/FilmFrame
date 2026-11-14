# Plan review: errors corrected and remaining gates

## Review outcome

The replacement direction is feasible, but the first plan was not implementation-ready. The following substantive gaps have now been corrected in `prd.md`, `design.md`, `implement.md` and `research/implementation-contract.md`.

### 1. Perforations are a density-domain operation, not an alpha cutout

**Original defect:** the pipeline said film-presence removal/masking before print/scan without defining how absent film affects the enlarger. A black/transparent hole would incorrectly leave density in the paper exposure.

**Corrected contract:** derive and validate a stock-specific base-canceling hole CMY from film spectral response and paper receiver. Blend it with developed density by soft film-presence coverage before paper exposure. The final backing/cut-wall light comes after scan and never re-enters development. Numerical acceptance must show film-present pixels unchanged, absent film clear receiver exposure within tolerance, no hard discontinuity and explicit rejection of degenerate solutions.

### 2. Edge renderer and imaging mode are independent

**Original defect:** `frameRenderMode` (classic/real135) and `imagingMode` (legacy/spectral) did not define a physical-vs-legacy-template mode, leaving "physical with legacy" and "physical with spectral" ambiguous.

**Corrected contract:** introduce a separate physical-vs-legacy-template edge setting. Define all combinations: existing legacy+legacy; physical+legacy as labeled geometry/backing approximation; physical+spectral for validated color negatives; classic border for current behavior. Reject unsupported combinations before allocation, never silently change modes.

### 3. "Complete 135" cannot imply all stock types have full physical/spectral parity

**Original defect:** the broad replacement goal could be read as every existing film receiving the complete exposure/development edge model, despite separate B&W/positive/CineStill boundaries.

**Corrected contract:** full physical/spectral claims apply only to validated supported color-negative stocks. Geometry/backing-only compatibility is explicitly an approximation. B&W, positive/slide, missing exact profiles and CineStill-specific spatial halation remain classic or explicitly labeled compatibility; no silent promotion.

### 4. Production replacement requires explicit gates

The final migration is a separate Phase D, not an automatic result of rendering one attractive experimental image. Numerical, geometry, Worker/main, lifecycle, performance, real-renderer visual and independent review must pass before changing the default. Classic compatibility and settings-based rollback remain. Public distribution rights remain independently blocked.

## Remaining implementation-time unknowns (not silently assumed resolved)

- Exact full-frame gate/optical values and their measured/nominal/artistic provenance must be selected and documented in Phase 0.
- Base-canceling hole solutions must be derived/validated per supported film/paper pair; there is no universal zero-density shortcut.
- Any fog/halation/grain addition must declare whether it is in the spectral exposure/development domain or an explicit approximation.
- Continuous-strip float texture/memory budgets require production measurement; isolated 1080p timings are not sufficient.
- Exact DX/font/edge layout fidelity remains limited by independent evidence and licensing, not by Canvas capability.

No product/rendering code was changed during this planning review. The revised planning artifacts remain in `planning`; implementation requires approval of the final planning summary before `task.py start`.
