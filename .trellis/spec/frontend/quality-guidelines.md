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
