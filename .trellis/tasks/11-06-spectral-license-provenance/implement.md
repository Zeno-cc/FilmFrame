# Implementation: GPL and asset provenance

- [x] Read the approved PRD/design, parent licensing research and existing third-party notices.
- [x] Pin GPL/CC source texts and construct the versioned provenance schema/manifest with unresolved release-blocking statuses.
- [x] Inventory current FilmFrame templates/masks/fonts/icons/images and record only evidence actually available; prepare owner decisions for unclear rights.
- [x] Document corresponding-source, modification, attribution and dependency/license boundaries without making legal guarantees.
- [x] Add focused manifest validation and tests; integrate release checks only when the manifest schema and behavior are proven.
- [x] Merge prototype-specific imported-resource provenance after its agent reports results.
- [x] Run focused checks, `npm run check` if project scripts/docs change, and `git diff --check`; report unresolved distribution blockers plainly.
- [x] Do not implement spectral algorithms or modify existing film images; no commit/push/deploy.

## Implementation Evidence — 2026-11-06

- Added `ops/provenance/manifest.json` with nine source groups, immutable revisions and 44 local file digests, plus upstream GPL/CC and installed `heic-to` license texts. The unresolved spectral-constants entry explicitly has no imported local bytes.
- Added `ops/provenance/asset-inventory.md`: templates are recorded as user-provided generated artwork normalized by FilmFrame; sprocket masks are derived from those templates. Original generator/source/permission remains an owner-review blocker.
- Added `ops/provenance/README.md` and `PROFILE-CHANGELOG.md` with release/source/attribution obligations. No root project license is claimed while historical rights remain unresolved.
- Added `npm run test:provenance` and `npm run verify:provenance`; `check:release` prints blockers while its technical commands continue. `ops/release/README.md` documents mandatory human clearance before distribution.
- Verification: seven provenance tests and 16 release-contract tests pass; `npm run check` passes 204 Vitest tests, strict typecheck and production build; `git diff --check` passes. Transient failures in the new symlink regression fixture were corrected and rerun, not suppressed.
- Independent review hardened nested schema/path validation and rejected external files reached through symlinked parent directories. Corrected the template pinned revision to `33f6b2410638753c9302db8d135d437d0a1c131e`, whose bytes match every listed current template; preserved earlier introduction/color/HP5 correction evidence.
- The full `check:release` attempt passed its pre-E2E stages but failed all 46 browser launches because the installed Playwright chromium/firefox/webkit executables are absent. It did not run later release checks and is not a successful release gate. `check:release` intentionally reports unresolved rights without substituting a technical exit code for human clearance; `ops/release/README.md` explicitly forbids tagging until those blockers are resolved.
- Distribution remains blocked on original generated-film rights, layer-mask provenance, payment-image permission, spectral-constant terms, project corresponding-source readiness, `heic-to`/dependency distribution review and an eventual in-app credits surface. This task is not marked complete until prototype inputs are merged and independent review finishes.

## Prototype Provenance Merge — 2026-11-06

- Merged the prototype's pinned Portra 400/Endura profiles, derived `portra-setup.json`, four upstream baselines/eight intermediate arrays, GPL/CC and colour-science BSD notices. The manifest now has 12 source groups; `npm run test:provenance` (7 tests) and `npm run verify:provenance` pass with blockers still visible.
- `services/spectral/NOTICE.md` and `CHANGELOG.md` distinguish unmodified CC BY-SA profiles from unresolved Hanatos/KG3-derived tables. `portra-setup-derived-tables` explicitly remains a public-distribution blocker; no spectral data is declared permissive or CC by assumption.
- The fixture manifest records controlled Python 3.13.12 / NumPy 2.4.2 / SciPy 1.17.1 / colour-science 0.4.6 evidence: film raw and negative density pass, green print passes with OkLch, but gray print has 48 violations and maxAbs 0.007130636018971126. This is an unresolved numerical gate, not hidden by the provenance validator.
- Installed Playwright Chromium, Firefox and WebKit (about 1.1 GiB outside the repository). Two full E2E attempts each passed 44/46 with varying timing-sensitive Chromium failures; Firefox/WebKit main flows passed. The suite is not yet consistently green and no production renderer was changed to suppress it.
