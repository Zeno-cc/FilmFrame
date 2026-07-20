# Implementation Plan: Global real 135 sprocket color

## 1. Mask Assets And Registry

- Measure sprocket components for all 16 normalized templates.
- Generate transparent `1307x1203` masks that cover only sprocket interiors.
- Add a stock-complete mask registry in `services/filmSprocket.ts`.
- Add browser-based pixel validation for dimensions, alpha coverage, and non-hole transparency.

## 2. Shared Contract And UI

- Add optional `real135SprocketColor` to `FilmSettings`.
- Normalize/persist it through preferences and recipes.
- Add it to render identity.
- Add the real-135-only color input, `跟随原片` state, and reset icon in `RecipeInspector`.

## 3. Main-Thread Rendering

- Composite tinted masks in flattened single-frame rendering.
- Reuse the same path for flattened-template strips.
- Composite the Gold mask in layered single rendering.
- Route the override into Gold continuous-strip hole drawing while preserving the current fallback.

## 4. Worker Rendering

- Cache/load the Gold sprocket mask only when an override is explicit.
- Composite it after the layered base and before dynamic markings.
- Route the override into continuous-strip programmatic holes.
- Verify request settings carry the field unchanged.

## 5. Validation

- Add focused settings, recipe, render-key, registry, mask, and Worker tests.
- Extend Playwright for desktop/mobile control behavior and representative single/strip rendering.
- Verify all masks against their source templates and visually inspect a contact sheet.
- Run `npm run check`.
- Run `npm run test:e2e`.
- Run `git diff --check`.
- Review fallback behavior with the override absent and with a simulated missing mask.

## Risk And Rollback Points

- Do not use one geometry for all stocks; masks must follow the registered source template.
- Keep mask tint scoped with `save()`/`restore()` or an isolated temporary canvas so composite state cannot leak.
- Draw masks before frame numbers/labels to avoid covering dynamic markings.
- Do not make mask loading render-blocking when no override is selected.
- Preserve Gold main-thread/Worker parity before declaring completion.
