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

## Accessibility

- Icon-only controls require an accessible name and usually a `title` tooltip.
- Dialogs and sheets use `ModalSurface`, which handles Escape, focus trapping, initial focus, and focus restoration.
- Use native roles and controls: buttons for commands, checkbox for inclusion, range for zoom/grain, tabs for views.
- Preserve `focus-visible` styles, `aria-live` status feedback, and `prefers-reduced-motion` behavior.
- Touch actions must remain at least 44px high where the current mobile UI guarantees it.

## Common Mistakes

- Inferring artifact validity from the presence of a URL instead of `workflowState`/settings keys.
- Closing a modal without restoring focus to its trigger.
- Reimplementing recipe or render capability checks in multiple components instead of using helpers such as `supportsReal135Template`.
- Mutating an `ImageItem` or `FilmSettings` object received through props.
- Adding explanatory UI copy about how controls work; labels should describe the action or state.
