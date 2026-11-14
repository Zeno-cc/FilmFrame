# Research: FilmFrame integration boundaries for SpektraLab-inspired negative/film output

- Query: Identify FilmFrame's internal integration boundaries for improved negative/film output, including color versus border behavior, Worker duplication, rendering and artifact contracts, settings compatibility, a staged path, tests, and WebGL/WASM coexistence.
- Scope: internal
- Date: 2026-11-06
- Task context: `.trellis/tasks/11-06-integrate-spektralab-negative/prd.md` (R1-R5); this report covers FilmFrame boundaries only, not a SpektraLab source-code or license analysis.

## Findings

### Files Found

| File Path | Description |
|---|---|
| `types.ts` | Film enum, border presets, `FilmSettings`, `ImageItem`, and render transform domain contracts |
| `App.tsx` | Defaults, settings ownership, render admission, commands, generation/stale-result checks, Blob URL ownership, and settings/recipe wiring |
| `services/filmEngine.ts` | Main-thread classic/programmatic/layered/flattened renderers and strip composition |
| `services/filmWorker.ts` | OffscreenCanvas Worker renderers and request/response dispatch |
| `services/filmWorkerClient.ts` | Capability gate, Worker lifecycle, cancellation, main-thread fallback, and Blob-to-Object-URL result |
| `services/filmColor.ts` | Gold 200 byte-space channel, soft-contrast, and highlight transform |
| `services/filmTexture.ts` | Shared grain plus main-thread film-base/dust/scratch texture functions |
| `services/filmGeometry.ts` | Physical 135 geometry and shared cover/auto-rotation drawing |
| `services/filmOverlay.ts` | Sixteen template URLs, common aperture/strip geometry, and exact overlay-band clipping |
| `services/filmResolution.ts` | Preview/high output widths and scanner-canvas dimensions |
| `services/renderAdmission.ts` | Pure canvas-size derivation and single-render admission |
| `services/renderBudget.ts` | Maximum-edge and single-canvas RGBA budget guards |
| `services/batchAdmission.ts` | Decoded-source/work-set and strip-output admission estimates |
| `services/canvasRuntime.ts` | Main-thread image loading, mask conversion, rotation, and Blob/Object-URL export |
| `services/renderResult.ts` | Stable settings/transform/order keys, MIME checks, and filenames |
| `services/settingsStorage.ts` | Persistent-settings allowlist, normalization, defaults merge, and localStorage envelope |
| `services/recipeStorage.ts` | Local recipe persistence, reusing the same settings normalizer |
| `components/settings/RecipeInspector.tsx` | Controlled desktop/mobile settings implementation |
| `components/settings/MobileSettingsSheet.tsx` | Mobile tabs and dialog behavior around the same inspector |
| `services/previewRenderController.ts` | Debounced preview generation, late-result suppression, and preview URL cleanup |
| `.trellis/spec/frontend/*.md` | Module, state, privacy, test, accessibility, and rendering-contract guidelines |
| `docs/project/rendering.md` | Maintained rendering-route and pipeline description, verified 2026-08-05 |

### 1. Existing per-film color versus border/template differences

#### 1.1 Film identity and photo color are separate mechanisms

- `FilmType` has 16 selectable stocks, including color negative, Ektachrome, black-and-white, Fuji, CineStill, and Ilford (`types.ts:2-24`).
- `FILM_PRESETS` contains hole geometry, font, and `brandColor`, not photo-color profiles (`types.ts:92-100`, `types.ts:135-186`). `App.tsx:357-369` uses a preset to update text color, classic hole type, and real-135 routing when the stock changes. This does not itself apply a photographic color transform.
- The only stock-conditioned photo-color call is Gold 200 (`services/filmColor.ts:1-44`). It reads and writes aperture pixels with `getImageData`/`putImageData`, applies `r*1.045+3`, `g*1.015+1`, `b*0.965`, per-channel soft contrast, and a 0.72 highlight knee (`services/filmColor.ts:8-29`). `docs/project/rendering.md:151-162` explicitly describes this as direct sRGB-byte processing without ICC, linear-light conversion, or a wide-gamut strategy.
- Main-thread programmatic 135, layered Gold, flattened-template, and Gold-strip call sites are respectively `services/filmEngine.ts:489-497`, `services/filmEngine.ts:699-705`, `services/filmEngine.ts:745-753`, and `services/filmEngine.ts:1038-1043`. The flattened call is behind a Gold-only condition, so the other 15 stocks receive cover, grain, template, and markings but no corresponding color look.
- Worker Gold layered and continuous-strip sites apply the same function through casts to `CanvasRenderingContext2D` (`services/filmWorker.ts:539-543`, `services/filmWorker.ts:887-890`). Worker `drawFlattenedReal135Frame` has no color call at all (`services/filmWorker.ts:422-452`). That function is reached for every non-Gold stock (`services/filmWorker.ts:513-515`), matching the lack of non-Gold main-thread color rather than creating a new non-Gold discrepancy.
- Classic single and strip draw source pixels and grain without `applyGold200Look` (`services/filmEngine.ts:1117-1120`, `services/filmEngine.ts:1325-1344`). A new film-emulsion effect therefore has no existing classic insertion call.

#### 1.2 Real-135 borders/assets are stock-specific but use shared geometry

- Every stock is registered in `REAL135_TEMPLATE_URLS` (`services/filmOverlay.ts:3-44`). The shared template is 1307x1203 with normalized aperture `x=92`, `y=211`, `w=1123`, `h=800` (`services/filmOverlay.ts:23-25`, `services/filmOverlay.ts:54-59`; `docs/project/rendering.md:37-48`).
- `createKodakGoldOverlayLayout` is the shared geometry for all registered flattened stocks, despite its Gold-specific name (`services/filmOverlay.ts:101-121`). `createFilmTemplateStripLayout` makes complete flattened frames touch with zero inter-frame gap (`services/filmOverlay.ts:157-191`). Gold's continuous strip is a different layout with a 6.5% aperture-width gap (`services/filmOverlay.ts:123-154`).
- `drawKodakGoldOverlayLayer` clips the four opaque template bands strictly outside the aperture (`services/filmOverlay.ts:194-220`). It is shared by both execution contexts. The border/template PNG must remain outside photo pixels; its stock-specific appearance is not a color grade.
- Gold single-frame rendering has a special base plus aperture-mask path (`services/filmEngine.ts:637-729`; `services/filmWorker.ts:517-566`). The other stocks use a flattened template (`services/filmEngine.ts:731-762`; `services/filmWorker.ts:422-452`). Gold continuous-strip rendering also uses programmatic base and markings (`services/filmEngine.ts:764-931`, `services/filmEngine.ts:1002-1052`; `services/filmWorker.ts:643-787`, `services/filmWorker.ts:862-908`). Other strips keep complete flattened frames (`services/filmEngine.ts:939-999`; `services/filmWorker.ts:789-843`).
- The sprocket-color override uses a separate stock-specific mask registry (`services/filmSprocket.ts:3-27`) and composites after the template/base but before dynamic frame numbers (`services/filmEngine.ts:721-728`, `services/filmEngine.ts:753-760`; `services/filmWorker.ts:559-566`, `services/filmWorker.ts:447-451`). It is an edge treatment, not an emulsion-color mechanism.
- Programmatic 135, used when templates are disabled or unavailable, has its own side-perforation geometry (`services/filmGeometry.ts:98-134`) and its own film base, gate shadow, grain, sprockets, markings, stock texture, and dust (`services/filmEngine.ts:467-521`). This is not the same aperture geometry as flattened templates.
- Classic uses source-relative border widths and preset typography (`services/filmEngine.ts:1083-1092`, `services/filmEngine.ts:1164-1247`), with a fixed 1600px-high classic strip (`services/filmEngine.ts:1267-1296`). This is separate from the physical/template 135 model.
- Grain is aperture-bounded and follows any current Gold color transform in real-135 paths (`services/filmTexture.ts:45-74` and call sites above). Its random source is unseeded; `docs/project/rendering.md:164-171` cautions against exact visual snapshots.

### 2. Main-thread/Worker duplication and shared helpers

#### 2.1 Execution and fallback boundaries

- `shouldUseWorkerForSettings` admits only real-135 with a registered template and templates enabled (`services/filmWorkerClient.ts:99-105`). Capabilities require Worker, OffscreenCanvas, `convertToBlob`, and `createImageBitmap` (`services/filmWorkerClient.ts:70-76`). Classic never enters the Worker through the client; unsupported browsers go directly to the full main engine.
- Worker requests carry full `FilmSettings`, optional transform/date, and the same `RenderBudgetLimits`; strip requests carry `ImageItem[]` (`services/filmWorkerClient.ts:11-25`, `services/filmWorkerClient.ts:199-203`). `FilmSettings` fields therefore reach the Worker without a second settings DTO, but protocol and propagation tests still need updating when behavior changes.
- The Worker decodes a `File` with `createImageBitmap` and closes it in `finally` (`services/filmWorker.ts:464-495`, `services/filmWorker.ts:808-839`). The main thread loads Blob/source URLs through `HTMLImageElement` (`services/canvasRuntime.ts:8-16`).
- Worker success is `{id, ok:true, blob}`; it does not return a URL (`services/filmWorker.ts:911-949`). The client creates `{url, byteSize}` from that Blob (`services/filmWorkerClient.ts:149-167`). Main-thread export directly returns the same shape (`services/canvasRuntime.ts:18-45`).
- Ordinary Worker errors fall back to main-thread rendering with identical settings/transform/budget (`services/filmWorkerClient.ts:255-290`, `services/filmWorkerClient.ts:293-310`). `WorkerCancelledError` is terminal and must not trigger fallback (`services/filmWorkerClient.ts:88-97`, `services/filmWorkerClient.ts:275-277`, `services/filmWorkerClient.ts:303-305`).

#### 2.2 Helpers already shared across both renderers

- `filmGeometry.ts:177-237` supports `CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D` and `HTMLImageElement | ImageBitmap`; placement is shared with `renderTransform`.
- `filmOverlay.ts:194-220`, `filmTexture.ts:4-74`, `filmFrameNumber.ts:65-118`, and `filmSprocket.ts:35-49` explicitly support both context types.
- Both engines import the same template geometry/registries, cover transform, resolution, grain, frame-number, sprocket, and budget helpers (`services/filmEngine.ts:11-58`; `services/filmWorker.ts:10-35`).
- `applyGold200Look` is algorithmically shared but its signature accepts only the DOM Canvas context (`services/filmColor.ts:1-7`), causing the Worker casts at `services/filmWorker.ts:542` and `services/filmWorker.ts:889`.

#### 2.3 Implementations still duplicated

| Area | Main thread | Worker | Existing difference |
|---|---|---|---|
| Classic frame | `services/filmEngine.ts:1058-1250` | `services/filmWorker.ts:329-420` | Worker typography/markings are simplified; client does not route classic here |
| Classic strip | `services/filmEngine.ts:1255-1433` | `services/filmWorker.ts:591-641` | Main is 1600px high with complete borders/text; Worker is 1200px high with no border text pass |
| Layered mask | `services/canvasRuntime.ts:92-124` | `services/filmWorker.ts:207-232` | Same luminance formula, separate canvas allocation implementation |
| Scanner and rotation | `services/filmEngine.ts:425-465`; `services/canvasRuntime.ts:47-90` | `services/filmWorker.ts:234-320` | Same broad composition, separate HTMLCanvas/OffscreenCanvas implementations |
| Asset loading/cache | `services/filmEngine.ts:81-132`, `services/filmEngine.ts:523-613` | `services/filmWorker.ts:124-205` | Main can retry layered -> flattened -> programmatic; Worker reports failure to client for main fallback |
| Continuous Gold base/markings | `services/filmEngine.ts:764-931` | `services/filmWorker.ts:643-787` | Main draws extra random base texture and inter-frame gap darkening absent in Worker |
| Classic grain | `services/filmEngine.ts:198-293` | shared `filmTexture.ts:9-74` | Main classic has a separate cached-noise implementation despite equivalent broad algorithm |
| Rounded rectangles/holes | `services/filmEngine.ts:60-79`, `services/filmEngine.ts:137-196` | `services/filmWorker.ts:75-122` | Separate primitives; Worker classic hole lacks main's second highlight stroke |

The routing and classic differences are intentional maintained behavior (`docs/project/rendering.md:173-184`, `docs/project/rendering.md:203-207`). They are not evidence that all Worker code is production-equivalent to main-thread code.

### 3. Where a new optical/color pipeline fits without breaking contracts

#### 3.1 Existing insertion boundary

The narrow existing boundary is **after cover/auto-rotation of source pixels into the aperture and before aperture grain and template/base/markings**. The Gold layered emulsion is the clearest isolated example (`services/filmEngine.ts:697-728`; `services/filmWorker.ts:539-566`). The flattened path already confines pixel color processing to the aperture before reapplying the four template bands (`services/filmEngine.ts:745-760`; `services/filmWorker.ts:437-451`).

This keeps these concerns downstream and independent:

- grain (`filmTexture.ts`);
- stock template/base and sprocket masks (`filmOverlay.ts`, `filmSprocket.ts`);
- dynamic frame numbers (`filmFrameNumber.ts`);
- scanner background and output rotation (`canvasRuntime.ts`, `filmWorker.ts`);
- output MIME/quality and Blob/Object-URL creation (`canvasRuntime.ts`, `filmWorkerClient.ts`).

For parity across single/strip and fallback, an enabled effect needs deliberate call sites in main programmatic 135, main layered, main flattened, main Gold continuous strip, Worker flattened, Worker layered, and Worker Gold continuous strip. If the chosen scope includes classic, classic single/strip need separately specified insertion behavior; they do not inherit the real-135 effect automatically.

#### 3.2 Contract-preservation requirements

- **Local only:** `.trellis/spec/frontend/quality-guidelines.md:19-24` forbids image upload, telemetry, and external processing. Same-origin static runtime assets fit `.trellis/spec/frontend/hook-guidelines.md:34-38`; a remote conversion service does not. Existing browser compatibility tests reject external requests and unexpected mutations (`tests/e2e/browser-compatibility.spec.ts:15-37`, `tests/e2e/browser-compatibility.spec.ts:116-121`).
- **Budget:** `renderBudget.ts:19-68` enforces a 32,767px maximum edge and configured per-canvas RGBA pixels. App preflight computes film/scanner sizes before Worker creation (`services/renderAdmission.ts:66-105`; `App.tsx:538-570`). Both engines must validate every dynamic output-sized intermediate before allocation (`.trellis/spec/frontend/quality-guidelines.md:689-707`). The existing guard is per canvas, not a GPU texture, framebuffer, WASM heap, or total-memory guarantee (`docs/project/rendering.md:135-147`).
- **Working set:** decoded source/work-set admission estimates two RGBA source copies and adds strip output (`services/batchAdmission.ts:12-25`, `services/batchAdmission.ts:218-230`, `services/batchAdmission.ts:240-272`). Additional large float/spectral buffers are not automatically represented by that estimate.
- **Cancellation:** stop increments the App generation before terminating/clearing the Worker (`App.tsx:729-739`; `services/filmWorkerClient.ts:204-212`, `services/filmWorkerClient.ts:225-232`). A replacement backend must remain behind that client boundary and preserve terminal `WorkerCancelledError`; a CPU retry after stop would violate the contract.
- **Stale results:** single and strip results are compared with the latest settings key before acceptance, and rejected result URLs are revoked (`App.tsx:593-600`, `App.tsx:636-670`, `App.tsx:807-841`). Stable IDs and generations, not captured indexes, control merging (`services/imageBatch.ts:38-64`).
- **Preview:** the controller debounces and revokes late/disposed preview URLs (`services/previewRenderController.ts:39-76`, `services/previewRenderController.ts:81-96`). It does not expose a general cancellation token for arbitrary GPU/WASM work.
- **Blob result:** preserve `{url, byteSize}` (`services/filmWorkerClient.ts:51`, `services/canvasRuntime.ts:18-21`). Do not add a Blob URL fetch to recover byte size (`.trellis/spec/frontend/quality-guidelines.md:137-151`). Empty main-thread strip currently returns `{url:'',byteSize:0}` (`services/filmEngine.ts:1260`).
- **Settings identity:** every output-affecting field must participate in `createRenderSettingsKey` (`services/renderResult.ts:12-38`), which feeds image and ordered-strip keys (`services/renderResult.ts:40-62`). Currentness also checks MIME (`services/renderResult.ts:64-72`). Otherwise an old artifact can remain incorrectly downloadable.
- **Artifact ownership:** App revokes replaced, rejected, deleted, and unmounted URLs (`App.tsx:140-144`, `App.tsx:252-264`, `App.tsx:433-475`, `App.tsx:598-670`). New GPU/WASM resources need their own owner and cleanup; they are not covered by Blob URL revocation.
- **Templates:** do not move color processing onto stock border pixels or replace the 1307x1203/aperture contract to create an optical effect (`.trellis/spec/frontend/quality-guidelines.md:181-189`).

### 4. Settings UI, persistence, and backward compatibility

- `FilmSettings` is the shared settings domain type; optional fields support compatibility (`types.ts:44-69`; `.trellis/spec/frontend/type-safety.md:35-47`). Defaults are created in `App.tsx:97-120` and loaded once through `loadPreferences` (`App.tsx:191-199`).
- Persistence uses the existing `filmFrame.preferences.v1` key (`services/settingsStorage.ts:4`). `normalizeSettingsPatch` is an explicit allowlist with enum sets, finite-number clamps, and six-digit color validation (`services/settingsStorage.ts:6-12`, `services/settingsStorage.ts:62-131`). Unknown fields are omitted when preferences are saved (`services/settingsStorage.ts:176-191`).
- `mergeSettings` overlays normalized saved fields on defaults/current settings and always retains the runtime `filmOverlayUrl` from defaults/current state (`services/settingsStorage.ts:133-139`). Missing fields in an older v1 object therefore retain defaults without a storage-version migration. Corrupt/unavailable storage falls back (`services/settingsStorage.ts:145-174`).
- Recipes use a separate `filmFrame.recipes.v1` key and the same normalizer (`services/recipeStorage.ts:4`, `services/recipeStorage.ts:53-67`, `services/recipeStorage.ts:101-124`). Applying a recipe merges its partial normalized fields over current settings (`App.tsx:1042-1047`). A new field must be allowlisted once here to round-trip through both preferences and recipes; older recipes lacking it preserve the current value.
- `filmOverlayUrl` and rendered artifacts/Blob URLs are not persistent preferences (`services/settingsStorage.ts:137`; `.trellis/spec/frontend/state-management.md:9-23`). Photos remain session-only.
- `RecipeInspector` is controlled and applies immutable patches (`components/settings/RecipeInspector.tsx:13-42`, `components/settings/RecipeInspector.tsx:107-109`). Stock/mode controls and classic-only controls are at `components/settings/RecipeInspector.tsx:197-252` and `components/settings/RecipeInspector.tsx:310-398`; output controls are at `components/settings/RecipeInspector.tsx:403-515`.
- Desktop and mobile share `inspectorProps` from `App.tsx:1363-1394`. `MobileSettingsSheet` renders the same `RecipeInspector` under film/output/recipe tabs (`components/settings/MobileSettingsSheet.tsx:20-24`, `components/settings/MobileSettingsSheet.tsx:90-100`, `components/settings/MobileSettingsSheet.tsx:138-171`). A single inspector control therefore covers both surfaces; no second mobile settings implementation is needed.
- `RecipeSummaryCard` derives its labels from the same settings (`components/settings/RecipeSummaryCard.tsx:12-33`). It has no separate persistence or renderer policy.
- The existing optional frame-number and sprocket settings demonstrate the full cross-layer precedent: types/defaults, inspector, normalizer/preferences/recipes, render key, Worker payload, both engines, and tests (`.trellis/spec/frontend/quality-guidelines.md:191-237`, `.trellis/spec/frontend/quality-guidelines.md:254-304`).

### 5. Recommendations: staged minimal implementation path and likely tests

These are recommendations, not current behavior. The PRD still leaves the meaning of “negative” unresolved (`.trellis/tasks/11-06-integrate-spektralab-negative/prd.md:20-26`, `prd.md:44-47`). The first stage below assumes ordinary digital photo -> film-like positive output. Scanned-negative inversion is a distinct input/process mode and should not be silently inferred from the existing `brandText` stock names.

#### Stage 0: lock the baseline and scope

1. Choose one existing registered stock (Gold 200 is the smallest because it already has a look) and define a small, owned test image set covering neutral gray, skin tones, saturated RGB, shadows, highlights, and black/white. Keep template selection and grain fixed for color comparisons.
2. Record current output dimensions, template pixels, and representative aperture pixels through both Worker and forced-main routes. Use tolerant/structural assertions because grain is random (`.trellis/spec/frontend/quality-guidelines.md:19-23`; `docs/project/rendering.md:164-171`).
3. Decide and document whether the MVP is positive film emulation, negative-scan inversion, or both before defining its settings union. Do not broaden to RAW, photographic paper, ICC, or all SpektraLab formats without separate approval (PRD lines 37-42).

#### Stage 1: CPU optical/color slice behind an explicit optional setting

1. Add a narrow optional setting and legacy-preserving default in `types.ts`/`App.tsx`, rather than silently changing `applyGold200Look` for all existing users. Keep the legacy algorithm available for the default/explicit legacy recipe.
2. Put the stock/profile policy and a small pixel-processing API in a focused service (extending `filmColor.ts` or a new focused service), accepting the DOM/Offscreen context union without the current Worker cast. A CPU ImageData API is reusable in both engines; pure curve/matrix/inversion functions should be independently testable without a browser Canvas.
3. Invoke it only in the aperture/emulsion positions identified in section 3. Start with one stock, single plus strip, and the existing border/template assets. An initial minimal scope can omit classic explicitly rather than accidentally giving it different semantics.
4. Extend `createRenderSettingsKey` with every field that changes pixels. Keep all existing key entries and stable array ordering; do not serialize the entire settings object.
5. Extend the existing settings allowlist, UI, and recipe round trips in the same change. Preserve the v1 storage keys and missing-field behavior. Validate/clamp stored inputs instead of spreading unknown profile records.
6. Measure preview/high CPU time and memory before considering GPU/WASM. Validate any new output-sized scratch canvas with the identical `RenderBudgetLimits` on both engines and include any new scratch allocation in admission sizing if it is user-visible at preflight.

#### Stage 2: verify all routes and only then expand profiles

1. Prove the same requested look on Worker single/strip and forced-main single/strip, with no color on template/rebate pixels and unchanged geometry. Test portrait auto-rotation and user quarter turns so the effect applies to source aperture pixels before output restoration.
2. Prove legacy/default recipes render through the old algorithm, while new settings invalidate old artifacts and are preserved across stock changes, preferences, and recipes as specified.
3. Add another profile only after its coefficients/data have an approved provenance/license and its own reference expectations. Avoid putting measured profile data or runtime-only asset URLs into persistent settings.

#### Stage 3: optional WebGL/WASM accelerator, not a renderer replacement

1. Introduce an internal backend behind the same color-stage API only if the CPU measurements justify it. Keep the exact Canvas composition, export facade, and CPU color path as fallback.
2. Gate each actual capability independently; do not infer WebGL/WASM availability from the existing Worker gate. A failed accelerator initialization/compile/upload/readback should select the equivalent CPU color stage without restarting the entire render where practical. An ordinary Worker failure still has the existing full-main fallback; cancellation must remain terminal.
3. Bound intermediate textures/buffers and release GPU contexts/textures/programs and WASM-owned memory on success, error, and disposal. Do not equate one Canvas RGBA budget with total spectral/GPU memory.
4. Compare accelerated and CPU outputs with tolerances appropriate to pixel precision and readback, on Chromium, Firefox, and WebKit before making acceleration automatic.

#### Likely test files

| Test Path | Existing coverage to extend |
|---|---|
| `tests/filmColor.test.ts` (new focused unit file) | Pure curve/matrix/profile behavior, clamps, alpha preservation, legacy-vs-new selection, context compatibility |
| `tests/settingsStorage.test.ts` | New-field normalization, invalid values, missing old v1 fields, preference round trip |
| `tests/recipeStorage.test.ts` | Recipe round trip, older partial recipe behavior, unsupported-field rejection |
| `tests/renderResult.test.ts` | New setting changes single and ordered-strip keys; irrelevant fields still do not |
| `tests/filmWorkerClient.test.ts` | Worker payload preservation, route policy, cancellation/late success and Blob metadata regressions |
| `tests/filmWorkerClientFallback.test.ts` | Identical new settings/budget/transform on main fallback; no Blob refetch |
| `tests/renderAdmission.test.ts`, `tests/renderBudget.test.ts` | Any new scratch/output dimensions and pre-allocation rejection |
| `tests/canvasRuntime.test.ts` | Only if shared Canvas export/mask/rotation behavior changes; otherwise leave unchanged |
| `tests/filmTexture.test.ts`, `tests/filmGeometry.test.ts`, `tests/filmOverlayTemplates.test.ts` | Regression guards proving grain, cover, aperture, and border geometry remain independent |
| `tests/previewRenderController.test.ts` | Only if preview lifecycle changes; late/disposed URL revocation is the required baseline |
| `tests/e2e/frontend-redesign.spec.ts` | Desktop/mobile controls, stock changes, representative aperture pixels, single/strip render success |
| `tests/e2e/film-overlay-assets.spec.ts` | Only for actual asset/mask changes; preserve aperture-zero coverage |
| `tests/e2e/worker-main-thread-fallback.spec.ts` | Forced Worker failure completes the new look through main Canvas |
| `tests/e2e/browser-compatibility.spec.ts` | Cross-engine single/strip/export flow and zero external/photo mutation requests |
| `tests/e2e/render-budget-admission.spec.ts` | If new allocations change admission; retain pre-Worker/pre-allocation blocking |
| New focused visual/browser spec | Fixed grain or zero grain for color comparisons, GPU/WASM-disabled fallback if added, and CPU/GPU parity |

Existing E2E stock coverage is `tests/e2e/frontend-redesign.spec.ts:481-624`; cancellation is at `tests/e2e/frontend-redesign.spec.ts:912-965`. Chromium/Firefox/WebKit projects are configured in `playwright.config.ts:16-30`.

### 6. WebGL/WASM coexistence with Canvas and fallback requirements

#### Observed current state

- No application source references WebGL, WebGL2, WebAssembly, or `.wasm`; current raster contexts are 2D (`services/canvasRuntime.ts:47-124`, `services/filmEngine.ts`, `services/filmWorker.ts`). The only WASM matches are optional Tailwind build-tool packages in `package-lock.json`, not an image pipeline.
- Runtime dependencies are React, ReactDOM, EXIF, and local HEIC conversion; there is no rendering SDK (`package.json:36-55`). The build is ordinary TypeScript/Vite (`vite.config.ts:1-12`).
- Main thread uses HTMLCanvas; Worker uses OffscreenCanvas and returns a Blob. Their composition helpers accept Canvas image sources, so a processed frame can conceptually be copied back into a 2D Canvas and continue through existing grain/template/export stages.
- A canvas should be treated as having one rendering-context backend: request a separate scratch canvas for WebGL rather than trying to obtain `webgl` and `2d` contexts from an already initialized 2D canvas. Preserve the existing 2D destination canvases.

#### Assessment (recommendation/inference, not a measured compatibility result)

- **Coexistence is architecturally feasible:** use a separate WebGL/WASM processing surface only inside the color/emulsion stage, then draw/read its result into the existing 2D emulsion/aperture before grain and template composition. Neither the Worker protocol nor App/Preview/ZIP interfaces need to change if the same `{url,byteSize}` result is returned.
- **Current capability detection is insufficient:** `filmWorkerClient.ts:70-76` proves OffscreenCanvas 2D/blob/bitmap APIs, not WebGL, WebGL2, required texture formats, shader precision, context-loss behavior, or WASM compilation/instantiation. Acceleration must have a nested capability/failure gate.
- **CPU fallback is required:** current unsupported-browser and Worker-error contracts require the main Canvas engine (`services/filmWorkerClient.ts:255-310`; `.trellis/spec/frontend/quality-guidelines.md:334-350`). An accelerated-only effect would break those browsers or silently change the requested output during fallback. The CPU path must implement the same enabled look, not merely the legacy look.
- **Resource and numerical contracts remain open:** existing budgets do not limit GPU/WASM totals, and no current tests establish float precision, color-space conversion, readback parity, context-loss recovery, or mobile viability. WebGL/WASM support and performance must be measured, especially in WebKit and on physical mobile devices; `playwright.config.ts:16-30` alone is not a support guarantee.
- **Assets stay local:** shaders/WASM/profile data can be bundled or same-origin static assets within the existing Vite/local-only boundary. Intermediate/generated source assets do not belong in `public/` (`.trellis/spec/frontend/directory-structure.md:40-41`). No external processing or runtime CDN should be introduced (`.trellis/spec/frontend/quality-guidelines.md:748-755`).

### Explicitly NOT to rewrite for the minimal integration

- Do not replace `App.tsx` session state, render commands, generations, latest-ref merges, or Object-URL ownership with a new state framework (`App.tsx:191-264`, `App.tsx:503-739`; `.trellis/spec/frontend/state-management.md`).
- Do not rewrite `filmWorkerClient` request/response, timeout, cancellation, or main-thread fallback contracts; keep a new color backend below that facade (`services/filmWorkerClient.ts:68-213`, `services/filmWorkerClient.ts:255-311`).
- Do not route classic rendering to the existing Worker classic functions to gain parity; their geometry and markings intentionally differ and are documented as not production-ready (`docs/project/rendering.md:173-184`, `docs/project/rendering.md:203-207`).
- Do not replace `filmGeometry`, `filmOverlay`, template PNGs, sprocket masks, or Gold continuous-strip geometry as part of a color-only improvement. Their shared aperture and border invariants are independently tested.
- Do not regenerate all 16 flattened templates or alter the 1307x1203 / 92,211,1123,800 aperture to simulate color/negative effects.
- Do not rewrite grain, frame numbers, scanner background, crop placement, resolution policy, JPEG/PNG export, ZIP/download/share, or preview controllers unless their own requirements change.
- Do not broaden this into a shared RenderPlan/classic-renderer consolidation as a prerequisite. The maintained documentation identifies that as a longer-term direction, not a requirement for an aperture color slice (`docs/project/rendering.md:203-207`).
- Do not change `filmFrame.preferences.v1` or `filmFrame.recipes.v1`, persist files/Blob URLs/profile runtime objects, or bypass `normalizeSettingsPatch`.
- Do not port the SpektraLab macOS/SwiftUI application, replace FilmFrame's UI, add a hosted conversion service, or copy code/profiles/artwork before a license decision (`.trellis/tasks/11-06-integrate-spektralab-negative/prd.md:37-42`).

### Related Specs

- `.trellis/spec/frontend/directory-structure.md:7-40` - App/service/component ownership and test placement.
- `.trellis/spec/frontend/component-guidelines.md:7-11` - controlled settings components and App command ownership.
- `.trellis/spec/frontend/hook-guidelines.md:28-45` - pure service calculations, local asset fetching, and async cleanup.
- `.trellis/spec/frontend/state-management.md:9-23` - local session state, normalized preferences, stale keys, and URL ownership.
- `.trellis/spec/frontend/type-safety.md:17-22`, `:35-47` - storage validation and optional backward-compatible fields.
- `.trellis/spec/frontend/quality-guidelines.md:17-24` - required unit/browser checks and local-only privacy.
- `.trellis/spec/frontend/quality-guidelines.md:115-179` - Blob/Object URL result contract.
- `.trellis/spec/frontend/quality-guidelines.md:181-189` - template/aperture asset contract.
- `.trellis/spec/frontend/quality-guidelines.md:320-377` - Worker routing, cancellation, and fallback contract.
- `.trellis/spec/frontend/quality-guidelines.md:640-739` - runtime Canvas budget propagation and allocation checks.
- `.trellis/spec/frontend/quality-guidelines.md:748-765` - forbidden patterns and review checklist.
- `docs/project/rendering.md` - route, geometry, color, texture, fallback, and export documentation.

## Caveats / Not Found

- No FilmFrame WebGL/WASM renderer, spectral processing, linear-light/ICC pipeline, negative-scan input mode, seeded grain source, or color-pipeline unit test was found.
- No external WebGL/WASM documentation or cross-browser benchmark was consulted for this internal-boundaries report. Coexistence is an architectural assessment; exact browser/device support and numerical/performance parity remain unverified.
- The PRD does not yet resolve whether “negative” means positive film emulation, scanned-negative inversion, borders, or a combination. The staged MVP recommendation is conditional on ordinary-photo positive film emulation; scanned-negative inversion needs a separate explicit setting and reference cases.
- This research does not determine whether SpektraLab algorithms, profiles, or artwork may be copied. The PRD records GPL-3.0-or-later and CC BY-SA 4.0 considerations; provenance/licensing remains a separate prerequisite.
- Worker and main-thread continuous Gold output already differ in base texture/inter-frame treatment, and Worker flattened Gold (if directly invoked) omits the main flattened Gold color call. The current client selects Gold's layered Worker path, so the latter is not the normal route. Do not claim byte-for-byte Worker/main parity as an existing guarantee.
- `docs/project/rendering.md` was last verified 2026-08-05; code citations in this report are the authoritative current-state evidence for the requested boundaries.
- No product code, spec, configuration, or Git state was modified; only this research markdown was written.
