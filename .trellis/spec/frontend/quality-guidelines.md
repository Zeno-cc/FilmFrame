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
- Compare the outermost rows and columns with several inset bands. If a generated source contains an isolated canvas halo, replace only that outer band from mirrored valid film pixels; never rescale the full template, and restore the aperture to exact black afterward.
- When compositing a flattened template, clip all four overlay bands exactly to the aperture boundary. Never overlap opaque black aperture pixels onto the photo to hide seams; even a small inset becomes a visible black frame after scaling.
- Flattened templates use one compact dynamic frame number in the shared top-center perforation gap. Do not reuse the Gold-only bottom number or `A` suffix because stock-specific labels occupy those areas. The layered Gold path keeps its dedicated markings.
- Validate the result before registration: the aperture pixels are all black, all four outer edges retain non-black film material, and the asset renders in a browser for both single and strip workflows.

### Scenario: Optional Frame-Number Color Override

#### 1. Scope / Trigger

Apply this contract whenever dynamic frame-number color behavior changes across settings UI, persistence, render identity, main-thread Canvas rendering, or Worker rendering.

#### 2. Signatures

```ts
interface FilmSettings {
  frameNumberColor?: string;
}

function getFrameNumberColor(
  settings: Pick<FilmSettings, 'frameNumberColor'>,
  fallback: string,
): string;
```

#### 3. Contracts

- `frameNumberColor` is an optional six-digit HEX override stored as lowercase `#rrggbb`.
- An absent value preserves each renderer's previous effective frame-number color.
- An explicit value affects only application-generated frame numbers and suffixes; it must not recolor stock labels, dates, DX blocks, safety-film labels, or pixels baked into PNG templates.
- The setting must round-trip through preferences and recipes, participate in `createRenderSettingsKey`, and travel unchanged in Worker request settings.
- Film-stock changes must preserve an explicit override.

#### 4. Validation & Error Matrix

- Valid `#RRGGBB` -> normalize to lowercase and persist.
- Missing value -> omit the override and use the renderer-provided fallback.
- Invalid stored string, short HEX, or non-string -> ignore it without replacing the fallback.
- Changed explicit value -> mark existing single and strip artifacts stale.

#### 5. Good / Base / Bad Cases

- Good: `#44CC88` becomes `#44cc88` and colors dynamic numbers in main-thread and Worker output.
- Base: no override keeps the existing stock/text amber without changing current users' output.
- Bad: applying the override as the shared Canvas `fillStyle` recolors `KODAK`, `SAFETY FILM`, or DX blocks.

#### 6. Tests Required

- Settings tests assert valid normalization, invalid-value rejection, and preference/recipe round trips.
- Render-result tests assert that changing only `frameNumberColor` changes single and ordered-strip keys.
- Frame-number tests assert explicit override and fallback resolution.
- Worker tests assert the field is preserved in the request payload.
- Playwright asserts desktop/mobile availability, cross-stock persistence, and successful single/strip rendering after selection.

#### 7. Wrong vs Correct

```ts
// Wrong: leaks the override into unrelated markings.
ctx.fillStyle = settings.frameNumberColor ?? settings.textColor;
drawBrandAndFrameNumber(ctx);

// Correct: scope the override to dynamic frame-number glyphs.
drawBrand(ctx);
ctx.save();
ctx.fillStyle = getFrameNumberColor(settings, settings.textColor);
drawFrameNumber(ctx);
ctx.restore();
```

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
