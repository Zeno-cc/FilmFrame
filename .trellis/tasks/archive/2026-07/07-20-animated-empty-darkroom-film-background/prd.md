# Animated empty darkroom film background

## Goal

Turn the empty darkroom's static film-like background into a cinematic, seamless horizontal negative-film transport that makes the workspace feel alive without reducing upload clarity or accessibility.

## Background

- The empty state is rendered by `components/workspace/EmptyDarkroom.tsx`.
- It currently draws static top and bottom perforation rails with repeating CSS gradients inside an overflow-hidden panel.
- The title, privacy copy, upload command, drag hint, and workflow steps are primary content and must remain stationary and readable.
- `isDragActive` owns the file-drop overlay and must remain visually authoritative.
- The project already centralizes keyframes and reduced-motion overrides in `styles/components.css`.

## Requirements

- Render one coherent moving negative behind the empty-state content: synchronized top/bottom perforations plus a central abstract exposure field.
- The exposure field uses one restrained neutral density with subtle material texture and film-index marks. Do not add vertical tonal bands, wide frame dividers, photographs, scenery, people, or image-like silhouettes.
- Move right-to-left at approximately `10px/s` with linear timing and a mathematically seamless loop. No reset snap, accumulated drift, layout shift, or page overflow is allowed.
- Animate decorative `aria-hidden`, pointer-inert layers only. Text, controls, focus rings, and workflow labels remain stationary above the film.
- Preserve the darkroom palette and keep exposure-frame contrast low enough that the amber upload action remains the dominant control.
- Pause the film on pointer hover, keyboard focus within the empty state, and active file dragging. Dim the paused film while the drag overlay is active.
- Under `prefers-reduced-motion: reduce`, render a deliberate static negative with no continuous translation.
- Implement the effect with CSS transform animation and existing React/CSS infrastructure. Add no animation library, runtime asset request, Canvas, WebGL, timer, animation frame loop, event listener, or per-frame React update.
- Mount the animation only with the empty state; adding photos removes it naturally with `EmptyDarkroom`.
- Preserve upload click, drag-and-drop, keyboard, screen-reader, desktop, tablet, and 390px mobile behavior.

## Acceptance Criteria

- [x] The empty darkroom shows a recognizable full negative moving right-to-left behind stationary content.
- [x] Perforations and index marks remain phase-aligned throughout the loop; the exposure field contains no repeated vertical tonal strip.
- [x] No seam or reset snap is visible over at least two complete cycles at desktop and 390px mobile widths.
- [x] Text, upload controls, focus rings, and workflow labels remain readable and interactive throughout the animation.
- [x] Hover and focus-within pause the transport without changing its current phase.
- [x] File dragging pauses and dims the film while the existing `松开以加入这一卷` overlay remains dominant.
- [x] `prefers-reduced-motion: reduce` produces a complete static negative and no active transport animation.
- [x] The implementation adds no runtime dependency and performs no per-frame JavaScript or React work.
- [x] The moving layer uses transform-only motion, stays clipped to the component, and does not increase document `scrollWidth`.
- [x] Playwright covers normal motion, interaction pause, reduced motion, drag-state precedence, empty-state unmounting, and mobile overflow.
- [x] Visual QA screenshots confirm contrast and no overlap at `1440x1000`, tablet, and `390x844` viewports.
- [x] `npm run check`, `npm run test:e2e`, and `git diff --check` pass.

## Out Of Scope

- Animating populated contact-sheet cards or generated film strips.
- Real photographs, film-stock artwork, network assets, or user-photo simulation in the empty background.
- User-configurable animation speed, direction, or theme.
- Audio, haptics, pointer parallax, Canvas, WebGL, Three.js, or a general animation framework.

## Technical Notes

- A `360px` visual tile equals eight existing `45px` perforation pitches. Translating exactly one tile over `36s` keeps the full negative geometry synchronized at the loop boundary.
- Browser background-tab throttling is sufficient; explicit page-visibility state is unnecessary for a CSS-only decorative animation.
