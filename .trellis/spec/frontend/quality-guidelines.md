# Quality Guidelines

> Verification and review standards used by FilmFrame.

## Required Checks

Run before committing frontend behavior changes:

```bash
npm run check
npm run test:e2e
git diff --check
```

`npm run check` runs Vitest, strict TypeScript checking, and the production Vite build. Playwright covers the local browser workflow separately.

## Required Patterns

- Add focused Vitest coverage for pure services, state transitions, normalization, budgets, and routing policy.
- Add or update Playwright coverage for user-facing workflows, responsive behavior, dialogs/focus, and browser rendering integration.
- Verify image/Canvas changes in a real browser. Use structural assertions and screenshots where randomized grain makes exact pixel snapshots unsuitable.
- Preserve local-only privacy: no image upload, telemetry, or external processing path.
- Check resource ownership for every new Object URL, timer, Worker request, or event listener.
- Check desktop, tablet, and 390px mobile behavior for layout changes.

### Flattened Real-135 Template Assets

- Every flattened real-135 template must be an RGB `1307x1203` PNG with a fully black aperture at `x=92`, `y=211`, `width=1123`, `height=800`.
- Measure each generated source image's largest continuous black aperture before normalizing it. Source apertures differ by model, so never reuse another stock's crop coordinates.
- Normalize a source template by splitting it around the measured aperture into a 3x3 grid, resizing the edge and center regions independently to `92/1123/92` columns and `211/800/192` rows, then stitching the regions together. A global affine resize can introduce black padding at the film edges.
- Validate the result before registration: the aperture pixels are all black, all four outer edges retain non-black film material, and the asset renders in a browser for both single and strip workflows.

## Accessibility Review

- Use role/name selectors in E2E tests; this verifies both interaction and accessible naming.
- Dialogs must trap focus, close on Escape, and restore focus.
- Controls must remain keyboard and touch operable without horizontal overflow.
- Respect reduced motion and keep status announcements non-blocking.

## Forbidden Patterns

- No destructive Git cleanup of an existing dirty worktree.
- No CDN/runtime dependency for core libraries or user image processing.
- No silent image deletion, downscaling, compression, or selection changes when admission blocks a batch.
- No direct download of stale artifacts.
- No expensive renderer call on every crop pointer move.
- No duplicated render policy in UI components and Worker code without a tested shared contract.

## Review Checklist

- Does the change preserve `ImageItem` ordering, identity, inclusion, and artifact ownership?
- Are current/stale signatures updated for every new output-affecting field?
- Are Worker and main-thread routes intentionally aligned or explicitly gated?
- Are settings normalized in UI, persistence, and rendering boundaries?
- Do overlay assets keep the `1307x1203` canvas and `92/211/1123/800` aperture contract?
- Are new runtime files included in the Vite build and intermediate assets excluded?
- Are errors actionable without destroying user data?
- Are project docs updated when a stable behavior or invariant changes?
