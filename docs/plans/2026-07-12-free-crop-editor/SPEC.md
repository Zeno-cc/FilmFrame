# Free Crop Editor Specification

## Problem

The current 3x3 focus control exposes nine unlabeled buttons. It only selects
discrete cover offsets and has no effect when the source already fits the film
aperture. Users cannot predict the crop or make small compositional changes.

## Goal

Replace the focus grid with a direct crop editor where the film aperture stays
fixed and the user moves and scales the photo. The editor must use the same
transform semantics as main-thread, Worker, single-image, and strip rendering.

## Transform contract

- `focusX` and `focusY` are finite continuous values in `[0, 1]`.
- `zoom` is a finite multiplier in `[1, 3]` over the minimum cover scale.
- `quarterTurns` remains `0 | 1 | 2 | 3`.
- Missing `zoom` is normalized to `1`; old `0 | 0.5 | 1` anchors remain valid.
- Focus coordinates are expressed in the user-rotated visible coordinate space.
- Internal portrait auto-rotation maps focus coordinates but is not exposed as a
  separate user transform.
- Every renderer clips to the aperture and must never expose blank pixels.

## User experience

- The nine focus buttons are removed.
- Opening `调整构图` shows a fixed crop aperture with the source photo beneath
  a rule-of-thirds guide.
- Pointer or one-finger drag moves the photo. A zoom slider provides 100%-300%
  scaling; mouse wheel zoom preserves the image point under the cursor. Keyboard
  arrow keys move the photo; Shift uses a larger step.
- Rotate and reset are explicit icon commands with accessible names.
- `取消` discards the draft. `完成` commits one transform update and starts the
  debounced film preview render.
- `完成并冲洗` remains the explicit high-quality artifact action.
- The crop viewport and controls stay in normal layout flow and never overlap.

## Non-goals

- Variable crop ratios, arbitrary-angle rotation, perspective correction,
  subject detection, crop presets, and undo history.
- Persisting crop data outside the current image session.

## Acceptance criteria

- A user can make a visible crop even when the old focus grid had no effect.
- Old transforms render identically at `zoom = 1`.
- Continuous pan and zoom affect render signatures and stale prior artifacts.
- Dragging updates only local draft state; the expensive renderer runs after
  commit, not on every pointer move.
- Classic/real135, single/strip, Worker/main-thread paths share the geometry.
- Desktop and 390x844 mobile layouts have no crop/control overlap or horizontal
  overflow; controls have 44px touch targets.
- The crop editor is usable by keyboard and has named controls.
