# Implement: data-driven negative stock migration

- [x] Generalize the fixed exporter into exact film/paper pair resources, source digests, illuminants and per-pair mid-gray calibration.
- [x] Add a typed stock registry and source-specific fixture validation before runtime registration.
- [x] Migrate Portra 160/400/800, Gold, Ektar and Ultramax aperture looks with shared CPU/GPU backends.
- [x] Add Fuji C200/X-Tra/Pro 400H and validate their Fuji paper/filter pairs.
- [x] Generalize K75P viewing and T camera-reference transforms for Vision3, then validate/add supported Vision3 stocks.
- [x] Register supported new FilmType entries with template mapping, normalized settings/recipes/result identity and accessible controls.
- [x] Preserve exact-match blockers and B&W/CineStill boundaries; do not fake unavailable stocks.
- [x] Update provenance manifest/profile changelog and verify independent code/browser/stock-specific checks.
- [x] Complete final scope audit: every supported replacement/addition has actual rendering evidence, not just resource presence.

## Execution Evidence — 2026-11-06

- `export_stock_reference.py` generates exact pair-specific TC/curves/DIR/dye/base/masks, enlarger/filter, viewing/reference and OkLch resources with pinned profile digests. All twelve non-Portra stocks have distinct setups, not relabeled Portra resources.
- `stockRegistry.ts` binds the six existing duplicate stocks plus Fuji C200/X-Tra/Pro 400H and Vision3 50D/200T/250D/500T. Exact-match blockers remain for unavailable profiles, B&W and CineStill's distinct spatial appearance.
- `research/filmframe-stock-rendering.json` records actual isolated FilmFrame single-frame renders for all thirteen supported stocks, with zero runtime errors and identical 1397x1286 template dimensions.
- `scripts/spectral/check-stock-parity.mjs` compares TypeScript film raw, negative density, paper exposure/density and output with generated upstream NPY fixtures, including K75P and tungsten transforms. Errors are small documented Float32 differences, not guessed LUT approximations.
- Real Apple M4 GPU/ANGLE Metal runs validate Gold and the other stock resources through the shared GPU backend; software SwiftShader limitations remain a reason to use equivalent CPU spectral fallback rather than force a different look.
- Source notices, profile derivative changelog and `ops/provenance/manifest.json` now include the additional derived setups and retain unresolved Hanatos/KG3 and historical-asset distribution blockers.
- Final closure added 120 source-specific stock/stage checks to `npm run check`, per-stock digest-verified lazy loading with ES-module Workers, and explicit spectral Worker-failure/main-thread regressions. Independent review found Gold layered-path and spectral-strip defects; both were fixed and re-reviewed closed. Final evidence: `research/final-integration-validation.md` and `research/independent-review.md`; 217 unit tests, 50 browser tests and 13 real FilmFrame stock renders pass.
