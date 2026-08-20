# Research: Automated main-thread Canvas renderer fallback coverage

- Query: What minimal unit and browser automation proves that an eligible real-135 Worker render can fail after routing and still complete through the main-thread HTML Canvas renderer?
- Scope: internal
- Date: 2026-08-20

## Findings

### Files found

- `services/filmWorkerClient.ts:70-86` — runtime Worker capability detection and default Worker construction.
- `services/filmWorkerClient.ts:99-118` — real-135 template routing and constructor-failure behavior.
- `services/filmWorkerClient.ts:133-213` — pending request, timeout, Worker error, deserialization, and disposal behavior.
- `services/filmWorkerClient.ts:216-253` — cached renderer lifecycle and File-to-preview/object-URL main-thread source adaptation.
- `services/filmWorkerClient.ts:255-311` — public single-image and strip fallback branches.
- `services/filmWorker.ts:911-949` — a real Worker render exception is converted to an `{ ok: false, error }` response.
- `services/filmEngine.ts:467-520`, `services/filmEngine.ts:523-613`, `services/filmEngine.ts:1058-1081`, `services/filmEngine.ts:1255-1265` — actual main-thread HTML Canvas single/strip paths and their template-to-programmatic fallback.
- `App.tsx:577-628` — the user workflow calls the client with real `File` objects, preview URLs, transforms, and render budgets.
- `App.tsx:723-732`, `App.tsx:248-260` — explicit cancellation and unmount disposal.
- `tests/filmWorkerClient.test.ts:14-72`, `tests/filmWorkerClient.test.ts:78-150`, `tests/filmWorkerClient.test.ts:152-240` — injectable fake Worker seam and low-level Worker lifecycle/payload coverage.
- `tests/filmWorkerClientFallback.test.ts:14-94` — current main-thread metadata tests, which do not enter an eligible Worker route.
- `vite.config.ts:6-11` — Vitest discovers unit tests under `tests/` and excludes E2E; no DOM test environment is configured.
- `playwright.config.ts:3-37` — Chromium runs the complete E2E suite; Firefox/WebKit only run `browser-compatibility.spec.ts`.
- `tests/e2e/browser-compatibility.spec.ts:20-122` — existing upload/develop/preview/strip browser workflow and reusable image fixtures.
- `tests/e2e/render-budget-admission.spec.ts:29-112` — established `page.addInitScript` pattern for instrumenting HTML Canvas, OffscreenCanvas, and Worker before application code loads.
- `scripts/test-invite-proxy.mjs:91-160` — separate protected-browser test that requires the normal real Worker to start.
- `.trellis/spec/frontend/quality-guidelines.md:17-24`, `.trellis/spec/frontend/quality-guidelines.md:56-75` — focused service tests, real-browser Canvas verification, metadata preservation, and fallback routing requirements.
- `.trellis/spec/frontend/type-safety.md:7-22`, `.trellis/spec/frontend/type-safety.md:35-47` — service-local dependency injection, strict typing, and pre-allocation Canvas budget patterns.

### Existing behavior

The fallback is already implemented; this task should not need renderer product changes.

1. Worker routing requires all three browser capabilities (`Worker`, `OffscreenCanvas.prototype.convertToBlob`, and `createImageBitmap`) at `services/filmWorkerClient.ts:70-76`. It also requires real-135 mode, a registered template, and enabled overlay templates at `services/filmWorkerClient.ts:99-104`.
2. A missing capability or a throwing Worker constructor returns `null` (`services/filmWorkerClient.ts:107-118`), after which the public method proceeds directly to main-thread rendering.
3. A started Worker can reject because it posts `{ ok: false }` (`services/filmWorkerClient.ts:149-157`, produced by `services/filmWorker.ts:911-949`), times out (`services/filmWorkerClient.ts:177-196`), raises `onerror` (`services/filmWorkerClient.ts:169-171`), or raises `onmessageerror` (`services/filmWorkerClient.ts:173-175`).
4. Public `processImage` catches every non-cancellation Worker rejection and delegates to `mainThreadEngine.processImage` with the preview/object URL, date, transform, and budget (`services/filmWorkerClient.ts:255-290`). `generateFilmStrip` independently delegates to `mainThreadEngine.generateFilmStrip` (`services/filmWorkerClient.ts:293-311`).
5. `WorkerCancelledError` is intentionally rethrown, not converted into new work (`services/filmWorkerClient.ts:275-278`, `services/filmWorkerClient.ts:303-306`). The stop button and unmount already use cancellation/disposal (`App.tsx:723-732`, `App.tsx:248-260`).

### Coverage gap

`tests/filmWorkerClientFallback.test.ts` sounds like the target suite but currently bypasses Worker routing twice:

- its settings use `frameRenderMode: 'classic'` and `useFilmOverlayTemplate: false` (`tests/filmWorkerClientFallback.test.ts:29-35`), which fails `shouldUseWorkerForSettings`;
- its single-image calls pass a string source (`tests/filmWorkerClientFallback.test.ts:53-84`), while Worker routing requires an actual `File` (`services/filmWorkerClient.ts:263-264`).

Those tests prove metadata/no-refetch and budget forwarding only (`tests/filmWorkerClientFallback.test.ts:53-94`). The low-level Worker tests prove rejection/cleanup behavior (`tests/filmWorkerClient.test.ts:78-150`) but never call the public functions that contain the fallback catches. There is therefore no automated proof that a Worker was eligible, accepted a task, failed it, and returned a usable result through the main-thread engine.

The render-budget E2E hook can make a Worker constructor throw (`tests/e2e/render-budget-admission.spec.ts:98-110`), but its tested request is rejected by admission before any Worker or Canvas allocation (`tests/e2e/render-budget-admission.spec.ts:135-157`). It is not fallback coverage.

### Minimal implementation boundary

Use two focused test edits and no production seam:

1. Extend `tests/filmWorkerClientFallback.test.ts` with public-routing tests for both single and strip.
2. Add a Chromium-only file such as `tests/e2e/worker-main-thread-fallback.spec.ts` that proves the real browser completes through HTML Canvas after a forced Worker task failure. Because only `browser-compatibility.spec.ts` is matched by Firefox/WebKit (`playwright.config.ts:21-30`), a new filename automatically stays in Chromium without configuration changes.

Do not add a feature flag, application query parameter, exported test-only setter, or renderer wrapper. The default dependency functions consult browser globals when the renderer is created (`services/filmWorkerClient.ts:70-85`), so Vitest globals and Playwright init scripts are sufficient.

### Unit-test strategy

In `tests/filmWorkerClientFallback.test.ts`:

1. Reuse real-135 eligible settings from `tests/filmWorkerClient.test.ts:34-58` or change the local settings to a registered stock, `frameRenderMode: 'real135'`, and `useFilmOverlayTemplate: true`.
2. Stub `Worker`, `OffscreenCanvas` with a prototype `convertToBlob` method, and `createImageBitmap`. This makes the exact capability predicate at `services/filmWorkerClient.ts:70-76` true.
3. Pass a real `File`, not a type assertion or source string. Node 22 is the trusted test runtime (`.github/workflows/release.yml:30-37`) and supplies `File`. For the single-image case, also pass a preview URL because that matches the application call at `App.tsx:621-627`.
4. Have the fake Worker's `postMessage` deliver `{ id: message.id, ok: false, error: 'forced worker render failure' }` through `onmessage`. This models the actual render-exception protocol at `services/filmWorker.ts:943-948` and is stronger than testing only a constructor failure.
5. Assert the Worker was constructed and received a `processImage` message, then assert the mocked main-thread engine received exactly the preview URL, settings, date, transform, and budget and that its result is returned unchanged.
6. Add the equivalent `generateFilmStrip` assertion because it has a separate fallback catch at `services/filmWorkerClient.ts:293-311`; assert the same `ImageItem[]`, settings, and budget reach the engine.
7. Import and call `disposeFilmWorkerClient` during cleanup before globals are restored. The production client caches the renderer globally (`services/filmWorkerClient.ts:216-223`) and only resets that cache through disposal (`services/filmWorkerClient.ts:225-228`); without cleanup, test order can conceal or create failures. Also restore the warning spy and globals.

These tests should force an `{ ok: false }` response rather than `WorkerCancelledError`. Cancellation is a user action that deliberately stops future work and must remain observable to `App.tsx`, not silently restart on the main thread.

### Browser-test strategy

Add one focused Chromium Playwright test using the existing hook pattern from `tests/e2e/render-budget-admission.spec.ts:29-112` and workflow from `tests/e2e/browser-compatibility.spec.ts:20-66`:

1. Route `/api/runtime-config` and `/auth/refresh` locally as the existing E2E tests do (`tests/e2e/browser-compatibility.spec.ts:38-47`).
2. Before `page.goto`, install a typed probe on `window`, wrap `HTMLCanvasElement.prototype.toBlob` to count main-thread exports, and replace `window.Worker` with the smallest client-compatible fake: `onmessage`, `onerror`, `onmessageerror`, `postMessage`, and `terminate`.
3. On `postMessage`, increment a request counter and asynchronously call `onmessage` with the matching `{ ok: false, error }` response. The asynchronous delivery more closely matches a real Worker and ensures the pending map is populated. Leave native `OffscreenCanvas` and `createImageBitmap` intact so eligibility remains real.
4. Select `KODAK PORTRA 160`, confirm the `真实 135` control is pressed, and upload `public/film-overlays/aperture-mask-derived.png`, following `tests/e2e/browser-compatibility.spec.ts:4-7`, `tests/e2e/browser-compatibility.spec.ts:54-66`.
5. Click develop and assert all of the following:

   - the fake Worker was constructed and received a `processImage` request;
   - it delivered the forced failure;
   - at least one native HTML Canvas `toBlob` call occurred;
   - one `已出片` image appears with no processing-error dialog.

Because the fake Worker never returns a Blob, a developed result plus an HTML Canvas export is direct integration evidence that the catch at `services/filmWorkerClient.ts:275-290` reached the real main-thread renderer. It also exercises the same actual `File`/preview path used by `App.tsx:621-627`.

One Chromium single-image browser case is the minimal integration proof. The strip's separate catch should be covered in Vitest. If the reviewed acceptance criteria require both user-visible paths in a browser, extend the same test to upload the second existing fixture (`tests/e2e/browser-compatibility.spec.ts:8-13`) and generate the strip (`tests/e2e/browser-compatibility.spec.ts:106-114`) rather than adding another cross-browser file.

### Proposed checks: concrete failures and changed next action

| Check | Concrete failure detected | What changes when it fails |
| --- | --- | --- |
| Eligible single-image Vitest fallback | A test accidentally bypasses Worker routing; a Worker `{ ok: false }` escapes; the preview URL/date/transform/budget is lost; or the main-thread result is not returned. | If no Worker request was recorded, fix the test's capability/settings/File setup. If a request and failure were recorded, fix `processImage` fallback behavior rather than weakening assertions. |
| Eligible strip Vitest fallback | The independent strip catch is removed, images/settings/budget are changed, or a Worker task failure escapes. | Fix `generateFilmStrip` delegation. Do not assume the single-image catch covers this branch. |
| Chromium forced-failure workflow | The production bundle does not route an eligible real-135 file to Worker, does not recover after the Worker reports a render error, or cannot export through real HTML Canvas. | Use the probe to separate setup failure (`workerRequests === 0`) from fallback/product failure (failure delivered but no Canvas export/result). Inspect the retained Playwright trace/screenshot before changing code. |
| Existing normal browser workflow | A fallback-specific hook leaked globally and stopped the normal Worker path, browser compatibility, preview, or strip flow. | Scope the fake Worker to the new test file/page. Preserve `scripts/test-invite-proxy.mjs:102-128`, which intentionally asserts that normal protected rendering starts a real Worker. |
| Cancellation tests | Cancellation begins fallback work after the user stopped processing. | Preserve the rethrow at `services/filmWorkerClient.ts:275-278` and `services/filmWorkerClient.ts:303-306`; a cancellation must not be treated as a render failure. |

### Verification commands

```bash
npx vitest run tests/filmWorkerClient.test.ts tests/filmWorkerClientFallback.test.ts
npx playwright test tests/e2e/worker-main-thread-fallback.spec.ts --project=chromium
npm run check
npm run test:e2e
npm run check:release
git diff --check
```

The focused Vitest command distinguishes routing/delegation faults quickly. The focused Chromium command proves actual browser Canvas integration. The full commands then protect normal Worker behavior, all browser engines configured by `playwright.config.ts:16-30`, and release-gate integration.

### Rollback points

1. After the unit tests: if the public API cannot be driven through the existing global/dependency seam, stop and research the cache/test lifecycle before adding a production test hook. A new product seam is not part of the minimal boundary.
2. After the browser init script: if the fake Worker does not satisfy only the interface consumed at `services/filmWorkerClient.ts:27-33`, revert the E2E hook and correct the test double. Do not change Worker capability detection to accommodate the test.
3. If the probe records a Worker request and forced failure but no HTML Canvas export/result, the automated test has exposed a product defect; return to implementation and fix the existing fallback. If the probe records no Worker request, roll back/fix the test setup first.
4. If the focused test is stable but the full proxy test fails its real-Worker assertion (`scripts/test-invite-proxy.mjs:102-128`), remove leaked global setup or test-file coupling. Do not relax the proxy assertion.
5. If requirements demand physical-device behavior, return to planning: the parent task explicitly excludes physical-device testing (`.trellis/tasks/08-20-complete-release-pipeline-heic-import/prd.md:3-6`), and it cannot be inferred from desktop browser automation.

### External references and versions

No external documentation was needed. The repository pins Playwright `1.61.1` (`package-lock.json:769-783`, `package-lock.json:2425-2455`) and Vitest `2.1.9` (`package-lock.json:2831-2844`); the proposed hooks use APIs already exercised by this repository. No browser or test-library upgrade is required.

### Related specs

- `.trellis/spec/frontend/quality-guidelines.md:17-24` — focused service tests and real-browser Canvas verification.
- `.trellis/spec/frontend/quality-guidelines.md:48-75` — main-thread and Worker result metadata, fallback routing, and browser workflow requirements.
- `.trellis/spec/frontend/type-safety.md:7-22` — strict browser/service types and pre-allocation Canvas budgets.
- `.trellis/spec/frontend/type-safety.md:35-47` — dependency objects are the established lifecycle test seam; avoid broad assertions and `any`.
- `.trellis/spec/frontend/index.md:36-40` — full frontend completion commands and resource/stale-result checks.

## Caveats / Not Found

- Unit tests that mock `filmEngine` prove delegation but not Canvas rendering; the focused Playwright case is needed for that distinction.
- The fake browser Worker models the documented client message contract, not the implementation inside `filmWorker.ts`. Existing normal Worker tests and browser workflows must remain green to cover the success path.
- An `{ ok: false }` task response does not terminate the Worker; it rejects only that pending task (`services/filmWorkerClient.ts:149-157`). Termination assertions belong to `onerror`, `onmessageerror`, timeout, or explicit disposal tests (`services/filmWorkerClient.ts:139-147`, `services/filmWorkerClient.ts:169-175`, `services/filmWorkerClient.ts:183-186`, `services/filmWorkerClient.ts:204-212`).
- Browser capability absence and Worker-constructor failure already lead directly to main-thread rendering, but neither proves recovery after a started/eligible task fails. The proposed `{ ok: false }` path covers the missing behavior most directly.
- Physical-device testing is out of scope. The proposed browser coverage is desktop Chromium automation only; Firefox/WebKit continue to cover the normal local workflow through `browser-compatibility.spec.ts`.
