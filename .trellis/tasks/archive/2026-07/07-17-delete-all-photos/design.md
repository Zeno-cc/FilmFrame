# Design: Delete all photos

## UI Boundary

Extend `WorkspaceToolbar` with a narrow `onDeleteAll` command and render a danger button in a separate group beside the inclusion controls. The toolbar remains present after deletion, which gives `App.tsx` a stable visible `添加照片` focus target.

Add a focused `DeleteAllPhotosDialog` under `components/feedback/`. It composes `ModalSurface` and `Button`, receives only `open`, `photoCount`, `onCancel`, `onConfirm`, and focus refs, and owns no deletion state. `ModalSurface` provides the existing focus trap, Escape handling, backdrop handling, and cancellation focus restoration.

## State And Resource Ownership

`App.tsx` owns the delete command because it owns every affected resource. The command re-checks `processing`, `exporting`, and `imagesRef.current.length` before acting.

On confirmation:

1. Increment `renderGenerationRef` to invalidate late batch/retry results.
2. Revoke preview and processed URLs for every current image.
3. Revoke the strip-result URL and clear preview state so the preview render controller disposes and revokes its own accepted or late URLs.
4. Clear the authoritative refs before updating React state.
5. Reset image/result/preview/crop/drag/queue/error/notice state and the file input value.
6. Close the dialog and focus the toolbar `添加照片` button on the next animation frame.

The preview render controller already revokes its pending/result URL when its owning effect is disposed. Clearing preview/image state triggers that cleanup. The delete command must not separately revoke `editorPreviewUrl`, because that URL remains owned by the controller until disposal.

## Async Safety

The action is unavailable during processing/exporting, but generation invalidation remains a defensive invariant for retry/batch results. Any late result that fails the generation or item-existence check is revoked by the existing workflow. The confirmation handler also guards against programmatic invocation while busy.

## Compatibility And Rollback

No persistent schema or renderer contract changes. Rollback removes the toolbar prop/button, dialog component, and App command/state. Existing single-photo deletion remains unchanged.

## Testing

- Component/browser assertions for button visibility, dialog count, initial focus, Escape/cancel behavior, and confirmation.
- Browser verification that all photos disappear, the empty darkroom returns, and `添加照片` receives focus.
- Busy-state coverage through the existing mocked processing workflow.
- Unit coverage is added only for any extracted pure cleanup helper; otherwise the ownership behavior is best covered through Playwright.
