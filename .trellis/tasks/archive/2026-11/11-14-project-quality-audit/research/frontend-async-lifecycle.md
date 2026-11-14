# Research: frontend async lifecycle and artifact ownership

- Query: Read-only audit of App/browser workflow races, stale generations, upload/reset behavior, Object URL ownership and export concurrency.
- Scope: internal
- Date: 2026-11-14

## Findings

### F-01 High — a late upload can undo a confirmed delete-all command

**Status:** confirmed from the complete static call path. No browser reproduction was run in this read-only partition.

**Evidence**

| File | Relevant code |
|---|---|
| `App.tsx:396-438` | `addFiles` awaits the entire `prepareUploadedImages` operation, then checks only `mountedRef` before appending to `imagesRef.current`. |
| `services/uploadFiles.ts:40-95` | Conversion, dimension decode and EXIF work are asynchronous and sequential. URLs are allocated before all of that work has completed. |
| `App.tsx:406-409` | Unmount is the only invalidation check; there is no roll/upload generation check. |
| `App.tsx:481-519` | `confirmDeleteAllPhotos` increments `renderGenerationRef`, clears image refs/state and revokes all currently owned URLs, but does not invalidate pending upload preparation. |
| `App.tsx:410-437` | The late completion unconditionally creates `nextImages`, writes it to state, selects an image, and can publish an upload error/notice. |

**Reachable trigger**

1. With an existing roll present, start adding a large HEIC/HEIF file, or any file whose conversion/decode/EXIF preparation is still pending.
2. Before that preparation completes, choose “删除全部照片” and confirm. `processing` and `exporting` are false, so the destructive command is allowed.
3. Let the earlier upload complete. `mountedRef` is still true and the cleared roll is refilled from the stale operation.

The old roll's owned URLs are revoked correctly. The defect is that the now-empty workspace does not remain empty: a pre-delete operation subsequently adds its files and feedback after the user confirmed the reset. If the pending selection contains the same photo, the same bytes can visibly reappear.

**Consequence**

The destructive roll-reset contract is violated, and the user's expectation that the session was cleared is not reliable. Newly created preview URLs also gain ownership only after the reset, outside the reset's cleanup snapshot.

**Minimal fix and regression test**

- Keep upload invalidation separate from `renderGenerationRef`; that counter is also incremented by “stop”, which should not silently cancel an unrelated upload.
- Capture a roll-reset/upload epoch when `addFiles` starts. Increment that epoch in `confirmDeleteAllPhotos`. After preparation, reject a stale epoch before publishing errors/notices/state and revoke every `newImages[].previewUrl`.
- Preserve the existing unmount cleanup and latest-ref append behavior for independent, non-reset uploads.
- Add a regression with a deferred conversion or dimension decode: begin upload, confirm delete-all, resolve the deferred work, and assert no photo/selection/late toast is published and every prepared URL is revoked.

### Other async/lifecycle conclusions — no defect confirmed

- Worker disposal removes response handlers, rejects pending requests with `WorkerCancelledError`, clears their timers, and prevents late Blob URL allocation: `services/filmWorkerClient.ts:126-168,178-213`. App invalidates its generation before cancellation: `App.tsx:758-768`.
- Single-image results are checked against the latest image/settings key and generation before merging; rejected or replaced URLs are revoked: `App.tsx:662-697,836-871`. Strip results similarly compare the latest ordered key and revoke stale returns: `App.tsx:619-639`.
- Editor previews have an independent debounced generation/dispose controller. Accepted and late preview URLs are revoked: `services/previewRenderController.ts:39-95`, with focused tests in `tests/previewRenderController.test.ts`.
- **Export/render exclusion was checked rather than assumed.** `downloadAll` rejects calls while processing/exporting (`App.tsx:968-990`), `exportSingleEntries` sets `exporting` before its first Blob await (`App.tsx:941-950`), and normal UI settings/render/retry commands are disabled or guarded while exporting. A previously considered “re-render revokes a ZIP snapshot during export” path is therefore **not** reported as a confirmed defect.
- `removeImage` is allowed during single-frame processing by design. Results merge by ID and are discarded if removal or a new frame index invalidates their key; no whole-array stale overwrite was found.
- A one-second EXIF timeout does not cancel the underlying local `FileReader`, but its late callback only resolves an already-settled local promise and does not mutate App state. This was not classified as a user-visible race.

### Resource boundary

Main-thread Canvas export returns the source Blob's URL and byte size together (`services/canvasRuntime.ts:23-44`). `filmWorkerClient` creates a result URL only for a live Worker response (`services/filmWorkerClient.ts:150-168`). App owns replacement/removal/unmount revocation. No additional confirmed Object URL ownership defect was found outside F-01.

## Caveats / Not Found

- This partition did not deeply audit numerical rendering or every `ImageBitmap` error path inside `filmWorker.ts`, `filmEngine.ts`, `services/spectral/`, or `services/physical135/`; those belong to the imaging partition. Worker-client cancellation and result-URL ownership were reviewed.
- No claim is made that all overlapping upload selections preserve selection-start order across independent file dialogs. They append in completion order, but no contract or reproducible harmful out-of-order case was established.
- F-01 is statically reachable, not browser-reproduced in this audit. The existing delete-all test only covers already-settled uploads (`tests/e2e/frontend-redesign.spec.ts:900-945`).
