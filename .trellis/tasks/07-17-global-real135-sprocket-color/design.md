# Design: Global real 135 sprocket color

## Architecture

Add `real135SprocketColor?: string` to the shared settings contract. A focused `services/filmSprocket.ts` module owns:

- the stock-to-mask registry;
- explicit/fallback color resolution;
- mask tint compositing for DOM Canvas and OffscreenCanvas-compatible contexts;
- validation helpers used by tests.

Each flattened template receives a matching `public/film-sprocket-masks/<stock>.png` asset. Masks are transparent outside sprocket interiors and white with anti-aliased edges inside them. Runtime rendering tints the mask using the selected color and composites it after template/base drawing but before dynamic markings.

## Settings And UI

`RecipeInspector` adds a real-135-only row near the frame-number controls:

- a native color input using black as the inactive display swatch;
- status copy showing either `跟随原片` or the normalized HEX value;
- a reset icon button labelled `恢复原片齿孔颜色`, shown only for an explicit override.

The control updates only `real135SprocketColor`. Film-stock effects must not overwrite it.

## Rendering Data Flow

`RecipeInspector` -> `App.tsx` settings -> preferences/recipes -> render request -> main-thread or Worker renderer.

### Flattened templates

Load the overlay as today. When an explicit override and registered mask both exist, load the mask, draw it at the template's scaled `filmW x filmH`, and tint only its alpha coverage. Mask-load failure is caught locally and leaves the original overlay unchanged.

### Kodak Gold layered single

After drawing `film-base.png`, composite the Gold sprocket mask, then draw dynamic frame numbers. Main-thread and Worker paths follow the same order.

### Kodak Gold continuous strip

Pass the explicit color into the existing programmatic hole painter. When absent, retain the existing `#020100` fill. The row base is drawn once, so the override is applied at that ownership boundary rather than per photo.

## Persistence And Render Identity

`services/settingsStorage.ts` validates and lowercases the optional HEX value. Recipe storage inherits the normalized `FilmSettings` contract. `createRenderSettingsKey` includes `real135SprocketColor ?? null`; explicit selection and reset both invalidate single and ordered-strip artifacts.

## Asset Contract

- Canvas: exactly `1307x1203` RGBA PNG.
- Outside sprocket interiors: alpha `0`.
- Inside sprocket interiors: white RGB with nonzero alpha; anti-aliased edge alpha is allowed.
- Aperture and printed film markings: alpha `0`.
- One mask exists for every key in `REAL135_TEMPLATE_URLS`.

Masks are generated once from the current normalized templates and committed as runtime assets. They are not inferred per render, avoiding repeated pixel scans and Worker/main-thread drift.

## Failure And Rollback

Mask loading is optional enhancement behavior: failure preserves original holes and logs no user-blocking error. Rollback removes the setting, UI, mask registry/assets, render-key entry, and compositing calls; old stored values are ignored safely.

## Testing

- Unit: color resolution, settings normalization, storage/recipe round trips, render-key invalidation, registry completeness.
- Asset browser test: dimensions and alpha coverage for every mask, including center/non-hole samples.
- Renderer integration: selected color in representative flattened single/strip and Gold main/Worker paths.
- E2E: control visibility, global persistence across stock changes, reset, successful render, and mobile layout.
