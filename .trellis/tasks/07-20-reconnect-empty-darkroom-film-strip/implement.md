# Implementation Plan: Reconnect empty darkroom film strip

## 1. Continuous Negative Structure

- Add top and bottom decorative rail elements inside the existing moving track.
- Keep the repeated exposure frame row between them and preserve existing stable test identifiers.
- Split the content into the compact upload focal group and below-strip information group without changing commands or copy.

## 2. Geometry And Material

- Place a fixed `332px` negative body above the information band with a non-animated parent.
- Set rail heights to `52px` and place the `228px` exposure row directly between them.
- Give the track one continuous acetate base and draw horizontal sprocket cutouts inside each rail.
- Remove the large empty space that currently separates rails from frames.

## 3. Regression Coverage

- Measure full negative, rail, and frame geometry at desktop and mobile widths.
- Assert rail/frame contact, horizontal sprocket dimensions, and `1.5` frame ratio.
- Retain existing animation, pause, reduced-motion, unmount, drag, and overflow coverage.

## 4. Visual And Quality Gates

- Capture paused or reduced-motion screenshots at desktop, tablet, and mobile widths.
- Inspect a live mid-cycle phase for rail/frame alignment and loop continuity.
- Run focused Playwright tests, `npm run check`, `npm run test:e2e`, and `git diff --check`.

## Rollback Points

- Keep the animation keyframe, duration, and loop distance unchanged.
- Do not change `Workspace` drag state wiring.
- If the negative competes with content, reduce decorative opacity before changing the content hierarchy.
