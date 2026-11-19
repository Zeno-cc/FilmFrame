# Six-area disposition recommendation — 2026-11-14

## Executive order

1. **Correctness gates first:** rollback configuration compatibility and no duplicate heavy-strip rendering after timeout.
2. **Low-risk maintenance:** remove local generated metadata, verify a small CSS dependency update, then coordinate the Vite/Vitest/vite-node upgrade.
3. **Measure before optimizing:** benchmark actual long strips before timeout values, adaptive admission or frame caching.
4. **Owner/legal work separately:** asset provenance, spectral data, LGPL/corresponding source and the project license remain approval tasks, not cleanup disguised as engineering.

## 1. Rollback compatibility

**Recommendation:** keep `rollbackFloor: 1.4.0` for the first schema007 release and add actual configuration compatibility checks before upgrade and again before automatic rollback. Do not silently clamp or rewrite the administrator's budget.

- A target older than the first real 4 GiB-capable release accepts only stored budgets <= 2048 MiB. The first such release must be identified by an actual published version, not by inventing a version number for local commit `33f6b24`.
- A value > 2048 blocks the upgrade before artifact switch. During rollback it blocks `switch()`, retains the lock/current link and gives a concrete recovery action; it never reports `rolled_back` or mutates SQLite/`.env`.
- Keep schema 6/7 and the existing rollback floor: raising the floor to the first new version would reject upgrades from every current stable release.
- If pausing upgrades for high budgets is not acceptable, choose manual release or a separately maintained legacy compatibility line. Do not claim `backwardCompatible` without one of those choices.

**Owner decisions:** accept high-budget upgrade pause and updater-first maintenance; choose the explicit recovery state/error and next release version. Production configuration and actual rollback target are currently unknown.

**Verification:** 128/700/2048 succeed; 2049/4096 fail closed without switching or changing settings; a real 4 GiB target is not incorrectly rejected; reconcile retries retain the same check; run actual old-version read tests, updater/release/Access/backup suites and configuration checks.

## 2. Development dependency advisories

**Current evidence:** the 2026-11-14 official-registry assessment found no production dependency advisory requiring urgent remediation; access has none. Issues are development/build/test tools with environment-specific exposure. This is not a permanent security guarantee.

**Recommendation:** two bounded stages.

1. CSS/transitive stage: PostCSS 8.5.33, @babel/core 7.29.13, Browserslist 4.29.5, baseline-browser-mapping >= 2.11.0; verify nanoid 3.3.20 and source-map-js 1.2.2. Run build, style checks and browser regression.
2. Coordinated toolchain stage: evaluate Vite 6.4.6, Vitest 4.1.12 and @vitejs/plugin-react 4.7.0. `vite-node` is the blocker: Vitest 4 no longer includes it, while `test:spectral-stocks` still uses it. Do not select Vite 6 plus vite-node 6 without evidence. A larger Vite 8.3.8 / vite-node 6.0.0 / Vitest 4.1.12 / React plugin 6.3.0 candidate needs separate migration review and Node-version validation.

**Do not:** use `npm audit fix --force`, upgrade production dependencies to clear a dev-only report, or treat `npm audit` alone as proof of safety.

**Verification:** exact `npm ls` versions, official-registry audit before/after by GHSA, clean `npm ci`, `check:all`, spectral checker, production/default browser suites. Security behavior and Windows/WSL editor cases need their own platform evidence.

## 3. Historical public assets

**Recommendation:** distinguish distribution exclusion from asset ownership.

- Safely exclude untracked `.DS_Store` and documented, unreferenced process intermediates from release output. Preserve source material until ownership is confirmed; update document links if moving the overlay README out of `public`.
- Do not include `aperture-shadow-derived.png` in automatic cleanup just because rendering no longer draws it; constants/tests still reference it and removal is a product/asset decision.
- Historical templates, derived sprocket masks and `alipay.jpg` need creator/tool/source evidence and permission for modified redistribution. Generated artwork is not automatically cleared. Replace affected assets if permission cannot be documented.
- Check the final distribution, not just source `public/`; Vite copies it wholesale.

**Owner decisions:** identify asset origin/permission and whether intermediates may be archived outside `public/`; payment image redistribution; replacement versus documented reuse.

## 4. License and distribution

**Recommendation:** keep public distribution blocked while building a concrete evidence pack.

- Resolve Hanatos/KG3 and product B&W/spectral-constant terms independently of the profile CC notice.
- Inventory actual runtime dependencies and notices, including nested `heic-to`/libheif codec code, corresponding source and a practical relinking/replacement route.
- Add project-wide license/copyright only after owner approval of project-owned source/assets; provide exact corresponding source and reproducible build instructions for each distributed build.
- Verify static output, Access distribution, deployment bundle and corresponding source, not only `dist/` or manifest SHA-256. `verify:provenance` currently prints blockers but exits zero, so release policy must enforce the human gate.

**Owner/legal decisions:** GPL project licensing, uncertain data/asset rights, LGPL compliance/relinking and public-release approval. No engineering task can mark these complete.

## 5. Long-strip performance

**Recommendation now:** retain 120 seconds as a measurement baseline, but do not automatically repeat a heavy strip on the main thread after a Worker timeout. Terminate the Worker, retain previously accepted single-frame artifacts, show an actionable error and allow deliberate retry. Never accept or publish a partial strip produced by the timed-out task; retain a previous complete strip only as a stale artifact that cannot be downloaded as current. Cancellation, GPU context loss and timeout never trigger duplicate work.

**Measure before choosing timeout/cache/admission:** explicit CPU and WebGL2, Worker success/fallback IDs, cold/warm caches, 10/20/36 frames, 1307x1203 and large natural images, P50/P95/max per-frame costs, decode/raster/draw/readback/export timing, bounded memory proxies and final RGB/pixel comparisons.

- Record edge/pixel budget rejection as a result, never relax 32767px to produce a benchmark.
- Small first matrix: 10/36 frames × two backends × cold/warm caches; extend to 20 frames and large/mixed-orientation inputs.
- Do not claim GPU completion from `drawArrays` or consume production GL errors in instrumentation.
- Current per-frame backend reinitialization and ordinary full-main-thread CPU cost are optimization candidates only after measurement.

**Later choices:** a data-derived bounded strip timeout; adaptive admission only if actual working-set prediction is justified; bounded incremental frame cache only after hit-rate/memory/invalidation evidence. Main-thread cancellation currently discards late results but cannot interrupt ongoing CPU work; do not add that workload after a timeout.

## 6. Obsolete-code cleanup

**Recommended small batches:**

1. Untracked Vite timestamp and `.DS_Store` files, then build and assert no `dist/.DS_Store`.
2. Zero-call helpers only: `createPhysicalRotatedImage`, `monochromeLinearSrgbToInput` and its imports, `markPasskeyUsed`, `createSessionForInvite`.
3. Legacy landscape geometry chain and its tests, not whole rendering modules: unused layout/base/perforation/marking/texture symbols. Keep active side-perforation and grain code.
4. Independently confirm `tailwind.config.cjs`, `metadata.json`, empty `netlify.toml`, public documentation and platform consumers before removal.

**Retain:** runtime PNGs/masks, UI barrels required by the current public-component convention, test-used Passkey functions, active cover/grain/texture paths and the payment image pending rights review.

## Dependency/order between workstreams

- Updater compatibility should land before any new one-click schema007 release; rights clearance is separately required for public distribution.
- Dependency upgrades and cleanup should not be mixed into rendering algorithm changes; each needs its own regression evidence.
- Performance policy can prevent duplicate work now; timeouts/caching require the measurement milestone first.
- Historical asset cleanup must not accidentally remove evidence needed for provenance review.

## Global validation and boundaries

Run focused tests per stage, then `check:all`, release/updater/backup/provenance checks, production and development browser selections and Firefox/WebKit compatibility. Docker, deployment, remote mutation and public release are excluded from this planning task. Physical iPhone/Android, real production config/rollback and legal approval remain explicit outstanding evidence.
