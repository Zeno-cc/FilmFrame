# Correct empty film 135 frame aspect

## Goal

Make every decorative exposure window in the animated empty-darkroom film read as a real horizontal 135 frame: 36 mm by 24 mm, or exactly 3:2. The correction must preserve the existing film transport and empty-state interaction.

## Background

- The current exposure field is `360px` wide by the available height between the perforation rails. At `1440x1000` it measures approximately `360x352` (`1.02:1`); at `390x844` it measures approximately `360x327.5` (`1.10:1`).
- A horizontal 135 exposure is `36x24 mm`, so its width-to-height ratio is `1.5:1`.
- The full film strip includes perforations and rebate. Its overall aspect ratio is not 3:2 and must not be treated as the exposure frame.

## Requirements

- R1. Each visible exposure window must use a stable `342x228px` geometry at desktop and mobile breakpoints. An `18px` inter-frame rebate completes the existing `360px` transport pitch.
- R2. Exposure windows must be vertically centered between the top and bottom perforation rails without touching either rail.
- R3. The exposure treatment must remain abstract, low contrast, and free of the previously removed wide vertical tonal strip.
- R4. The existing `360px` right-to-left loop, `36s` duration, pause states, reduced-motion behavior, and drag behavior must remain unchanged.
- R5. The decorative layer must remain pointer-inert, hidden from assistive technology, and must not introduce horizontal page overflow.

## Technical Notes

- Keep the correction local to `EmptyDarkroom` markup, component CSS, and browser regression coverage.
- Use an explicit frame element that browser tests can measure rather than inferring aspect ratio from a background image declaration.
- Keep frame repetition phase-aligned to the existing `360px` animation tile. The tile models an approximately 38 mm eight-perforation pitch; the `342px` window models 36 mm of that pitch.

## Out Of Scope

- Changing the whole film strip or empty-state panel to 3:2.
- Changing animation direction, speed, easing, loop distance, or perforation pitch.
- Changing copy, upload behavior, drag behavior, or empty-state layout.
- Changing real-135 renderers, overlay assets, film templates, export output, or user settings.
- Adding an animation library, Canvas renderer, JavaScript timer, or fetched image asset.

## Acceptance Criteria

- [x] AC1. A rendered exposure frame has a computed width-to-height ratio of `1.5` at `1440x1000` and `390x844`.
- [x] AC2. Exposure frames are vertically centered within the film track and do not overlap either `24px` perforation rail.
- [x] AC3. The exposure surface contains no wide vertical tonal band and remains visually subordinate to the upload content.
- [x] AC4. The transport still translates exactly `-360px` over `36s`, pauses on hover/focus/drag, and is disabled by reduced-motion preference.
- [x] AC5. The empty state remains usable at desktop and mobile sizes with no horizontal document overflow.
- [x] AC6. Targeted E2E coverage, type checking, and diff whitespace validation pass.
