# Design: isolated Portra spectral prototype

## Approval and Scope

The user approved the parent roadmap and first phase on 2026-11-06. This child implements only a local numeric/browser experiment and provenance-recorded fixtures. It does not enable a user-facing spectral mode or change existing rendering defaults.

## Change Boundary

- Smallest gap: FilmFrame has no typed spectral film/print numeric path or objective Portra density/output comparison.
- Behavior belongs in new focused numeric services, not in `App.tsx`, `filmEngine`, `filmWorker`, UI or export code.
- Expected new files: spectral services/resources with notices, deterministic fixture decoding/comparison tests, a local benchmark/A-B harness, and child research/review artifacts. Add narrowly scoped license/provenance files coordinated with the sibling license task.
- Explicitly unchanged: existing 16 templates, legacy color, FilmSettings, App state, Worker routing/fallback, Canvas geometry, exports and release configuration.

## Source and Configuration Contract

- Pin SpektraLab `02d82b56cf65f0f8e802a708612edc4e9a4790af` and spektrafilm `3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`.
- Before importing each source/resource, record its exact pinned URL, digest, author/license, local modifications and notice destination. Prefer original spektrafilm Python model and tests for CPU semantics; consult SpektraLab only where its pipeline clarifies execution.
- Portra 400 film + Portra Endura paper; upstream `make_fast_test_params` and `regression_baselines.py` determine exact neutral settings, transfer functions and enabled stages. Document these values before coding numeric behavior.
- Measured correction recorded in `research/upstream-configuration-and-provenance.md`: the pinned print-RGB fixtures align with explicit OkLch output compression, not current default CAM16-UCS. The darkest gray column still differs under controlled upstream execution, so baseline disagreement is an explicit blocker, not a TypeScript regression to hide.
- Match upstream gray-ramp16 `film_raw`, `negative_density`, `print_rgb`, and green-patch8 `print_rgb`. Upstream uses `rtol=1.5e-3`, `atol=1e-6`; browser/TS differences require measured justification, never unexplained tolerance loosening.

## Numeric Boundaries

1. Deterministic scene-linear positive fixture with explicit channel order, range and transfer semantics.
2. Film spectral exposure/characteristic curve stage producing packed three-channel negative density in Float32Array.
3. Paper spectral exposure/development stage retaining paper density separately.
4. Viewing/scan integral and explicit output transfer/RGB encoding.
5. Optional alpha-carrying RGBA fixture adapter preserves each source alpha byte while processing RGB only.

Define finite dimension/pixel/allocation guards and explicit array ownership. Do not silently clamp an invalid pipeline result to create a plausible image. Use reusable pure kernels for spectral integration and curve evaluation rather than independent film/paper formulas that can drift.

## Test and Benchmark Strategy

- Decode pinned `.npz` baselines outside the public runtime bundle; raw NumPy `.npy` v1/v2 little-endian float64 C-order output is sufficient if verified against the pinned fixtures. No downloaded Python module executes inside FilmFrame.
- Use upstream's own Python regression runner as an independent baseline sanity check in an isolated temporary environment if dependencies permit; do not install or execute downloaded code from the repository root.
- Vitest checks fixture shape, intermediate/final errors, finite outputs, alpha preservation, invalid input and deterministic repeatability.
- Browser harness uses only synthetic/owned images, grain=0, no templates and no photo network requests. Export small A/B fixtures and timing/work-set JSON outside production `public/`.
- Benchmark 256x256 first, then 1920x1080 only if bounded and practical; Chromium mandatory, Firefox/WebKit before any UI integration. Record device/browser/config rather than promise interactive speed.

## Rollback / Go-No-Go

Remove the isolated services/resources/harness without touching legacy rendering. A failed baseline, unclear input license or impractical resource profile blocks child C. No GPU/WASM rewrite is allowed as a workaround in this child.

## Sibling Coordination

The license child owns global FilmFrame asset inventory and release/distribution decisions. The prototype owns exact provenance for its own imported/derived resources and must not mark global distribution approved. Share manifest schema/source paths rather than editing the same files concurrently.
