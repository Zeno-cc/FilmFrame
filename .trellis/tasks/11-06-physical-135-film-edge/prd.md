# Design physical 135 film-edge upgrade

## Goal

Improve FilmFrame's continuous 135 film material and edge appearance through a separately reviewed physical model, after the spectral-imaging prototype establishes the first imaging increment.

## Parent and Dependencies

- Parent: `.trellis/tasks/11-06-integrate-spektralab-negative/prd.md`.
- Deferred until the spectral prototype is reviewed; it must not delay or destabilize the first Portra color experiment.
- GPL-derived implementation reuse is allowed by the user's 2026-11-06 route decision, but every copied/translated implementation, measurement table or artwork still requires recorded provenance and GPL/asset-specific review through the sibling license task.
- No public upstream scan was independently measured in the parent research; exact physical fidelity is not an accepted assumption.

## Requirements

- R1: Scope the first edge increment to full-frame 135 and the existing Gold continuous-strip concept; preserve the 16 legacy template paths unless a separate migration is approved.
- R2: Define millimetre geometry, gate/perforation registration, film base/rebate, scan backlight, restrained material variation and frame markings with explicit measured/nominal/artistic provenance.
- R3: Use coherent per-body and per-frame deterministic variation; seeds must survive re-render, remain consistent across single/strip at equivalent scale, and participate in render identity.
- R4: Share geometry/plan helpers between main Canvas and Worker OffscreenCanvas; keep crop, frame numbering, rotation, export, cancellation and memory guards compatible.
- R5: If adapting SpektraLab Film Edge implementation, label and license the derived code GPL-3.0-or-later; do not import unlicensed covers/fonts/screenshots or claim measurements that were not independently verified.
- R6: Keep spectral image color and physical film-edge acceptance separately measurable; a change to one must not secretly alter the other.

## Acceptance Criteria

- [ ] A reviewed design and owned/approved reference set define the physical geometry and permitted code/data provenance before implementation.
- [ ] Deterministic geometry/texture tests cover pitch, gate registration, hole softness, text placement, seed stability, preview/high consistency, and single/continuous-strip correspondence.
- [ ] Human review at fit/100%/200% finds a coherent continuous strip without repeated-card appearance, hard identical holes, opaque aperture seams, excessive dark rims, or unreadable/colliding markings.
- [ ] Bright/dark images, several seeds, portrait rotation, one/four/five-frame strips, Worker and forced-main paths preserve current workflow and bounded resource behavior.
- [ ] Legacy/template outputs remain available, and color comparisons with grain disabled isolate border changes from imaging-mode changes.

## Out of Scope for the First Edge Increment

- Half-frame pairs, XPan, all 120 formats, alternate camera gates, mounted/filed scans, Date Back, full DX fidelity, unverified fonts/artwork, and all-stock measured layouts.
- Imported camera-negative inversion, full spectral engine port, replacing all 16 templates or claiming native pixel parity.

## Evidence

- `../11-06-integrate-spektralab-negative/research/spektralab-film-edge-and-licensing.md`: functional model, uncertainty, visual checks and licensing limits.
- `../11-06-integrate-spektralab-negative/research/filmframe-integration-boundaries.md`: current continuous Gold/template and Worker differences.
