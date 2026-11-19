# Design spectral-aware film stock picker

## Goal

Replace the native film select with an accessible darkroom-styled picker that identifies supported spectral stocks before selection, without adding visual noise or changing the imaging pipeline.

## Confirmed Context

- `RecipeInspector` currently renders a native `<select>` over all `FilmType` values. Native option rows cannot contain the requested designed spectral markers.
- The lightweight `supportsSpectralStock` registry identifies supported stocks without importing their numerical resources. Keep this lazy-loading boundary.
- Desktop and mobile share `RecipeInspector`; mobile already lives inside a focus-trapped settings sheet. Avoid stacking another modal over it.
- The approved visual direction is a restrained **spectroscope label strip**: a compact wavelength-scale/`λ` emblem in existing amber/paper colors, not a rainbow gradient, glow, badge cloud or persistent explanatory paragraph.
- The user approved the custom menu approach and explicitly requested task creation, refinement and implementation.

## Requirements

### R1 — Discoverability before selection

- Show a custom film picker with every existing FilmType, grouped with the 13 spectral-supported stocks first and the 10 legacy-only stocks second. Preserve original relative order within each group and visibly identify the current selection.
- Supported spectral stocks display a right-aligned spectral-scale/`λ` emblem and concise `光谱` label. Unsupported stocks have no false-positive badge and remain fully selectable in legacy mode.
- The trigger may show a compact emblem for a supported selected stock but must not change the selected FilmType or imagingMode automatically.

### R2 — Designed explanatory card

- Put one labeled spectral-info button beside the `胶片型号` label, available for supported selected stocks in real-135 mode.
- Opening it reveals a restrained darkroom card with `SPECTRAL NEGATIVE`, a wavelength-scale motif, `这款胶片支持光谱模拟`, a short ordinary-photo → negative → paper → output explanation and `81 个波长采样` metadata.
- Explain that the mode is experimental and processes locally; do not imply full SpektraLab spatial/stochastic parity or scanned-negative inversion.
- Support explicit close, Escape and outside-dismiss behavior, with predictable focus return. Do not show the card on every hover or stack it as a second modal.

### R3 — Accessible custom listbox

- Use a button trigger and `role=listbox` / `role=option` semantics with `aria-selected`, labeled controls and stable IDs.
- Support pointer selection, Enter/Space open and select, ArrowUp/ArrowDown open and navigate, Home/End, Escape close, Tab close and typeahead by the existing uppercase stock names.
- Use roving active option focus, preserve selected-option visibility on open, and restore focus to the trigger on close unless focus intentionally moves elsewhere.
- Do not trap ordinary Tab navigation inside the listbox. Closing the picker must not close or release the enclosing mobile settings Sheet.

### R4 — Responsive and stable layout

- Keep desktop and mobile on the same component and existing settings/result identity callbacks.
- Long stock names remain readable, the menu scrolls within available space, and supported emblems do not crowd or overflow narrow widths.
- Keep touch targets at least 44px, visible focus states, `prefers-reduced-motion` support and no horizontal overflow at 390px.
- Disabled state prevents opening and preserves the selected value. Processing/exporting behavior remains unchanged.

### R5 — Preserve technical and visual boundaries

- Keep the native `FilmSettings` contract, supported-stock registry and current imaging controls unchanged. Selecting a film does not opt the user into spectral processing.
- No new dependency, runtime photo request, stock JSON import, GPU/render-pipeline modification or license-scope change.
- Use existing color/spacing/radius tokens and icon conventions; no new decorative grain system, generic SaaS-card treatment or unrelated control redesign.

## Acceptance Criteria

- [x] Every FilmType appears with supported stocks grouped first; exactly the registry-supported 13 stocks have spectral emblems and blocked stocks do not.
- [x] Selected stock, current imaging mode and subsequent rendering work exactly as before; changing the stock alone never enables spectral mode.
- [x] Trigger and option rows expose correct accessible names/states, keyboard selection/navigation/typeahead, Escape, Tab, outside dismissal and focus restoration.
- [x] The spectral info card opens only from its named control, communicates the approved concise explanation, and closes with Escape/outside/button while returning focus appropriately.
- [x] Desktop, 390px mobile and existing mobile Sheet focus containment pass; no nested modal or horizontal overflow.
- [x] Disabled/reduced-motion/current legacy flows and all existing E2E selectors/workflows continue to pass, with tests migrated to the accessible custom-picker contract where necessary.
- [x] Focused Vitest/Playwright coverage plus `npm run check`, `npm run test:e2e`, `git diff --check` and `trellis-check` review pass.

## Out of Scope

- Search/filter, per-stock photos, new film types, spectral halation/grain claims or changing any stock's support status.
- A native-select wrapper that merely adds text badges without delivering the approved designed menu.
- Public release/distribution clearance, unrelated settings UI redesign or render-algorithm work.
