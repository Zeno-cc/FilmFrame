# Implement: spectral-aware film stock picker

- [x] Create the controlled picker and restrained wavelength-scale emblem using the existing stock registry and design tokens.
- [x] Implement listbox navigation, selection, typeahead, outside/Escape/Tab dismissal, focus restoration and listener/timer cleanup.
- [x] Add the named spectral-info control and inline explanation card without a nested modal or automatic opt-in.
- [x] Integrate desktop/mobile `RecipeInspector` while preserving FilmSettings, imagingMode and all stock/renderer behavior.
- [x] Migrate affected E2E film-selection calls to the new accessible contract and add picker/keyboard/info/mobile regressions.
- [x] Run focused checks, `npm run check`, `npm run test:e2e`, `git diff --check` and independent `trellis-check`; fix and re-verify findings.
- [x] Update relevant specs/task evidence and demonstrate the result on the existing local preview without committing or publishing.

## Guardrails

- No new dependency, resource-JSON import, renderer/storage/schema change or stock-support change.
- Do not replace all native selects or widen scope to unrelated settings controls.
- Preserve mobile Sheet focus trapping and do not introduce a second modal, hover-only content or noisy rainbow/glow decoration.
- Report any existing-test selector migration explicitly; do not weaken assertions merely to make the new menu pass.
