# Migrate negative film stocks to shared spectral backends

## Goal

Generalize the validated Portra spectral pipeline into data-driven film/paper resources, replace supported FilmFrame negative looks, add supported missing negative stocks, and validate each migration with source-specific evidence.

## Scope and Existing Proof

The GPU WebGL2 backend and real FilmFrame Portra single-frame integration are working. Preserve their shared spectral backend, local-only processing, template geometry, CPU fallback, settings identity and export behavior. This task generalizes the fixed Portra resource setup rather than duplicating per-stock shader algorithms.

## Migration Requirements

- R1: Create a versioned spectral stock registry with exact upstream film/paper IDs, default filter/viewing/reference configuration, source revision, digests, licenses and migration status.
- R2: Replace Portra 160/400/800, Gold 200, Ektar 100 and Ultramax 400 aperture color approximations with validated spectral setups while preserving existing templates/borders.
- R3: Add Fujifilm C200, X-Tra 400 and Pro 400H as new FilmFrame stocks with correct Fuji paper/filter configuration. X-Tra is not a Superia 400 replacement.
- R4: Generalize viewing/reference illuminant handling for Vision3 50D/200T/250D/500T and their Kodak 2383 print destination, then add these as distinct new stocks only after their own numerical checks pass.
- R5: Keep exact-look blockers for ColorPlus, Pro Image, Superia 400, T-Max 400 and P3200; do not substitute other brands/models. B&W and CineStill's distinct halation are separate work, not a color-pipeline relabel.
- R6: Do not treat Ektacolor Edge as a camera negative or treat slide films as negative pipeline inputs.
- R7: Update source notices/profile derivative changelog and the global provenance manifest for every imported/derived setup without declaring unresolved data or historic assets cleared.

## Acceptance Criteria

- [x] Each supported migrated stock has generated resources, source digests, validated film/paper/output values and a documented replace/add result.
- [x] All six existing duplicate negative stocks render through the shared spectral backend with their existing template and correct settings/result identity.
- [x] Fuji C200/X-Tra/Pro 400H are registered as new stocks and render with correct Fuji paper/filter data.
- [x] Vision3 additions have explicit K75P viewing and tungsten-reference support or remain explicitly blocked with evidence.
- [x] CPU/GPU parity on each supported stock family, real FilmFrame single-frame rendering, Worker/main fallback, persistence/recipes and JPEG/PNG export pass.
- [x] No exact-look blocker is presented as supported, and no unlicensed redistribution is implied.
- [x] Final `npm run check`, focused browser checks, provenance checks and independent review are complete.

## Final Acceptance — 2026-11-07

- Independent `trellis-check` initially found Gold layered-path bypass and spectral Worker-strip async/unsupported-path defects. Both were fixed and independently re-reviewed closed with no new blockers. See `research/independent-review.md`.
- All 13 supported stocks have real FilmFrame CPU single-frame render records. Gold's special layered route additionally has production hardware-GPU/CPU and Worker/main aperture parity, zero grain and PNG encoding. Isolated GPU reports cover all stock resources; neither fact is inflated into universal full-frame/1080p production parity.
- Final coordinator validation: 217 unit tests, 120 stock/stage comparisons, 50 browser tests, 7 provenance tests, typecheck, production build and whitespace check passed.
- Technical acceptance is restricted to opt-in real-135 single-frame processing. Legacy remains the default, unsupported spectral strips fail explicitly before Worker creation, and all other exclusions above remain unchanged. Public distribution is still blocked by the separate provenance task.

## Out of Scope

- Full SpektraLab spatial/stochastic engine, B&W profile path, CineStill-specific halation, positive/slide processing, camera-negative scan inversion, RAW decoding or print-paper UI.
- Silent substitutions for missing stock identities or ignoring historic asset/distribution rights.
