# Delete all photos

## Goal

Let users clear the current roll in one deliberate action so they can begin a new roll without deleting photos individually or reloading the application.

## Background

- `App.tsx` owns uploaded images, generated artifacts, preview/crop state, async processing state, and Object URL cleanup.
- The workspace already separates inclusion controls (`全部入选` / `清空入选`) from individual photo deletion.
- Users approved a destructive bulk action with a confirmation dialog that shows the current photo count and initially focuses `取消`.

## Requirements

- Show a visible `删除全部照片` danger action in the workspace batch-action area only when at least one photo exists.
- Keep the action visually and semantically separate from `清空入选` so selection changes cannot be confused with deletion.
- Disable the action while processing or exporting; users must stop those operations before deleting the roll.
- Opening the action must show an accessible confirmation dialog with the exact number of photos to be removed.
- The confirmation dialog must initially focus `取消`, support Escape, trap focus, and restore focus on cancellation.
- Confirmation must revoke every uploaded preview URL, processed-image URL, editor-preview URL, and strip-result URL owned by the session.
- Confirmation must clear the image collection, strip result, preview/crop state, drag state, active/queued processing state, processing errors/notices tied to the deleted roll, and the file-input value.
- Late asynchronous render results must not repopulate deleted state or leak newly created Object URLs.
- After confirmation, return to the empty darkroom and focus the visible `添加照片` action.
- Preserve film settings, output mode, saved recipes, and original files on disk.

## Acceptance Criteria

- [x] With photos present and the app idle, `删除全部照片` is visible and opens a confirmation dialog.
- [x] The dialog states the exact photo count and `取消` receives initial focus.
- [x] Cancel or Escape keeps every photo and restores focus to the trigger.
- [x] Confirm removes all photos and generated results, closes preview/crop UI, and shows the empty darkroom.
- [x] Confirm revokes all session-owned Object URLs exactly once and clears the file input so the same files can be selected again.
- [x] After confirmation, focus moves to the visible `添加照片` button.
- [x] Processing/exporting disables the bulk-delete trigger and cannot be bypassed by the dialog command.
- [x] Film settings, output mode, and saved recipes remain unchanged.
- [x] Desktop and 390px mobile layouts remain usable without horizontal overflow.
- [x] Focused tests and Playwright cover confirmation, cancellation, cleanup, busy-state gating, and focus behavior.

## Out of Scope

- Undo or recovery after confirmation.
- Deleting original files from the user's device.
- Clearing preferences, saved recipes, or browser storage.
- Stopping an active process/export as part of deletion.
