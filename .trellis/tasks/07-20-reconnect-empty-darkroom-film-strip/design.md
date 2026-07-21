# Design: Reconnect empty darkroom film strip

## Visual Structure

The moving artwork becomes one continuous negative above the information band rather than a panel-height background with independent rails:

```text
empty-state panel
  moving 135 negative (332px high)
    top acetate and sprocket rail       52px
    3:2 exposure frame row             228px
    bottom acetate and sprocket rail    52px
      upload focal point above the frame row
  quiet context band: privacy sentence and 01 / 02 / 03 workflow
```

The title, upload icon/button, and drag hint remain over the frame row. The longer privacy sentence and workflow steps move below the negative to keep the exposure window visually clean.

## Geometry

- The moving track retains the current `360px` period and starts one full period to the left of the viewport.
- Every exposure frame remains `342x228px`; the `18px` rebate completes one `360px` pitch.
- The negative body is `332px` high (`52 + 228 + 52`) and positioned by its non-animated parent above the information band. This avoids mixing its vertical placement with the track's horizontal transform animation.
- Explicit rail elements directly abut the exposure row. A `52px` rail provides margin around the perforations and matches the frame row as part of one object.

## Material And Hierarchy

- The entire negative uses one near-black charcoal acetate base with restrained edge shading.
- Rails use the same base. Their holes are dark horizontal cutouts with a restrained rim, which makes them look punched through rather than printed on a separate stripe.
- Frames retain low-contrast warm texture. The `18px` rebate reveals the shared film base, not the page background.
- Content stays above the film, without a framed or opaque card. A localized restrained text shadow is allowed only if screenshots show contrast is insufficient.

## DOM Boundary

`EmptyDarkroom` adds explicit decorative `.ff-empty-darkroom__film-rail` elements before and after the existing exposure row. The entire artwork stays inside the existing `aria-hidden`/pointer-inert film layer.

The content is split into a focus group over the strip and a semantic, stationary description/workflow group below it. Upload commands, identifiers, and the drag status remain unchanged.

## Responsive And Interaction Behavior

- The 332px strip remains physically consistent; mobile crops horizontal breadth rather than distorting the negative.
- Existing hover/focus/drag pause, drag dimming, reduced motion, and unmount behavior remain unchanged.
- The stationary information band wraps naturally below the strip and keeps text within the available mobile width.

## Rollback

Restore rail pseudo-elements, the existing single content group, and the full-height track. No state, APIs, assets, or migrations are involved.
