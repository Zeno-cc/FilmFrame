# Implementation Plan: Animated empty darkroom film background

## 1. Empty-State Structure

- Add `.ff-empty-darkroom` and `data-drag-active` to the root section.
- Expose the existing `Workspace.isDragActive` value through `.ff-workspace[data-drag-active]` for descendant pause/dim styling.
- Replace the two independent static perforation elements with one `aria-hidden` film viewport and compositor track.
- Add a stable track test identifier and content-layer class.
- Preserve all existing copy, upload behavior, workflow semantics, and drag overlay markup.

## 2. Film Material And Motion

- Define a `360px` repeating full-negative tile in `styles/components.css` using layered CSS geometry.
- Keep the exposure field uniform, abstract, and low contrast; include synchronized perforations and restrained index details without vertical tonal bands.
- Add `ff-empty-film-transport` translating exactly `-360px` over `36s` with linear infinite timing.
- Clip the oversized track within the component and animate only `transform`.
- Add hover, focus-within, and drag-active pause rules; dim the film in drag-active state.
- Add a deliberate static reduced-motion rule.

## 3. Responsive And Visual Refinement

- Verify content remains above the film without a nested card treatment.
- Tune only opacity/contrast across desktop, tablet, and mobile; do not change speed or tile phase by breakpoint.
- Confirm the film never intersects the document's horizontal layout and produces no layout shift.

## 4. Browser Tests

- Extend the desktop empty-state test for the full-negative layer and computed animation contract.
- Add deterministic transform progression coverage through controlled Web Animation time.
- Cover hover/focus pause and drag-active pause/dimming.
- Cover `prefers-reduced-motion: reduce` with no active animation.
- Confirm photo upload unmounts the track.
- Extend the `390x844` overflow assertion to the empty state.

## 5. Visual QA And Gates

- Capture paused/reduced-motion screenshots at `1440x1000`, tablet, and `390x844`.
- Observe at least two full live cycles to check the `360px` seam and phase alignment.
- Check focus rings, drag overlay precedence, text contrast, and console errors.
- Run `npm run check`.
- Run `npm run test:e2e`.
- Run `git diff --check`.

## Risk And Rollback Points

- Non-`360px`-aligned backgrounds will snap at the loop boundary; verify all repeated layers share the tile size.
- Do not use animation-duration changes for interaction states because they can jump phase.
- Do not add image assets or a library during visual tuning.
- If the full frame field competes with content after opacity tuning, reduce central-frame contrast before adding a scrim.
- Rollback is confined to `EmptyDarkroom.tsx`, `styles/components.css`, and its E2E assertions.
