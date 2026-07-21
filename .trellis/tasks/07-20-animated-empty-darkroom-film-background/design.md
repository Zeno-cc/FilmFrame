# Design: Animated empty darkroom film background

## Architecture

Keep the feature local to the empty workspace:

- `components/workspace/EmptyDarkroom.tsx` defines one decorative film viewport and track plus state attributes.
- `components/workspace/Workspace.tsx` exposes its existing drag-active state as a DOM data attribute for descendant styling.
- `styles/components.css` owns film geometry, animation, pause states, responsive treatment, and reduced-motion fallback.
- `tests/e2e/frontend-redesign.spec.ts` verifies behavior in a real browser.

No `App.tsx`, domain state, storage, service, asset, or dependency change is required.

## DOM Boundary

Add a decorative layer before the existing content:

```tsx
<div className="ff-empty-darkroom__film" aria-hidden="true">
  <div className="ff-empty-darkroom__film-track" data-testid="empty-darkroom-film-track" />
</div>
```

The root receives `.ff-empty-darkroom` and `data-drag-active`. `Workspace` receives `.ff-workspace` and mirrors its existing `isDragActive` prop to `data-drag-active`, avoiding new state or `App.tsx` wiring. The current content wrapper becomes `.ff-empty-darkroom__content` and remains above the film. The drag overlay keeps the highest local stacking order. Decorative elements remain pointer-inert and absent from the accessibility tree.

## Film Geometry

- The film viewport remains inside the section's current clipped bounds.
- One track extends at least one `360px` tile beyond both horizontal edges.
- A single CSS-rendered tile represents eight `45px` perforation pitches over a uniform abstract exposure field.
- Layered CSS backgrounds draw the dark film base, low-contrast exposure field, top/bottom perforations, and faint index marks. The exposure field must not use a horizontally segmented gradient because those segments render as unwanted vertical strips.
- All geometry belongs to the same track so one transform keeps every detail phase-aligned.
- The content sits over a restrained stationary tonal band only if browser screenshots show insufficient contrast; it must remain an unframed background treatment, not a nested card.

## Motion Contract

```css
@keyframes ff-empty-film-transport {
  to { transform: translate3d(-360px, 0, 0); }
}
```

- Duration: `36s` (`10px/s`).
- Timing: `linear`, iteration: `infinite`.
- Animated property: `transform` only.
- Direction: right-to-left.
- The track starts one tile before the viewport and repeats identically every `360px`, making the end state pixel-phase equivalent to the start.
- Do not animate background position, opacity, filter, blur, shadow, width, or layout coordinates.

## Interaction States

- Default: transport runs continuously while `EmptyDarkroom` is mounted.
- `.ff-empty-darkroom:hover` and `.ff-empty-darkroom:focus-within`: `animation-play-state: paused`.
- `[data-drag-active="true"]`: pause the track and reduce film opacity; do not change duration or transform, avoiding phase jumps.
- `prefers-reduced-motion: reduce`: `animation: none` and retain the complete starting composition.
- Adding a photo unmounts the empty state and its compositor layer without cleanup code.

## Responsive And Accessibility

- Keep the same physical tile and perceived speed across breakpoints; mobile sees fewer frames rather than denser geometry.
- Maintain current section minimum heights and rail clearances.
- The moving layer cannot receive focus, pointer events, roles, or labels.
- Existing upload button size, focus visibility, drag status, and content tokens remain unchanged.
- Do not communicate status or progress through motion.

## Performance

- One moving compositor track, no React state updates or JavaScript animation lifecycle.
- No new runtime dependency or fetched asset.
- Avoid promoting the entire empty-state panel; constrain any `will-change` hint to the track.
- Expected layout shift from the feature is zero.

## Testing Strategy

- Assert the track's computed animation name, duration, linear timing, and infinite iteration.
- Use `Element.getAnimations()` with controlled `currentTime` to prove transforms differ without sleep-based assertions.
- Assert hover/focus and drag states pause the track.
- Emulate reduced motion and assert no active animation while content remains visible.
- Verify upload removes the empty-state film and that `scrollWidth === innerWidth` at `390x844`.
- Capture deterministic visual QA with reduced motion or animations paused.

## Alternatives Rejected

- `background-position` keyframes: simpler markup but continuously repaint the background.
- Web Animations API: adds lifecycle and test surface without capabilities needed here.
- `requestAnimationFrame` or Canvas: adds resize, DPR, visibility, and cleanup complexity.
- Framer Motion or GSAP: unnecessary runtime and bundle cost for one linear decorative loop.
- Opposing rail directions or parallax: visually expressive but physically incoherent for one film strip.

## Rollback

Remove the decorative film DOM/classes and restore the current two static perforation bands. No persisted state or migration is involved.
