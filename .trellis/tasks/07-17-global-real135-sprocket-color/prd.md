# Global real 135 sprocket color

## Goal

Allow one optional global color override for the sprocket holes of every real-135 film stock, while preserving each template's original hole appearance until the user explicitly chooses a color.

## Background

- Real-135 flattened templates are normalized `1307x1203` PNGs, but their sprocket positions, counts, dimensions, and corner shapes differ by stock.
- Sprocket pixels are baked into those PNGs; the classic renderer's existing `holeColor` does not affect real-135 templates.
- Kodak Gold 200 also has a layered single-frame path and programmatic continuous-strip holes in both the main thread and Worker.
- The user approved the product rule: default to `跟随原片`; once selected, one color applies globally across film-stock changes; the user can restore original template colors.

## Requirements

- Add optional `real135SprocketColor` to `FilmSettings`, accepting normalized six-digit HEX colors.
- Expose a `齿孔颜色` control only when real-135 mode is active.
- Show `跟随原片` when no override exists and provide an accessible reset command when an override exists.
- Preserve an explicit override across film-stock changes, single/strip mode changes, reloads, and saved recipe round trips.
- Do not alter current output when the override is absent.
- Apply the override to every real-135 flattened template using a stock-specific transparent sprocket mask; do not use a universal rectangle geometry.
- Apply the same override to Kodak Gold layered single output and programmatic continuous strips.
- Keep main-thread and Worker-enabled Kodak Gold output visually aligned.
- Restrict recoloring to sprocket-hole interiors; do not recolor film base, printed labels, frame numbers, DX blocks, aperture, photo pixels, scanner background, or hole-edge shadows.
- Include the override in render identity so changing or resetting it marks existing single and strip artifacts stale.
- If a required mask cannot be loaded, preserve the original template rather than failing the render.

## Acceptance Criteria

- [x] With no override, every real-135 stock renders with its current source-template sprocket color.
- [x] Selecting one HEX color recolors sprocket interiors for every registered real-135 stock in single output.
- [x] The same color applies to flattened-template strips and Kodak Gold continuous strips.
- [x] Main-thread and Worker-enabled Kodak Gold paths use the same selected color.
- [x] Switching film stocks or output modes preserves the explicit global override.
- [x] `恢复原片颜色` removes the override and marks existing artifacts stale.
- [x] Valid colors survive preferences and recipe round trips; invalid stored values are ignored.
- [x] Every registered flattened template has a matching validated sprocket mask at `1307x1203`.
- [x] Mask pixel checks prove sprocket centers are covered while aperture, text, and non-hole rebate samples remain transparent.
- [x] Browser tests cover desktop/mobile controls, cross-stock persistence, reset behavior, representative single/strip renders, and no horizontal overflow.
- [x] `npm run check`, `npm run test:e2e`, and `git diff --check` pass.

## Out of Scope

- Per-photo or per-stock color overrides.
- Changing sprocket shape, count, position, shadow, or wear.
- Recoloring classic-renderer holes through the new setting; classic mode keeps using `holeColor`.
- Editing source film-template pixels at runtime.
- Rebuilding or correcting unrelated template artwork.

## Technical Notes

- The override is additive and backward compatible because absence preserves existing behavior.
- Static masks are runtime assets and must be registered alongside the corresponding film template.
