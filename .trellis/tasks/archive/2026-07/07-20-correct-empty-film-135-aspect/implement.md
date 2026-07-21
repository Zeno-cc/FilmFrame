# Implementation Plan: Correct empty film 135 frame aspect

## 1. Markup

- Render repeated, decorative exposure-frame elements inside `.ff-empty-darkroom__exposures`.
- Add a stable selector for browser geometry assertions.
- Keep the existing `aria-hidden` and pointer behavior.

## 2. Geometry And Material

- Convert the exposure container into a vertically centered, single-row grid.
- Set every frame to `342x228px` with an `18px` gap at all breakpoints, preserving the `360px` pitch.
- Move the existing restrained material gradient and inset shadow onto individual frames.
- Keep boundaries minimal and avoid recreating the removed wide vertical band.

## 3. Regression Coverage

- Assert a `1.5` frame ratio at `1440x1000` and `390x844`.
- Assert vertical centering and perforation-rail clearance.
- Retain existing animation, pause, reduced-motion, and page-overflow checks.

## 4. Validation

- Run the focused Playwright empty-darkroom tests.
- Capture desktop and mobile screenshots for visual inspection.
- Run `npm run typecheck` and `git diff --check` during iteration.
- Run the project quality gate after focused validation passes.

## Risk And Rollback Points

- The frame row must cover supported wide viewports; keep enough repeated frames to avoid an exposed track area.
- Frame pitch must stay exactly `360px` or the transport loop will reveal a phase jump.
- Do not alter the parent animation task's copy, interaction, or motion constants while tuning geometry.
