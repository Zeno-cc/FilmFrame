# Component Guidelines

> Component patterns used by FilmFrame.

## Component Structure

- Use named function components for feature/UI modules and define a local or exported props interface directly above the component.
- Keep components controlled: receive current values plus explicit callbacks. `PhotoCard` receives an `ImageItem`, workflow status, and commands; `RecipeSummaryCard` receives settings and derived counts.
- Compute small display-only values inside the component. Move shared or workflow-sensitive derivation into `services/`.
- Compose surfaces from existing primitives (`Button`, `IconButton`, `ModalSurface`, `SegmentedControl`) rather than copying interaction behavior.
- Keep `App.tsx` responsible for commands that mutate the image collection, trigger rendering, create downloads, or own Object URLs.

```tsx
export interface RecipeSummaryCardProps {
  settings: FilmSettings;
  outputMode: OutputMode;
  imageCount: number;
  pendingCount: number;
}

export function RecipeSummaryCard({ settings, outputMode, imageCount, pendingCount }: RecipeSummaryCardProps) {
  // Render derived recipe information only.
}
```

## Props Conventions

- Use domain types from `types.ts` instead of recreating local shapes.
- Name command callbacks with `on...`: `onMove`, `onDelete`, `onSettingsChange`.
- Prefer semantic values over generic booleans. Existing booleans such as `isBusy` and `canMoveUp` describe one clear UI condition.
- Do not pass setters to feature components when a narrower command callback is sufficient.
- Export props types when another component needs to compose or forward the same surface (`RecipeInspectorProps`).

## Styling

- Use semantic classes from `styles/components.css` and Tailwind utility classes already present in the component.
- Use tokens from `styles/tokens.css`; do not introduce isolated color systems.
- Preserve stable dimensions for icon buttons, status marks, crop controls, and film stages.
- Keep cards at the existing restrained radius and do not nest decorative cards.
- Icons come from `components/icons/FilmFrameIcons.tsx` and normally use `currentColor`.

### Darkroom atmosphere and materials

- Global grain / vignette / safelight wash live on body pseudo-elements and atmosphere tokens; prefer tuning tokens over page-local overlays.
- Prefer shared surface utilities (.ff-surface*) or existing panel/button classes; avoid one-off floating SaaS card shadows.
- Atmosphere is decorative: pointer-events none, keep photo content readable, weaker/static grain under prefers-reduced-motion.
- Empty-darkroom film geometry and data-testid hooks are E2E contracts; do not break dimensions without updating tests.
- PhotoCard develop phases use `data-develop` (`idle` | `bath` | `reveal` | `print`): wet-tray atmosphere while processing/queued; reveal only when the real print URL arrives (result-driven, not a fake spinner timer).
- Keep develop overlays decorative (`pointer-events: none`); dual-layer images stay inside `.ff-photo-card__mat` and must not alter export/render pipelines.

## Accessibility

- Icon-only controls require an accessible name and usually a `title` tooltip.
- Dialogs and sheets use `ModalSurface`, which handles Escape, focus trapping, initial focus, and focus restoration.
- Use native roles and controls: buttons for commands, checkbox for inclusion, range for zoom/grain, tabs for views.
- Preserve `focus-visible` styles, `aria-live` status feedback, and `prefers-reduced-motion` behavior.
- Touch actions must remain at least 44px high where the current mobile UI guarantees it.

### Server-Rendered Access Controls

- When an access-page anchor is styled with the shared `.button` class, make the control itself `display:inline-flex;align-items:center;justify-content:center`; aligning only the parent row does not vertically center the anchor text inside its min-height box.
- Keep the anchor and its companion button at the same clickable height, and verify both the desktop and 390px mobile layouts.

### Dialog Keyboard Shortcuts

- Keep a visible, named button for every shortcut command; the shortcut accelerates the command and never replaces its discoverable control.
- Declare single-key shortcuts with `aria-keyshortcuts` on the owning control and invoke the same callback used by pointer activation.
- Document-level dialog handlers must ignore repeated keydown events, `Ctrl`/`Meta`/`Alt` combinations, editable targets, and nested interaction modes where the command is not valid.
- Store changing callbacks and mode guards in the dialog's existing interaction ref so one open-state listener always reads current props without being rebound.
- Browser tests must cover the button and shortcut success paths plus repeat, modifier, editable-target, and nested-mode rejection.

## Common Mistakes

- Inferring artifact validity from the presence of a URL instead of `workflowState`/settings keys.
- Closing a modal without restoring focus to its trigger.
- Reimplementing recipe or render capability checks in multiple components instead of using helpers such as `supportsReal135Template`.
- Mutating an `ImageItem` or `FilmSettings` object received through props.
- Adding explanatory UI copy about how controls work; labels should describe the action or state.
- Handling a letter key without guarding browser shortcuts, held-key repeats, or focused form controls.
