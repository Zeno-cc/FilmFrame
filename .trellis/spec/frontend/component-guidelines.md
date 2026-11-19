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

- Use the semantic surface tokens from `styles/tokens.css`; do not add global grain, vignette, or safelight pseudo-elements over the workspace. Photo content and controls stay unobscured.
- Prefer shared surface utilities (.ff-surface*) or existing panel/button classes; avoid one-off floating SaaS card shadows or nested decorative cards.
- Empty-darkroom film geometry and data-testid hooks are E2E contracts; do not break dimensions without updating tests. `styles/empty-darkroom.css` owns the current empty-state composition; verify computed geometry because legacy selectors in `components.css` load earlier.
- With no photos, expose one `#workspace-add-photos` control in the empty darkroom. Do not repeat the same primary action in the header, mobile action bar, or output toolbar. Settings show only the lightweight film-stock summary until photos exist.
- The task-facing surface is “照片工作台” with “单张” / “胶片长条” output choices. Keep “调整” for controls and “我的配方” for saved presets; do not expose internal renderer modes as top-level navigation.
- Group settings as film, edge, output, and recipes. Advanced groups use `Disclosure`: a closed group does not mount its children, so hidden controls cannot intercept label queries or keyboard navigation. The settings themselves remain owned by `App.tsx`; folding a group must not reset `FilmSettings`.

### Render-mode settings

- Import user-facing mode names from `services/renderModePresentation.ts`. Do not hardcode “真实 135”, “经典片边”, “贴图”, or “物理底片” in settings components, summaries, errors, or tests.
- Use `supportsSpectralStock(brandText)` to scope the classic option, not the current `imagingMode`. Spectral-capable stocks show only `片边方式`; non-spectral stocks also show `画幅样式` (`135 画幅` / `经典边框`).
- Keep `片边方式` at the normal edge level and expose physical parameters through `高级渲染设置`. It is a two-option native select, not another segmented control.
- The helper appears once: `模板整幅套用，物理按片门与齿孔生成`. Do not add cards, comparison tables, or explanatory sections.
- “模板片边” covers both real overlay PNGs and procedural compatibility edges. Do not rename it to “AI 贴图” or imply an official/measured scan.

```tsx
<label>
  <span>片边方式</span>
  <select aria-label="片边方式" value={settings.edgeRenderMode} onChange={onEdgeModeChange}>
    <option value="legacy-template">模板片边</option>
    <option value="physical135">物理片边</option>
  </select>
</label>
<Disclosure title="高级渲染设置">{physicalControls}</Disclosure>
```

Browser tests open the named disclosure before operating an advanced field. Do not force all groups open or bypass the disclosure with direct DOM mutation.
- PhotoCard develop phases use `data-develop` (`idle` | `bath` | `reveal` | `print`): wet-tray atmosphere while processing/queued; reveal only when the real print URL arrives (result-driven, not a fake spinner timer).
- Keep develop overlays decorative (`pointer-events: none`); dual-layer images stay inside `.ff-photo-card__mat` and must not alter export/render pipelines.

## Accessibility

- Icon-only controls require an accessible name and usually a `title` tooltip.
- Dialogs and sheets use `ModalSurface`, which handles Escape, focus trapping, initial focus, and focus restoration. Focus-trap candidates must have a rendered layout box (`getClientRects().length > 0`) as well as enabled semantics; responsive CSS may hide a button without `hidden`/`aria-hidden`, and it must not receive focus at tablet widths.
- Use native roles and controls: buttons for commands, checkbox for inclusion, range for zoom/grain, tabs for views.
- Preserve `focus-visible` styles, `aria-live` status feedback, and `prefers-reduced-motion` behavior.
- Touch actions must remain at least 44px high where the current mobile UI guarantees it.

### Server-Rendered Access Controls

- When an access-page anchor is styled with the shared `.button` class, make the control itself `display:inline-flex;align-items:center;justify-content:center`; aligning only the parent row does not vertically center the anchor text inside its min-height box.
- Keep the anchor and its companion button at the same clickable height, and verify both the desktop and 390px mobile layouts.

### Custom Film Stock Picker

- Use a native button trigger and `listbox`/`option` semantics for custom stock menus. Roving focus moves the active option only; selection requires click, Enter or Space and must not implicitly enable spectral mode.
- Support Arrow/Home/End navigation and printable-character typeahead. A space in an active multiword query belongs to the query; Space selects only when no query is active or after its reset interval, while Enter always selects. Clear the query on new menu sessions.
- Handle Escape/Tab on both trigger and options because opening focus may not have settled yet. Escape restores the trigger without closing an enclosing Sheet; Tab closes without stealing normal focus order.
- Keep compact capability emblems decorative (`aria-hidden`) and provide the support status through the option's accessible name. Preserve a 44px touch target for the info control even if its visible glyph is smaller.
- Do not import spectral resource JSON to render picker metadata; use the lightweight registry. Keep explanatory cards inline rather than nesting another modal in the mobile settings Sheet.

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
