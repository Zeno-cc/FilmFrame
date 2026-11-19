# Physical 135 default migration and rollback contract — 2026-11-11

## Implementation and verification status

The versioned migration is implemented in the working tree. New sessions use physical135 with the automatic spectral backend for validated stocks; an absent legacy edge field keeps legacy-template for existing envelopes. Explicit template rollback is persisted and works through the normal develop/export workflow. Pro 400H is excluded from full physical spectral selection at both the UI and the renderer preflight; geometry compatibility remains explicit.

Evidence collected:

- Three migration browser tests pass: new-session physical default and actual develop/rollback, old envelope preservation, and Pro 400H disabled full-spectral option plus direct preflight rejection.
- Full `npm run check` passes with 32 files / 267 unit tests, spectral parity, TypeScript and production build.
- Legacy frontend regression is explicit about its `legacy-template + legacy` path: **36/36** tests pass, including template sprocket pixels, Portra 160, ColorPlus and long strips. This verifies rollback rather than merely inspecting the setting.
- Representative visual/performance evidence is recorded in `visual-performance-acceptance.md`, including GPU release/dispose counters.
- Complete serial browser regression now passes **70/70**, including all four migration tests, physical 12-test production coverage, explicit legacy template workflows, rotation, batch, HEIC and Firefox/WebKit compatibility. Provenance is 7/7; `git diff --check` passes.

## Independent migration verdict — 2026-11-11: GO (technical scope only)

The independent reviewer confirmed that both legacy-data blockers are closed. Old preference envelopes missing the new fields restore legacy-template + legacy; legacy recipes restore their original real-135 single/strip behavior. Explicit physical/spectral choices in newer recipes are retained. The reviewer verified `npm run check`, all four migration tests, provenance 7/7 and `git diff --check`, and found no new migration blocker.

This GO covers the current candidate's default migration, old-data compatibility and settings rollback. It is **not** public distribution clearance, native SpektraLab 1:1 imaging parity, full-stock imaging completion or a cross-device performance guarantee. The distribution blockers in `ops/provenance/README.md` remain. Full native halation/spatial/DIR behavior, B&W/slide/CineStill-specific imaging and Pro 400H physical spectral processing remain limited or rejected as documented. CPU timing is not a universal interactive-performance promise; physical iPhone/Android, GPU/driver/context-loss and sustained-memory smoke remain separate release checks.



## Decision

Promote the reviewed physical 135 renderer for new FilmFrame sessions without erasing existing users' choices. Physical 135 is the new default edge renderer for real-135-capable stocks. Legacy templates remain a first-class, explicit setting and are not deleted.

This migration changes the **edge renderer default only**. It does not silently enable spectral imaging, change a film's resource identity or call geometry compatibility a complete spectral negative pipeline.

## Versioned preferences

The persisted `filmFrame.preferences.v1` envelope remains readable. A separate `renderPreferenceVersion` value is introduced to distinguish an absent legacy preference envelope from an already migrated one:

- Missing old envelope: start with the physical default and mark the current render-preference version.
- Existing old envelope without `renderPreferenceVersion`: preserve the saved `edgeRenderMode`; if that field is absent, preserve `legacy-template`. Missing historical `imagingMode` is also restored as `legacy`, not inherited from the new spectral default. This preserves the old single-frame and strip workflows, not just the visible setting.
- Recipes are applied with the same legacy semantics for fields absent from their saved data. A real-135 recipe without the new mode fields restores `legacy-template + legacy`; explicit physical/spectral choices in newer recipes remain intact.
- Current envelope: use the normalized saved `edgeRenderMode`, with physical135 as the new-session fallback.
- Explicit physical135/legacy-template choices always win over a later default. `mergeSettings` does not infer a stock's spectral identity from the edge default.

`edgeRenderMode` is persisted in the existing whitelist. The migration version is an envelope-level decision and need not enter render-result signatures; the actual edge mode already participates in them.

## Capability boundaries

- Exact validated color-negative resources: physical135 may use spectral negative → print when the user explicitly selects spectral mode. New default `imagingMode: spectral` is used only for these supported, hole-density-validated stocks, while `auto` retains CPU equivalence.
- Fuji Pro 400H: although an exact spectral aperture resource exists, its physical base-canceling residual is about 0.971 and exceeds the production 0.5 boundary. Keep it on the legacy-template default; explicit physical+spectral remains rejected. Do not ship it as full physical spectral support.
- B&W, slide, CineStill and missing exact profiles: no full spectral physical promotion. Explicit physical+legacy remains geometry/backing compatibility only. Default may use that explicitly labeled compatibility only when the UI does not claim spectral development.
- `frameRenderMode: classic` remains classic border, not a physical 135 gate.
- Choosing a stock never substitutes Portra or another stock's film/paper/DX resource.

## Rollback

- Selecting `真实 135 贴图` (`legacy-template`) restores the legacy edge renderer with the user's current imaging mode. It requires no migration, asset deletion or re-download.
- Existing legacy settings/recipes keep their exact choices. Recipes are not migrated in the background.
- `重置` starts a new-session physical default, while old stored envelopes remain legacy until the user explicitly selects physical135 or resets.
- Worker failure retries once on main with the identical physical plan; cancellation is terminal. GPU failure uses the equivalent CPU physical pipeline or an explicit error, never a silent legacy-template rollback.

## Validation before/after switch

1. Unit: version/envelope migration, legacy preservation, explicit rollback, unsupported Pro 400H default and unchanged resource identity.
2. Browser: new session physical default; old envelope stays legacy; explicit template rollback renders; stock-specific spectral and geometry compatibility remain distinct.
3. Full stock single/strip matrix, representative visual review, Worker/main, both-angle seams, actual Worker DX and zero-allocation budget paths.
4. `npm run check`, full Playwright, provenance, `git diff --check`, then independent migration review.
5. No commit/push/public deployment is implied by switching the local default. Public distribution rights remain separately blocked.

## Stock rollout beyond the current 135 increment

The pinned spectral registry is already source-bound and contains all currently admissible exact resources. Adding more catalog names must come with an exact validated film/paper identity, source/digest and rights evidence; no fake DX or borrowed spectral profile. B&W, slide, CineStill spatial behavior and full native halation/DIR remain separately scoped capabilities, not silently “completed” by this default change.
