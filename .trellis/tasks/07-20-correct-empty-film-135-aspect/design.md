# Design: Correct empty film 135 frame aspect

## Boundary

This child task changes only the decorative exposures inside the empty-darkroom film. The full strip, perforation rails, content layout, transport animation, interaction states, and production real-135 output pipeline remain unchanged.

## Geometry

- One animation tile remains `360px` wide.
- One exposure frame is explicitly `342px` wide and `228px` high, giving `36:24 = 3:2`.
- An `18px` inter-frame rebate completes the `360px` pitch. This approximates the physical distinction between a 36 mm exposure and the roughly 38 mm eight-perforation transport pitch.
- The exposure row is vertically centered inside the existing film track.
- Repeated frames share the same `360px` horizontal pitch as the transform loop, so the animation seam remains phase-equivalent.
- Frames use `box-sizing: border-box`; any subtle boundary is included inside the fixed dimensions.

## DOM And Styling

`EmptyDarkroom` renders a finite set of identical decorative frame elements inside `.ff-empty-darkroom__exposures`. The outer film layer is already `aria-hidden`, so the added elements remain absent from the accessibility tree and pointer-inert.

CSS grid lays the frames in one row with fixed `342px` columns, `228px` height, and an `18px` gap. The existing low-contrast vertical tonal gradient moves from the row container to each frame. No horizontally segmented or repeating tonal gradient is introduced.

## Responsive Behavior

Frame geometry does not change at the mobile breakpoint. Smaller viewports reveal fewer frames while maintaining the physical 3:2 proportion and the existing perceived transport speed.

## Testing

- Measure the first rendered frame with `getBoundingClientRect()` at desktop and mobile viewports and assert a `1.5` ratio.
- Assert vertical centering and clearance from the perforation rails.
- Preserve existing animation, interaction, reduced-motion, and overflow assertions.
- Capture desktop and mobile screenshots after implementation.

## Rollback

Restore the single exposure field element and its prior `top`/`bottom` positioning. No state, persistence, assets, or migrations are involved.
