# Research: frontend keyboard and focus

- Query: Static keyboard/focus audit of dialogs, settings sheet, stock picker, tabs, menus and crop editor.
- Scope: internal
- Date: 2026-11-14

## Findings

### F-02 Medium — tablet settings Sheet includes its hidden menu trigger in the focus loop

**Status:** confirmed by DOM/focus-selector and responsive CSS analysis. No browser run was performed.

**Evidence**

| File | Relevant code |
|---|---|
| `components/settings/MobileSettingsSheet.tsx:59-74` | Focus candidates use `querySelectorAll` and filter only `aria-hidden`/`hidden` ancestors, not CSS `display:none`. The loop wraps only when focus is already on the computed first/last element. |
| `components/settings/MobileSettingsSheet.tsx:51,118-135` | The close button is initially focused; the optional `MoreMenu` trigger is earlier in DOM order. |
| `components/settings/MobileSettingsSheet.tsx:124` | That trigger is mounted with `className="min-[768px]:hidden"`. |
| `components/app/MoreMenu.tsx:111-126` | The `MoreMenu` wrapper is `relative`, so it does not remove its button from layout or keyboard navigation. |

**Reachable trigger**

At a viewport from 768px through 1179px, open “配方”. The close button receives focus. Press Shift+Tab. The selector identifies the hidden `MoreMenu` trigger as `first`, so `document.activeElement === first` is false and the trap does not wrap to the last visible control. Browser tab order instead leaves the `aria-modal` dialog for the Header trigger or another underlying control.

Forward Tab from the last focusable control can produce the same escape at this breakpoint. Mobile (<768px), where the menu is displayed, does not have this specific defect.

**Consequence**

Keyboard users can move focus behind an open modal settings drawer, contrary to `aria-modal` and the project's focus-trap contract.

**Minimal fix and regression test**

- Filter focus candidates by actual rendered layout, e.g. exclude elements with no layout boxes (`getClientRects().length === 0`), or consistently use `inert`/disabled semantics for responsive-hidden controls. Apply this only to the Sheet's focus selector; do not broadly refactor dialog code.
- Extend `tests/e2e/frontend-redesign.spec.ts` around the existing tablet test (`259-270`): at 900px, assert close-button initial focus, Shift+Tab wraps to the last visible control, and forward Tab from it returns to close.
- A shared visibility helper could also cover the similar selector in `components/ui/ModalSurface.tsx:32-36`, but no separate reachable CSS-hidden-child defect was confirmed there in this audit; do not expand scope without a case.

### Other reviewed keyboard behavior — no confirmed defect

- `PreviewDialog` uses current callbacks through `interactionRef`, guards `R` against repeats/modifiers/editable targets/crop mode, and includes focus trapping and Escape (`components/preview/PreviewDialog.tsx:82-171`). Crop arrow keys are isolated by crop mode.
- `FilmStockPicker` implements Enter/Space selection, roving options, Home/End, typeahead, and Escape/Tab handling on both trigger/options (`components/settings/FilmStockPicker.tsx:125-182`). No concrete keyboard defect was verified from these paths.
- `ModalSurface` traps and restores focus for the ordinary dialogs exercised by App (`components/ui/ModalSurface.tsx:104-151`). The general issue of focus escaping a programmatically moved outside element was not promoted to a defect without a normal reachable trigger.
- `WorkspaceToolbar` and mobile settings tabs provide keyboard navigation; reorder buttons provide a non-drag keyboard path (`components/workspace/WorkspaceToolbar.tsx:60-70`, `PhotoCardActions.tsx`, `FilmSequenceRail.tsx:110-135`).

## Caveats / Not Found

- No Playwright was run. These findings do not assert physical-device screen-reader behavior, mobile touch target measurements, visual contrast or complete responsive-layout correctness.
- SVG/icon source and the unused UI primitives were inspected only for reachability/static issues, not with an accessibility tree.
