# Research: frontend coverage, privacy, signatures and baseline

- Query: Read-only exhaustive frontend audit coverage; establish what was verified and what remains unread.
- Scope: internal
- Date: 2026-11-14

## Baseline and constraints

- The coordinator named `.trellis/tasks/11-14-project-quality-audit`; `task.py current --source` returned no current task. Research is persisted only under that named task.
- Read `prd.md`, `design.md`, `implement.md`, `task.json`, all non-spectral frontend specs, `package.json`, `vite.config.ts`, `tsconfig.json`, `index.tsx`, `index.html` and maintained workflow docs.
- Existing dirty worktree was treated as the audit input. No source/test/spec files were edited; no Git mutation or destructive command was run. No Playwright or Docker was run.
- `npm test`: **37 test files / 322 tests passed** (2026-11-14).
- `npm run typecheck`: **passed**.
- Full build, spectral stock validator and browser suites were not run in this partition. Existing tests are not proof that the findings below are absent; no tests were added during read-only research.

## Reviewed files

### Read fully or through the relevant complete workflow

- `App.tsx`, `types.ts`, `index.tsx`, `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`.
- All interactive components: `CropEditor.tsx`; `app/AppHeader.tsx`, `AppShell.tsx`, `MoreMenu.tsx`, `SessionMeter.tsx`; `feedback/CreditsDialog.tsx`, `DeleteAllPhotosDialog.tsx`, `ErrorDialog.tsx`, `FeedbackLayer.tsx`, `IncompleteExportDialog.tsx`, `NoticeToast.tsx`, `SupportDialog.tsx`; `mobile/MobileActionBar.tsx`; `preview/PreviewDialog.tsx`; `settings/FilmStockPicker.tsx`, `MobileSettingsSheet.tsx`, `RecipeInspector.tsx`, `RecipeSummaryCard.tsx`; all `ui/*.tsx`; all `workspace/*.tsx`.
- Icon modules and component barrels were inspected for rendering/reachability, not visual design.
- Browser workflow/services read fully: `batchAdmission.ts`, `batchCuration.ts`, `canvasRuntime.ts`, `compatibility135.ts`, `exportReadiness.ts`, `filmFrameNumber.ts`, `filmGeometry.ts`, `filmOverlay.ts`, `filmResolution.ts`, `filmWorkerClient.ts`, `heicConversion.ts`, `imageBatch.ts`, `photographyQuotes.ts`, `previewDownload.ts`, `previewNavigation.ts`, `previewRenderController.ts`, `recipeStorage.ts`, `renderAdmission.ts`, `renderBudget.ts`, `renderResult.ts`, `renderTransform.ts`, `runtimeConfig.ts`, `settingsStorage.ts`, `shareArtifact.ts`, `uploadFiles.ts`, `workflowState.ts`, `zip.ts`.
- Rendering entry points and ordinary resource ownership were inspected in `filmEngine.ts` and `filmWorker.ts`; their numerical/spectral/physical internals were excluded.
- Relevant focused tests and existing browser coverage were read, including upload, render key/controller/Worker fallback tests and the relevant portions of `tests/e2e/frontend-redesign.spec.ts`.
- CSS focus/layout/motion paths relevant to the reviewed components were inspected in `styles.css`, `styles/base.css` and `styles/components.css`.

### Explicitly not exhaustively read

- `services/filmColor.ts`, `filmMarkings.ts`, `filmSprocket.ts`, `filmTexture.ts`, all spectral/physical deep internals, and every branch of the duplicated `filmWorker.ts` renderer. Grep-based cross-checks of setting consumption/network/resource sites are not a claim of full review of these files.
- Backend/operations, dependency security/license clearance, public assets, and all other audit partitions.
- Physical-device accessibility, real-browser visual rendering and performance timing.

## Render signature and workflow conclusions — no additional defect confirmed

- Every current `FilmSettings` field is either represented in `createRenderSettingsKey` or explicitly unused by the renderer: `autoCropToFilmRatio` is the only omitted field and has no current render consumer. Defaults for optional fields are normalized consistently in the key (`services/renderResult.ts:12-47`).
- Per-image key includes full-roll frame number via `settingsForImage`, EXIF override, normalized transform and per-image physical seed (`App.tsx:161-181`, `services/renderAdmission.ts:39-49`, `services/renderResult.ts:62-74`).
- Strip key includes settings, ordered IDs, original roll indexes, transforms and per-frame seeds. Selection helpers preserve original full-roll positions (`services/batchCuration.ts:18-24`).
- All App calls to `processImage(fileOrSource, settings, dateOverride, previewUrlFallback, transform, renderBudgetLimits)` and `generateFilmStrip(images, settings, renderBudgetLimits)` have the correct argument roles. Main-thread/Worker fallback forwards the same settings, transform and budget (`services/filmWorkerClient.ts:256-313`; `tests/filmWorkerClientFallback.test.ts`).
- Upload MIME/extension handling, local HEIC conversion, converted-file routing, dimension rejection and URL revocation agree with the frontend contract. EXIF uses the original input as required (`services/uploadFiles.ts`, `services/heicConversion.ts`).
- ZIP readiness excludes stale artifacts, retains original roll indexes for names, distinguishes explicit partial export, and re-evaluates after finish-then-export (`services/exportReadiness.ts`, `App.tsx:914-1010`). Existing UI gates exclude simultaneous render/export mutation in normal operation; no confirmed export race is reported.

## Actual browser-local privacy — static conclusion

- Runtime photo inputs are `File`/Blob URLs. `prepareUploadedImages` does not upload files. HEIC uses the locally bundled dynamic `heic-to/csp` import. `exif-js` receives a `File`, selecting its local `FileReader` path (`node_modules/exif-js/exif.js:410-418`), not its URL XHR branches.
- App has explicit network calls for same-origin `/api/runtime-config`, `/auth/refresh`, generated artifact Blob URLs during ZIP/share, and film template images loaded by renderer/Worker. No `fetch`, XHR, beacon, WebSocket or EventSource carrying original/converted photo bytes to an HTTP service was found in the reviewed runtime paths.
- External navigation is user-triggered for GitHub/source/credit links. Photography quotes come from a reviewed local JSON snapshot; no automatic Wikiquote request exists in the component.
- Only normalized settings and recipes are persisted in `localStorage`; images, Blob URLs and render artifacts are not persisted (`services/settingsStorage.ts`, `recipeStorage.ts`).
- This is a static privacy check, not a newly run network trace. Existing `tests/e2e/browser-compatibility.spec.ts` and `heic-import.spec.ts` contain request monitoring, but they were not executed in this audit. Third-party implementation internals and all lazy-loaded module network behavior are not exhaustively guaranteed by this partition.

## Dead/unreachable code observations

- `components/ui/Sheet.tsx`, `SegmentedControl.tsx`, `RangeField.tsx`, `Disclosure.tsx`, `ui/NoticeToast.tsx` and `components/feedback/FeedbackLayer.tsx` are exported through barrels but have no production consumer outside their own module/barrel. App instead uses `MobileSettingsSheet` and `feedback/NoticeToast` directly.
- `services/workflowState.ts:81-92` (`selectImagesForProcessing`) and `services/renderResult.ts:76-85` (`isRenderArtifactCurrent`) have no production caller in the searched tree; App duplicates the corresponding derivation locally. `App.tsx` includes an unused `autoCropToFilmRatio` setting with no UI or renderer consumer.
- These are reachability observations, not instructions to delete. Barrels may be intentional public/test APIs; confirm ownership and external consumers before cleanup. Do not combine this with a broad refactor.

## Related specifications

- `.trellis/spec/frontend/state-management.md` — async generation, stable-ID merging and Object URL ownership.
- `.trellis/spec/frontend/quality-guidelines.md` — local-only privacy, render signatures, focus traps and required verification.
- `.trellis/spec/frontend/component-guidelines.md` — controlled components, dialog shortcuts and lightweight picker registry.
- `.trellis/spec/frontend/hook-guidelines.md` — latest refs, effects and cleanup.
- `.trellis/spec/frontend/type-safety.md` — browser/storage validation and shared render types.

## Caveats

The findings are limited to F-01, F-02, and the explicitly lower-confidence performance observations F-03/F-04. Passing tests and absence of another reported defect do not establish exhaustive correctness for the unread rendering internals or unexecuted browser/device workflows.
