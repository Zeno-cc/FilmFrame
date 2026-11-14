# Design: complete physical 135 replacement

## Architectural Boundary

Keep FilmFrame's React session, local photos, Worker facade, crop transforms and Blob result contract. Introduce a physical-135 planning/rendering domain below those boundaries rather than translating the native Metal engine or placing another border over a finished spectral photograph.

```text
FilmSettings + stable roll/image identity + body/frame seeds
  -> immutable PhysicalFilmPlan (film-mm, no photo bytes)
  -> gate/crop placement + expanded film exposure
  -> imprints/fog/leak exposure + spatial development
  -> film density + film-presence blending with stock-specific base-canceling hole CMY
  -> supported print/scan stage or explicit compatibility route
  -> backing/cut-wall/scan-light composition
  -> output orientation + JPEG/PNG Blob + byteSize
```

No legacy Gold RGB transform, template PNG, tint mask, aperture-only grain or duplicated markings is applied to the physical result. Legacy routes remain separate and are not intermediate fallbacks for a requested physical look.

## Physical Plan

Define immutable typed structures (names illustrative, finalize during implementation):

```ts
type FilmBacking = 'black' | 'open';
interface PhysicalFilmPlan {
  format: '135-full';
  pxPerMm: number;
  filmRectMm: Rect;
  gateRectMm: Rect;
  perforations: readonly PerforationPlan[];
  imprints: readonly ImprintPlan[];
  body: BodyVariation;
  frame: FrameVariation;
  backing: FilmBacking;
  fog: number;
  leaks: number;
}

function createPhysicalFilmPlan(input: PhysicalFilmPlanInput): PhysicalFilmPlan;
```

- Coordinates remain in millimetres until rasterization. All orientation transpositions are deliberate and tested.
- Gate/film/advance and optical values carry measured/nominal/artistic provenance; upstream claims are not silently treated as independent measurements.
- Crop uses the current `RenderTransform`/cover/auto-rotation contract within the gate. The output is the expanded scan, not another border applied to a cropped photo.
- A continuous strip evaluates the same advance/perforation grid over a shared film span; a frame's physical identity is stable across single/strip rendering at equivalent scale.

## Seed and Settings Identity

- Separate body and frame/advance/scan seed domains. Body seed controls persistent gate/registration characteristics; frame seed controls frame-level weave, tilt, fog/leak realization and small scan/hole variations.
- Derive reproducible seed material from normalized settings plus stable session roll/image IDs and roll position. Do not send or expose file paths, use wall-clock time or regenerate from render order.
- New settings have normalized finite ranges, defaults and versioned migration; participate in preferences, recipes, Worker payloads and `createRenderSettingsKey`/ordered-strip keys.
- “Another body” changes only body seed; “another frame” changes only the selected frame's seed. Neither changes selection, crop or numbering.
- Use independent deterministic streams for independent features so adding fog does not reshuffle gate geometry or perforations.

## Rendering Backends

### Float exposure/development

Use the validated spectral resource/backend where a supported color-negative stock is selected. Expand exposure beyond the aperture before film development so edge exposure/imprints can affect the appropriate development stages. Retain floating density in CPU arrays/GPU textures until printing/scanning; never use 8-bit Canvas as an intermediate negative.

The existing aperture adapter cannot simply be called around the whole border. Split its reusable stage orchestration from the aperture-specific canvas adapter and introduce a physical-frame adapter that accepts the expanded film plan and film-presence mask.

### Geometry and scan composition

Generate shared geometry/coverage/imprint plans once per physical frame. Canvas2D may rasterize bounded text/coverage masks and compose the final scan/backing on main and Offscreen Worker contexts. A separate WebGL2 scratch surface handles floating exposure/spatial passes where available, with a numerically equivalent CPU path.

Perforations are absent film, not black pixels. Before paper exposure, blend developed CMY with a stock-specific base-canceling hole CMY by film-presence coverage. Derive/validate this solution from the film spectral response and paper receiver; degenerate/unvalidated solutions fail explicitly. This preserves clear-light printing through the hole and is not an alpha cutout. Backing/cut-wall light is composited after print/scan and never fed back through development. Gate softness follows the declared optical model, not an arbitrary opaque shadow.

### Approximation labels

If an initial spatial/fog implementation is not spectrally calibrated, identify it as an explicit approximation in research/UI, keep leaks off by default and do not claim native parity. Unsupported B&W, positive and CineStill-specific spatial behavior retain their separate blockers; no stock relabeling.

## Performance and Lifecycle

- Compute logical output/expanded-canvas dimensions and float/GPU/Canvas scratch budgets before Worker or texture allocation. Strip budgets account for shared surfaces and per-frame resources rather than assuming one legacy template per frame.
- Keep source/negative/work textures bounded and reuse compatible surfaces where correct. Measure first render, reprint, scan/readback, full production export and peak logical allocation separately; native GPU timings do not transfer.
- Every CPU/GPU/bitmap/canvas resource has an owner and success/error/dispose cleanup. Context loss cannot silently select a template; CPU physical fallback must preserve the exact requested plan or return an actionable error.
- Main/Worker results retain existing cancellation, generation and Object URL rules. No remote processing, telemetry, runtime CDN or native executable.

## Migration and Rollback

- Keep edge renderer and imaging mode orthogonal: `frameRenderMode` retains its existing classic-vs-real135 compatibility meaning and `imagingMode` retains legacy-vs-spectral meaning. Add a distinct physical-vs-legacy-template edge setting with normalized migration; do not silently reinterpret old fields.
- Explicit matrix: legacy template + legacy color = existing; physical edge + legacy color = geometry/backing-only approximation; physical edge + spectral negative = full supported color-negative route; classic border = current classic behavior. Reject unsupported combinations before allocation and never silently flip either mode.
- Full physical/spectral claims apply only to validated supported color-negative stocks. B&W, slide/positive, missing exact profiles and CineStill-specific spatial halation remain classic or explicitly labeled compatibility.
- Stage A/B/C development stays behind an explicit experimental physical-edge mode with legacy real-135 default. Compare identical photos/crops/seeds and zero unrelated grain.
- Stage D promotes full-frame 135 to the real-135 default only after geometry, production lifecycle, measured performance and human visual approval. Preserve an explicit classic/compatibility route and a versioned settings migration.
- Do not remove old assets or code as part of early implementation. Once the switch is validated, unused duplicate paths may be retired in a separate scoped cleanup with provenance intact.
- If physical rendering fails validation, retain legacy default and ship no forced migration. No commit/push/public distribution is implied by planning or technical completion.

## Verification Strategy

1. Pure geometry and deterministic-plan unit tests: gate/advance/holes, orientation, seed domains, normalized settings and identity.
2. Float-stage tests: expanded exposure/imprint/fog domains, base-canceling hole CMY, film-presence blending, finite output, no 8-bit intermediate density and CPU/GPU tolerances. Film-present pixels must remain unchanged, absent film must yield the expected clear paper-receiver exposure, and backing cannot change negative/paper input.
3. Real-renderer tests: main/Worker, forced fallback, single/strip, crop/rotation, JPEG/PNG, cancellation/stale URLs and bounded resources.
4. Visual review: fit/100%/200%, bright/dark photographs, multiple bodies/frames, representative stock families and one/four/five-frame strips. Inspect continuous-film coherence, edge softness, markings and absence of double effects.
5. Full `npm run check`, `npm run test:e2e`, `npm run test:provenance`, `git diff --check` and independent `trellis-check`; record go/no-go evidence and all approximation boundaries.
