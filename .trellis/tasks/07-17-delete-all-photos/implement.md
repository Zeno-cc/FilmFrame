# Implementation Plan: Delete all photos

## 1. Presentation

- Add `DeleteAllPhotosDialog` using `ModalSurface`, danger/secondary buttons, photo-count copy, and cancel-first focus.
- Extend `WorkspaceToolbar` with a separated danger action and stable add-photo button ref.
- Export the new feedback component through the existing feedback boundary if that directory uses a barrel.

## 2. App Command

- Add confirmation-open state and refs for the cancel and add-photo controls.
- Implement guarded roll cleanup in `App.tsx`.
- Revoke image, processed, and strip Object URLs; dispose preview state so its controller revokes editor-preview URLs.
- Invalidate async work and reset image-owned/transient workflow state without touching settings, output mode, or recipes.
- Wire the toolbar trigger and dialog overlay.

## 3. Validation

- Extend Playwright coverage for visibility, exact count, cancel/Escape focus restoration, confirm cleanup, same-file re-selection, and add-photo focus.
- Verify the danger action is disabled while processing/exporting and remains usable on mobile.
- Run `npm run check`.
- Run `npm run test:e2e`.
- Run `git diff --check`.
- Inspect Object URL ownership and the final diff for accidental preference/recipe changes.

## Risk And Rollback Points

- Do not revoke an Object URL after clearing the only reference to it.
- Do not let both the dialog and App own cleanup; `App.tsx` is the only resource owner.
- Do not focus a disappearing delete trigger after confirmation; focus the persistent add-photo control instead.
- Do not enable deletion while processing/exporting or implicitly stop those operations.
