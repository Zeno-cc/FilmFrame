# Research: frontend runtime performance observations

- Query: Identify clear avoidable frontend performance problems without speculative optimization or deep imaging review.
- Scope: internal
- Date: 2026-11-14

## Findings

### F-03 Low (measured structural overhead, not a timed performance regression) — App recomputes every render key four times per image per render

**Status:** confirmed duplicated pure computation. Runtime slowdown is not measured; do not describe this as a demonstrated frame-rate issue.

**Evidence and trigger**

`App.tsx` computes artifact/status signatures for the same `(image,index,settings)` independently in each of these places:

| File | Work |
|---|---|
| `App.tsx:161-190` | `getCurrentImageArtifact` calls `settingsForImage` and `createImageRenderKey`. |
| `App.tsx:1195-1200` | Builds `currentImageArtifacts` once per image. |
| `App.tsx:1212` | `getSingleExportReadiness` maps all images through `getCurrentImageArtifact` again. |
| `App.tsx:1213-1226` | Builds workflow statuses and calls the same two key helpers again. |
| `App.tsx:543-549` | Starting a batch derives the expected key a further time for each candidate. |
| `services/renderResult.ts:12-47,62-74` | Each key stringifies a 30+-field settings array and the transform/date envelope. |

Any state update, including crop draft completion, status changes, toasts and opening a dialog, renders App and repeats these calculations for all images. The first three App sites alone produce three image keys per image per render. This is avoidable computation in a session with many images, not a claim that small rolls are visibly slow.

**Minimal fix/test, only if the parent chooses to address it**

Within a single App render, derive `{imageSettings, settingsKey, artifact, status}` once per image and reuse those values for artifact maps, export readiness and statuses. A batch invocation can derive its own current snapshot separately. Avoid introducing a store or refactor of the workflow.

A focused pure test should compare the shared derived values against the current key/artifact/status contracts under order, transform, MIME and per-frame-seed changes. A performance improvement requires before/after profiling; no such timing evidence exists here.

### F-04 Review choice (bundle/dependency observation, unmeasured user impact) — lightweight picker metadata imports full spectral implementation modules

**Status:** confirmed import boundary; not classified as a confirmed defect. No bundle-size or startup timing measurement was run.

**Evidence**

- `components/settings/FilmStockPicker.tsx:3-6` needs only the stock capability helpers and `isCineStillFilm`/`isMonochromeFilm`/`positiveProfileForFilm` for display text.
- Those helpers are exported from implementation-heavy modules:
  - `services/spectral/cineStill.ts:2-6,17-19`
  - `services/spectral/monochrome.ts:1-19,21-23`
  - `services/spectral/positive.ts:1-8,93` (function declaration line)
- The modules also pull in spectral processing logic. `cineStill.ts` imports `resources/cineStillModel.json`, although that JSON is only 1,507 bytes. The large stock `*-setup.json` files are dynamically imported elsewhere and were not shown to be eagerly imported by the picker; do not claim that all spectral data is downloaded at startup.
- This conflicts in direction with `.trellis/spec/frontend/component-guidelines.md:64-70`, which says picker metadata should use the lightweight registry.

**Consequence and minimal fix/test**

The picker unnecessarily couples display-only capability checks to renderer module evaluation and makes bundle splitting harder. Move or re-export only the three tiny predicates from the existing lightweight stock registry, leaving render resources behind their current dynamic boundaries. Verify no extra `*-setup` chunk is requested merely by opening the picker, and preserve current selection/shortcut tests.

### PhotoCard duplicate latent image — review observation only

`components/workspace/PhotoCard.tsx:175-203` normally keeps a hidden latent `<img>` and a visible print/preview `<img>` for the same source URL. At `styles/components.css:1108-1115` the latent layer is `display:none` while idle and otherwise hidden by opacity. Browser URL caching may avoid duplicate network traffic, but the duplicate decoded-image/DOM cost was not measured. This is not reported as a confirmed performance bug.

## Caveats / Not Found

- No production build, bundle report, CPU profile, memory profile or real-browser rendering benchmark was run.
- No deep imaging or GPU performance conclusion is included.
