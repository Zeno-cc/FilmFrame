# Implementation: isolated Portra spectral prototype

- [x] Read the curated specs, parent research, child PRD/design and exact pinned upstream numeric configuration.
- [x] Record imported source/resource provenance and license/modification notices before use; keep downloads in isolated directories and pass paths to owned scripts.
- [x] Reproduce/decode upstream Portra gray-ramp/green-patch baselines and verify their shape/dtype/digest.
- [x] Implement bounded pure TypeScript spectral film, print and scan stages with explicit float-density contracts.
- [x] Add deterministic regression tests for film raw, negative density, print RGB, green patch, alpha and invalid input.
- [x] Add an isolated browser A/B and benchmark harness with synthetic fixtures, no templates/grain and no external image requests.
- [x] Measure, document errors/timing/memory and provide a go/no-go recommendation; unresolved items block UI integration.
- [x] Run focused Vitest, `npm run check`, browser evidence where feasible and `git diff --check`; report skipped evidence faithfully.
- [x] Do not edit production defaults/UI/Worker/renderers or commit/push/deploy.

## Ownership

Implementation agent may edit new spectral services/tests/harness, its own task artifacts and prototype-specific provenance records. Main agent owns license-child artifacts/global manifest and resolves any file overlap before dispatch. No existing FilmFrame runtime behavior is enabled by this child.

## Recovery Note — 2026-11-06

The first implementation agent became unavailable after an environment interruption. Its repository inspection found no spectral product files, baseline results or research artifacts; do not count that attempt as delivered work. Resume from this design and record upstream configuration/provenance to disk before numeric implementation.

### Provider recovery and measured upstream drift

The resumed implementation agent later failed because the provider rejected its model request. This is not a test outcome or go/no-go decision. It persisted `research/upstream-configuration-and-provenance.md`, `scripts/spectral/export_portra_reference.py`, initial typed resource contracts and license notices before interruption.

Controlled upstream execution found a configuration mismatch: current CAM16-UCS defaults fail three print-RGB baselines; explicit OkLch matches the green patch and most gray-ramp pixels, but the darkest gray column still differs (48 violations, max abs 0.00713063601897). This unresolved baseline discrepancy must remain visible. Do not claim that the TypeScript implementation or full pipeline has passed. Preserve the pinned committed fixtures and document any measured mismatch rather than silently accepting the reference exporter's output.

### Numeric progress and ownership during integration

- Generated `services/spectral/resources/portra-setup.json` and `tests/fixtures/spectral/manifest.json` using the pinned isolated environment. Main merged their provenance into the global manifest and added the local profile/LUT changelog.
- Corrected the reference exporter to build DIR correction curves from the **normalized** film curves. TypeScript film raw and negative density then matched current upstream with zero tolerance violations (max abs about `6e-8`). The earlier all-channel failure was a reference-domain bug, not a reason to transpose the DIR matrix.
- Main fixed the typed resource decoder and matrix `ArrayLike` compatibility; the implementation agent owns the remaining numeric algorithm, especially `print.ts`. Do not concurrently overwrite its mid-gray normalization. A controlled upstream probe corrected an earlier RGB-channel interpretation: the density midgray has shape `(1,1,81)`, so `_exposure_factor` takes the geometric mean across **81 wavelength responses**, yielding the scalar factor `0.8357499244020924` for this configuration. The first gray negative density maps to paper log `[0.70894626999154,0.7271062763357123,0.7344458496213865]`.
- Paper exposure/print output has been brought into the documented Float32 agreement range. `research/numerical-validation.md` records current-upstream gray print max abs `0.00003574890181029522`, zero tolerance violations, negative-density max abs about `6e-8`, and the remaining historical dark-column discrepancy. The focused suite passes 8/8; `npm run check` passes 212 tests, typecheck and production build. The unresolved-gray test distinguishes current-code parity from the known historical mismatch rather than asserting the old fixture is solved.

### Browser benchmark evidence

- `research/browser-benchmark.json` records a real Playwright Chromium 149 run on Apple M4 / macOS arm64 with no external image requests and no harness errors. This is synthetic CPU numeric evidence, not production FilmFrame render timing.
- 256x256: first full render `137.9ms`, repeated print mean `95.7ms`; estimated source+stage arrays `5,505,024` bytes plus `1,302,600` fixed setup bytes.
- 1920x1080: first full render `3574.7ms`, repeated print mean `5270.7ms`; estimated source+stage arrays `174,182,400` bytes plus fixed setup, with a larger measured heap difference. Full-resolution interactive use is not justified by this result.
- A later completed run with A/B screenshots recorded substantially slower timings under different concurrent load: 256x256 first `594ms` / reprint `457.6ms`, 1080p first `17291ms` / reprint `15347.4ms`. Treat this as load-sensitive evidence, not stable real-time performance. `research/browser-harness.png` and `synthetic-ab.png` now exist and show the side-by-side non-production comparison.
- A subsequent measured run recorded 256x256 first `377.3ms` / reprint `329.8ms`, and 1080p first `10271.8ms` / reprint `10068.8ms`. Across three completed runs the 1080p first-render range is therefore about `3.57–17.29s`, with different background load. Do not present any single fastest run as a performance guarantee.

- The A/B harness was corrected to use separate side-by-side image regions and to label its simple reference as **not production filmEngine**. Screenshot completion and independent review findings are still pending, so this is not yet a final go decision.

### Final evidence and remaining blockers — 2026-11-06

- `research/cross-browser-validation.json` records focused Firefox 151 and WebKit 26.5 runs on macOS arm64. Both pass finite gray/green checks with zero tolerance violations and no external requests or console errors. This is numerical evidence only, not 1080p cross-browser performance or production UI compatibility.
- `research/browser-harness.png` and `research/synthetic-ab.png` are saved and reviewed. The left half is explicitly a simple byte-space reference, not production `filmEngine`; no border/template pixels participate. The two outputs differ in all 98,304 synthetic pixels, with max byte difference 95 and mean absolute RGB difference 23.656.
- Latest completed `browser-benchmark.json`: 256x256 first render `127.9ms`, repeated print mean `94.6ms`; 1920x1080 first render `3556.7ms`, repeated print mean `3076.45ms`. There were no harness errors or external image requests. Historical slower runs above are retained only to show load sensitivity, not as the latest report.
- Core working-array accounting includes source, five returned float32 stages, output and the `81x3` float64 scan receiver: `174,184,344` bytes at 1080p. The repeated-print retained-array estimate is `223,950,744` bytes (213.57 MiB), excluding `1,302,672` typed setup bytes, retained JSON, RGBA/Canvas and GC overlap. Default `maxWorkingSetBytes` now follows the exact core formula, with a focused minus-one-byte rejection test.
- Focused spectral tests are **10/10** and full `npm run check` passes **214 tests**, typecheck and production build. Strict original tolerance covers green and all non-dark gray pixels; only the known historical dark column retains 48 violations. `git diff --check`, seven provenance tests and all local hashes pass.
- Review corrections added real sRGB EOTF decoding and `colour.models.matrix_RGB_to_RGB` ProPhoto conversion, exact white/byte fixtures, digest/monotonic-axis/binary-mask validation, actual payload SHA-256 verification and pinned profile-hash assertions. Resource digest is `16f6217f8f1fa81c7064d5926f3ab4344f088a18520fd71e260c80fbbe5febd5`.
- No App, FilmSettings, filmEngine, filmWorker, filmWorkerClient, template, default or export files were edited. No GPU/WASM, production UI integration, commit, push or deploy was performed by this implementation agent; main merged the global provenance records separately.
- **NO-GO for production UI integration and public distribution.** Current-upstream numerical parity does not resolve the older committed gray fixture's 48 dark-column violations. Full-resolution CPU time is not interactive, the A/B is not actual FilmFrame rendering, and Hanatos/KG3/global asset license review remain unresolved. A separately approved low-resolution experiment would need its own input, memory, Worker and real-renderer visual acceptance plan.
- Final independent targeted review confirmed no remaining code blocker in the reviewed fixes. This closes the isolated prototype/review work, not the production integration or distribution gates. The implementation agent had a provider/network failure after persisting its evidence; main completed the targeted review fixes and final verification without repeating the research.
