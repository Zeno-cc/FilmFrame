# Design: Customizable Frame Number Color

## Architecture

Add `frameNumberColor?: string` to the shared `FilmSettings` contract. Keep it optional for backward compatibility. A small frame-number color resolver should return the explicit value when present and otherwise return the existing renderer-specific fallback.

The setting follows the existing controlled flow:

`RecipeInspector` -> `App.tsx` settings -> preferences/recipes -> render request -> main-thread or Worker renderer -> frame-number drawing functions.

## UI Boundary

Place the control next to `起始帧号` in the film settings section so its ownership is clear. Reuse the existing color swatch style and display the effective HEX value. The control must be available in both desktop and mobile settings because both render the same `RecipeInspector`.

Film-stock changes must not overwrite `frameNumberColor`; only reset or direct user input may change it.

## Rendering Boundary

- `services/filmFrameNumber.ts` owns the shared color resolver and real-135 template frame-number drawing.
- `services/filmEngine.ts` passes the resolved color to continuous Gold strip markings and temporarily switches fill color only around classic frame-number draw calls.
- `services/filmWorker.ts` mirrors the same behavior for Worker-enabled Gold 200 and classic fallback paths.
- Baked template pixels remain untouched.

Avoid using the new color for stock labels, dates, DX blocks, or `SAFETY FILM` text. Restore the previous canvas state after each number-specific color change.

## Persistence And Compatibility

`services/settingsStorage.ts` validates the optional value as six-digit HEX and normalizes it to lowercase. Saved recipes inherit the same normalization automatically.

Older settings omit the field. Renderers then use their previous effective color (`textColor` or the existing amber constant), preserving current output. Once selected, the explicit global color remains stable across stock changes.

`services/renderResult.ts` includes the effective setting in render keys. The absence of an override should remain stable across reloads; an explicit color change must invalidate existing single and strip artifacts.

## Testing

- Unit tests: HEX normalization, preference/recipe round trips, fallback resolution, and render-key invalidation.
- Browser test: desktop selection and mobile availability, followed by real-135 single/strip rendering.
- Renderer parity: exercise representative main-thread and Worker paths through existing client tests or focused pure helpers.

## Rollback

The change is additive. Rollback removes the field, UI control, render-key entry, and number-specific color routing. Existing stored values are ignored safely by older code.
