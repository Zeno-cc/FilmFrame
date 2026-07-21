# Reconnect empty darkroom film strip

## Goal

Redesign the empty darkroom as one physically coherent horizontal 135 negative, so its upper and lower perforation rails visibly connect to the same film base and central exposure frames while the upload experience remains calm and clear.

## Background

- The current empty state positions perforation rails at the outer edges of a full-height animated track while the `342x228px` exposure frames float in the middle. At desktop height this leaves roughly `72px` of bare background between each rail and the frames, so the three layers look detached.
- A horizontal 135 exposure is `36x24 mm` (`3:2`). The existing `342px` frame plus `18px` rebate matches a `360px` visual transport pitch, representing the approximate 38 mm eight-perforation frame advance.
- The existing motion contract is transform-only: one track moves `-360px` over `36s`, pauses on hover/focus/drag, and is disabled for reduced motion.

## Requirements

- R1. Render the rails and exposure row inside one `332px`-high negative body placed above the quiet information band: `52px` upper rail, `228px` central frame region, and `52px` lower rail.
- R2. Preserve the existing `342x228px` (`3:2`) frames, `18px` inter-frame rebate, `360px` animation period, direction, speed, and interaction states.
- R3. Use one shared acetate material across the entire negative. Sprocket holes must read as horizontal cutouts within that material, not lighter floating blocks.
- R4. Keep only the icon, title, primary upload command, and short drag hint over the exposure region. Place privacy copy and the three-step workflow below the negative as an unframed quiet information band.
- R5. Keep stationary text and controls readable, keyboard-accessible, and above the decorative film without adding a nested card.
- R6. Preserve local-only image processing, drag-and-drop behavior, and no-horizontal-overflow behavior.
- R7. Keep the redesign local to the empty state; do not alter generated real-135 assets, the populated contact sheet, settings, or photo processing.

## Acceptance Criteria

- [x] AC1. At desktop and `390px` mobile widths, a measured negative body is `332px` high and each exposure frame is exactly `3:2`.
- [x] AC2. The top and bottom rails directly meet the central exposure region with no detached vertical gap; their sprocket holes are visibly horizontal cutouts.
- [x] AC3. Visual QA shows one continuous 135 strip, with a balanced upload focal point and privacy/workflow information positioned outside the exposure frames.
- [x] AC4. The transport retains `-360px / 36s / linear / infinite`, and existing hover, focus, drag, and reduced-motion behavior continues to work.
- [x] AC5. Desktop, tablet, and `390px` mobile views have no text overlap, no document horizontal overflow, and no console errors.
- [x] AC6. Focused and full browser tests, type checking, production build, and `git diff --check` pass.

## Out Of Scope

- Changing copy semantics, upload workflow, drag-and-drop semantics, or settings.
- Adding image assets, an animation framework, Canvas, a JavaScript timer, or per-frame state updates.
- Altering film-renderer geometry, real-135 templates, film-stock appearance, exports, or populated gallery layout.
