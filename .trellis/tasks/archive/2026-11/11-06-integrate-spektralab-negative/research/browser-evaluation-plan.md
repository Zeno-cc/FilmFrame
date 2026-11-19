# Browser Evaluation Plan: Portra Spectral Prototype

- Date: 2026-11-06
- Status: prepared while the numeric implementation agent is working; no UI integration approval.
- Ownership: evaluation contract only. The implementation agent owns numeric code, fixture generators and benchmark harness.

## Goal

Determine whether the ported pipeline is both numerically correct and useful in FilmFrame, independently of its film borders. A screenshot alone is insufficient; passing baselines alone does not establish interactive viability.

## Environment Gap Being Addressed

The initial full `check:release` attempt reached E2E but failed all 46 browser launches because Playwright Chromium, Firefox and WebKit executables were missing. Browser installation has been started separately by the main agent. No successful browser result should be claimed until actual launch/output evidence exists.

## Fixture Matrix

Use synthetic or explicitly project-owned images only. Do not fetch photos or upload them anywhere.

| Fixture | Purpose | Primary assertion |
| --- | --- | --- |
| 16-column neutral scene-linear gray ramp, 0.01..1 | Exact upstream match | Film log exposure, DIR negative density and encoded print RGB within justified tolerance |
| Constant scene-linear green `[0.05,0.40,0.05]`, 8x8 | Non-neutral channel response | Print RGB matches upstream, no arbitrary RGB-preset substitution |
| RGBA ramp with varying alpha, including 0/255 | API boundary | Alpha bytes preserved exactly; RGB finite |
| Neutral/skin-like/saturated/shadow/highlight swatches | Reviewable output | Spectral response is intentional and distinct; no NaN/out-of-range artifacts |
| One owned portrait and one landscape photo, if available with recorded permission | Cropping/visual utility only | No implicit second crop, border recolor or orientation bug in later integration |
| 256x256 and 1920x1080 synthetic frames | Resource measurement | Bounded allocations, timings and failure behavior |

Do not introduce an unlicensed reference photograph merely to make the comparison attractive.

## Evidence Layers

### A. Numeric correctness

- Pin and hash every input/reference file and generated table.
- Check dimensions/dtype/finiteness before errors.
- Record maximum/mean absolute error and count violations of `1e-6 + 1.5e-3*abs(expected)` for each baseline case.
- If Float32 requires a different tolerance, document the actual error distribution and explanation before changing the gate.
- Compare equivalent upstream configuration: pointwise DIR, fitted paper curves and CAM16-UCS remain enabled; spatial/stochastic stages are disabled as documented.

### B. Isolated visual comparison

- Render the same positive fixture through legacy/no-color and spectral output, with grain=0 and no border/template pixels.
- Display original, legacy and spectral panels at the same scale; include neutral ramp/green patch and an error/timing summary.
- Do not infer spectral quality from border appearance. The current production Portra border remains untouched.
- Human review looks for neutral tracking, highlight rolloff, hue shifts, clipping and obviously implausible colors; this is subjective supplemental evidence, not numerical proof.

### C. Browser/resource evidence

- Record OS/device, browser/version, viewport, image dimensions, warm/cold setup, and whether spatial effects/CAM16 are enabled.
- Measure initial setup, first film+print+scan render, repeated print render where exposed, and errors separately.
- Count/estimate source RGBA, float scene, negative density, paper density/working and output planes. Existing Canvas budget is not total float memory.
- Start 256x256; attempt 1920x1080 only with explicit bounds and no browser contention. No native M3 Max timing may be presented as a browser result.
- Test Chromium first; then Firefox/WebKit focused flow. A desktop WebKit pass does not substitute for real iPhone/Android smoke testing.

### D. Regression/no-side-effects

- Confirm no default FilmSettings, existing template, production renderer, export artifact or stored preference is changed by the prototype.
- Browser harness must make no external/photo-bearing mutation requests.
- `npm run check`, `npm run test:e2e`, provenance tests and `git diff --check` are separate evidence from spectral acceptance.

## Review Outcome

Prepare a concise report with:

1. Numeric case results and remaining approximation limits.
2. Links to small A/B evidence and exact browser environment.
3. Timing/memory evidence and a recommended initial preview cap.
4. Provenance blockers (including Hanatos/KG3 and historical FilmFrame assets).
5. **Go / hold / no-go** for the separate UI-integration planning task.

A missing browser, missing reference, unclear data license or failing baseline is an unresolved gate, not a silent skip. UI implementation does not start until the user approves that next phase after reviewing this evidence.
