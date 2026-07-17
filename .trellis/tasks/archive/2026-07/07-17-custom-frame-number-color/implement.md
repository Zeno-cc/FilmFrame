# Implementation Plan: Customizable Frame Number Color

## 1. Shared Contract And Persistence

- Add optional `frameNumberColor` to `FilmSettings`.
- Reuse six-digit HEX normalization in `services/settingsStorage.ts`.
- Add preference and recipe round-trip coverage.
- Add the setting to render identity and test artifact invalidation.

## 2. Settings UI

- Add a controlled color swatch beside `起始帧号` in `RecipeInspector`.
- Display the effective fallback color when no override exists.
- Ensure film-stock changes do not overwrite the selected value.
- Verify the shared inspector exposes the control on desktop and mobile.

## 3. Rendering

- Centralize explicit/fallback frame-number color resolution in `services/filmFrameNumber.ts`.
- Apply the color to flattened-template and layered Gold single-frame numbers.
- Apply it to continuous Gold and flattened-template strip numbers.
- Isolate classic single and strip number draw calls from other text colors.
- Mirror all Worker-enabled behavior in `services/filmWorker.ts`.

## 4. Validation

- Run focused Vitest suites for settings, recipes, render identity, frame numbers, and Worker routing/payload behavior.
- Extend the Playwright recipe workflow to select a color and render representative single/strip outputs.
- Run `npm run check`.
- Run `npm run test:e2e`.
- Run `git diff --check`.
- Review the final diff specifically for accidental changes to non-number markings and preservation of the existing dirty worktree.

## Risk And Rollback Points

- Canvas `fillStyle` is stateful: wrap number-specific color changes in `save()`/`restore()` to prevent leakage.
- Main-thread and Worker renderers duplicate some classic drawing logic; compare both before completing the renderer step.
- Do not modify PNG overlays to implement dynamic color.
- If compatibility tests show visual drift for unset values, keep `frameNumberColor` optional and restore renderer-specific fallback behavior before proceeding.
