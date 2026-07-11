# Free Crop Editor Plan

1. Lock the transform contract with failing normalization and placement tests.
2. Implement the smallest shared geometry change and run focused tests.
3. Add a crop editor component whose draft is isolated from `ImageItem`.
4. Integrate commit/cancel with the existing debounced preview lifecycle.
5. Validate real interactions on desktop and mobile, then fix visual defects.
6. Update project documentation and run the complete verification suite.

## Risk controls

- Keep the renderer protocol structurally compatible; missing zoom defaults to 1.
- Store normalized coordinates rather than output pixels so preview/high and
  single/strip rendering remain deterministic.
- Commit only at interaction completion to avoid URL churn and stale generations.
- Reuse `createCoverPlacement`; do not duplicate main-thread/Worker crop math.
