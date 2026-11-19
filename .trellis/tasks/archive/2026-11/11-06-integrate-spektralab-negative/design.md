# Design: SpektraLab negative-film integration

## Status and Decision Boundary

Planning design dated 2026-11-06. The user accepted open-source reuse under GPL-3.0-or-later and CC BY-SA 4.0. This is not approval to distribute assets with unresolved rights or to begin implementation before the final planning review.

The initial product is **ordinary positive digital photo -> simulated Portra negative -> paired photographic paper -> positive scan**, not imported camera-negative inversion. The project should improve FilmFrame incrementally rather than port SpektraLab's macOS application.

## Research Baseline

- SpektraLab: `02d82b56cf65f0f8e802a708612edc4e9a4790af`.
- Original spektrafilm/reference data: `3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`.
- `research/spektralab-negative-pipeline.md`: source-confirmed pipeline, input assumptions, portability and resource estimates.
- `research/filmframe-integration-boundaries.md`: actual FilmFrame insertion and lifecycle contracts.
- `research/spektralab-film-edge-and-licensing.md`: later physical-edge option and asset/license limitations.

## Child Task Map

| Order | Child | Deliverable | Dependency |
| --- | --- | --- | --- |
| A (parallel with B) | `11-06-spectral-license-provenance` | Reuse manifest, GPL/CC notices, spectral-data evidence, FilmFrame asset inventory and distribution gate | Owner resolves any uncertain historical asset rights |
| B | `11-06-spectral-negative-print-prototype` | Isolated Portra 400/Endura TypeScript spectral pipeline, upstream baseline matches, visual A/B and browser benchmark | Uses only provenance-recorded GPL/CC inputs; no public release until A |
| C | `11-06-spectral-look-ui-integration` | Explicit experimental Portra real-135 single-frame look with compatible settings, CPU Worker/main paths and export | B's numerical/visual/performance go decision; A before distribution |
| D (later) | `11-06-physical-135-film-edge` | Independently reviewed 135 physical strip/edge model with deterministic geometry and separate visual acceptance | Does not block B/C; requires its own approved references and design before code |

Each child is independently checked and archived. The parent owns integration review and ensures C is not represented as a complete SpektraLab port.

## Architecture: Prototype First

```text
Owned/licensed small positive fixture
  -> explicit scene-linear RGB transfer/color-space conversion
  -> film spectral exposure + characteristic curves
  -> Float32Array CMY negative density (not display RGB)
  -> paired-paper spectral exposure + characteristic curves
  -> paper density
  -> viewing/scan spectral integral
  -> explicit output RGB encoding
  -> comparison against pinned upstream intermediate/final baselines
```

Use a focused TypeScript service and pure numeric helpers. Canvas2D is fixture input/output only, not the floating-point processing domain. Start without spatial/stochastic nodes; any omitted DIR/grain/halation/glare/unsharp/CAM16/exact normalization behavior is a disclosed approximation and separately tested if later enabled.

Precompute/share immutable stock/setup tables where provenance allows. Bound input resolution and working planes. First benchmark target is <=1920x1080, not native 45MP claims. The prototype must expose measured errors and timings rather than assume WebGL/WASM is necessary.

## Production Integration Boundary

For child C only, after prototype acceptance:

```text
File -> existing decode/crop/cover/rotation into aperture
     -> spectral film/print/scan stage (experimental, opt in)
     -> existing aperture grain (document interaction)
     -> existing film base/template/sprockets/frame numbers
     -> existing scanner composition and output orientation
     -> existing Canvas/OffscreenCanvas Blob export
```

- Insertion references: `services/filmEngine.ts:697-728`, `services/filmWorker.ts:539-566`; real-135 aperture-only policy.
- Use the same typed processing service for DOM/Offscreen paths; no Worker type casts to bypass incompatible contexts.
- Keep `filmWorkerClient` facade, its request/response metadata and main-thread retry boundary. Cancellation remains terminal and must not launch CPU fallback.
- A failed spectral CPU path must report a recoverable error; it must not silently emit the legacy look under spectral settings.
- Keep legacy default and current template PNGs, 1307x1203 geometry and aperture unchanged.
- Defer strip rollout until measured per-frame spectral cost and total working-set admission are acceptable; single/strip settings must not imply unsupported behavior.

## Settings, Identity and Lifecycle

- Add a narrow optional discriminated imaging-mode setting; old preferences/recipes with no field resolve to legacy.
- Extend `types.ts`, defaults, `services/settingsStorage.ts`, recipe normalization, controlled `RecipeInspector`, summary, and `services/renderResult.ts` keys as one coherent change.
- Persist only normalized primitive settings. Film profiles, density planes, decoded photos, GPU objects and Blob URLs remain runtime resources.
- Runtime resource owner releases scratch arrays/canvases and any future GPU resources on success, error, replacement, cancellation and disposal.
- Preview controller continues to reject late results/revoke replaced URLs. No new global store, router, network conversion or remote dependency.

## Resource Model

Existing RGBA Canvas budget is not total spectral memory. At minimum account for source RGBA, float scene RGB, negative CMY, paper density/work plane and encoded output before allocation. Use exact `width * height * channels * bytes` arithmetic with finite safe-integer checks and configured experimental caps.

At 1920x1080 one packed RGB float32 plane is about 23.73MiB; multiple planes can dominate Canvas memory. Two 81-wavelength integrals per pixel are about 168 million wavelength iterations before other arithmetic. These are sizing/work estimates, not browser benchmarks. The prototype establishes feasible preview/high modes and whether a future WebGL2 accelerator is justified.

GPU acceleration, if pursued later, requires independent WebGL2 float-target capability checks, a separate scratch context, CPU equivalence/tolerance, context-loss handling, resource cleanup and measured memory bounds. WASM is not a shortcut: the pinned engine has Metal/Vulkan per-pixel kernels and OS resource mapping rather than a ready browser CPU backend.

## Licensing and Distribution Contract

- Preserve SpektraLab/spektrafilm copyright and GPL-3.0-or-later notices on derived code and modification records.
- FilmFrame's covered combined work must use the approved GPL distribution model only after the owner resolves existing code/template/asset rights; adding a license file alone cannot clear unknown third-party assets.
- Keep original profile/LUT CC BY-SA 4.0 notices, Andrea Volpato attribution, canonical source link, modification indication and separate changes file. Finished user photographs remain the users' works.
- Record source URL, pinned commit, digest, local transformations and license for every imported/generated profile, LUT, spectral table, test baseline or artwork. Unresolved spectral-constant provenance blocks public redistribution until resolved/replaced.
- Keep SpektraLab name/icon and unlicensed artwork/fonts out of FilmFrame; provide factual non-endorsement credits.

## Rollout / Rollback

1. Land provenance scaffolding and an isolated experimental numeric service without changing defaults.
2. Pass upstream intermediate/output references and benchmark go/no-go review.
3. Enable explicit experimental Portra single-frame UI behind the legacy-preserving setting; verify Worker/main/fallback/memory/export.
4. Expand only after evidence: additional stock, strip, GPU or spatial effects each needs separate acceptance.
5. Independently design physical 135 edge upgrade; no automatic coupling to spectral rollout.

Rollback disables/removes the experimental setting and derived runtime resources while preserving legacy code paths. Persistent unknown fields are dropped by the existing normalizer, so rollback behavior and old recipe compatibility must be tested. Public release is blocked if provenance remains unresolved.

## Trade-offs

- GPL/CC reuse accelerates access to a real physical model and measured data but imposes distribution, attribution and share-alike responsibilities.
- Portra 400/Endura provides upstream gray-ramp and green-patch baselines; starting with Gold would have easier legacy A/B but lacks the same paired print-LUT/reference coverage. Existing borders make Portra visual integration bounded.
- A pointwise prototype proves color/density correctness but cannot establish full native equivalence. It deliberately postpones costly spatial/stochastic features.
- CPU-first adds a reference implementation before GPU work; this is intentional to avoid debugging shader performance and incorrect color science simultaneously.
