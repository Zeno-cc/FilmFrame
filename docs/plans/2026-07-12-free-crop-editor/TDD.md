# Free Crop Editor TDD

## Pure geometry tests

1. Default and legacy transforms normalize to centered `zoom = 1` output.
2. Finite continuous focus values are accepted and clamped to `[0, 1]`.
3. Zoom is accepted and clamped to `[1, 3]`; NaN/Infinity use the default.
4. Stable keys include pan and zoom and quantize pointer floating-point noise.
5. Continuous focus rotates correctly through all four quarter turns.
6. Zoom multiplies the minimum cover scale while preserving the focus point.
7. All focus/zoom/rotation/auto-rotation combinations cover the aperture.

## Integration tests

1. Image and strip signatures change for pan or zoom.
2. Worker client messages preserve continuous focus and zoom.
3. Existing transform payloads without zoom remain valid.

## Browser acceptance

1. Open a single preview and enter `调整构图`.
2. Drag the crop surface and confirm position values and preview change.
3. Change zoom, rotate, reset, cancel, and commit.
4. Confirm the main preview renderer is not scheduled during draft drag.
5. Confirm keyboard arrows and Shift+arrows move the draft.
6. Confirm 390x844 and desktop layouts do not overlap or overflow.
7. Confirm no new browser console errors.
