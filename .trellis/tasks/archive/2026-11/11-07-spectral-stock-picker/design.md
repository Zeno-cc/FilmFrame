# Design: spectral-aware film stock picker

## Component Boundary

Create a controlled `FilmStockPicker` under `components/settings` with props:

```ts
interface FilmStockPickerProps {
  id?: string;
  value: FilmType;
  onChange: (value: FilmType) => void;
  disabled?: boolean;
}
```

`RecipeInspector` supplies `id` for unique label/listbox relationships and retains `update({ brandText })`. The component derives each option's spectral support from `supportsSpectralStock`; it never imports numerical stock resources or mutates `imagingMode`.

The picker label owns an adjacent named spectral-info button when the current stock is supported in real-135 mode. Its inline explanatory card shares the picker's root boundary for outside dismissal and Escape handling, but is not part of the option's selection action.

## Visual Language

- Existing `--ff-panel-raised`, `--ff-line`, `--ff-paper`, `--ff-amber`, restrained 3–5px radii and current shadows.
- A tiny inline SVG/CSS wavelength scale: three or four unequal vertical strokes and a short baseline, accompanied by `λ` / `光谱`. Amber tint denotes capability, not active spectral mode.
- Current option: subtle amber-soft surface and left selection mark; keyboard-active option: visible focus outline independent of selection.
- Info card: small eyebrow `SPECTRAL NEGATIVE`, spectral-scale motif, one concise Chinese explanation and 81-sample/local-processing footnote. Render inline below the picker trigger to avoid clipping or a second modal.
- No animated rainbow or auto-opening tooltip. Any open transition respects reduced motion and does not delay selection.

## Listbox Contract

- The trigger is a native button with `aria-haspopup=listbox`, `aria-expanded` and `aria-controls` while open.
- Options are native buttons with `role=option`, `aria-selected` and roving `tabIndex`. The listbox uses `aria-labelledby` tied to the visible `胶片型号` label.
- Open with pointer, Enter/Space or Arrow keys; ArrowDown starts at the selected/next option, ArrowUp at selected/previous, Home/End at boundaries. Character keys advance through uppercase FilmType names with a bounded reset timer.
- Maintain `activeValue` while open and scroll that option into view with `block: 'nearest'`; do not mutate the selected FilmType merely by navigating.
- Select with click/Enter/Space. Escape closes and restores trigger focus; Tab closes without preventing normal focus navigation; outside pointer down closes without stealing focus.
- Clean up document listeners and typeahead timers on close/unmount. If disabled while open, close without running selection. Nested mobile Sheet key handling sees the picker's stopped Escape propagation first and stays open.

## Validation

- Unit tests for keyboard navigation/typeahead, support marking, non-mutating navigation and listener cleanup through a testable picker interaction controller if needed; use Playwright as the primary accessible behavior gate.
- Browser tests open the picker, assert all option counts/support badges, select supported and blocked stocks, and verify imagingMode remains unchanged.
- Keyboard tests prove trigger opening, arrows/Home/End/typeahead, Enter/Space selection, Escape focus return, normal Tab and outside click.
- Info-card tests prove named control, explanatory content, Escape/outside/button dismissal and no selection change.
- Mobile tests verify 390px layout, no horizontal overflow, menu scrolling, touch-sized options and Sheet focus retention.
- Existing E2E uses `getByLabel('胶片型号').selectOption(...)`; migrate these helpers/call sites to the accessible picker option-selection contract. Preserve unrelated `select` controls and their tests.
- Run `npm run check`, `npm run test:e2e`, `git diff --check`, then independent `trellis-check` for keyboard/focus/mobile/resource-loading issues. No provenance or release-scope change.

## Rollback

The picker is isolated from rendering and storage. Reverting the `RecipeInspector` integration restores the native select without affecting FilmSettings, resources or Worker behavior.
