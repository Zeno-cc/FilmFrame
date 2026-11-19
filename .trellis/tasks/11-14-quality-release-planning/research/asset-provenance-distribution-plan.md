# Research: asset, provenance and distribution readiness plan

- Query: inspect public assets, provenance records, spectral notices, CreditsDialog and release copying; separate local-file exclusion, historical ownership, spectral rights and runtime/LGPL readiness; propose staged actions and verification without implementing or declaring legal clearance.
- Scope: mixed (repository evidence, installed packages, pinned upstream documents and Vite documentation)
- Date: 2026-11-14
- Task: `.trellis/tasks/11-14-quality-release-planning` (explicitly supplied by the coordinator; `task.py current --source` returned no active task). No asset, license, source or manifest was changed.

## 1. Current conclusion

Public distribution remains blocked. The repository itself says so in `ops/provenance/README.md:5-13,22-39`, and the manifest retains owner review, unresolved spectral-data rights and planned corresponding-source status. `npm run verify:provenance` succeeds at schema/digest validation but reports blockers; it does not enforce a release stop. Credits exist, but do not supply every required notice or resolve rights.

The practical route is: first stop accidental copying of local metadata and four confirmed process files; then resolve or replace historical images and spectral inputs; in parallel establish full dependency/license/source inventories; finally gate actual distributed artifacts and rehearse corresponding-source/relink delivery. Do not make the first cleanup a license decision or treat generated images as automatically redistributable.

## 2. Files and observed behavior

| Path | Evidence and relevance |
|---|---|
| `public/.DS_Store` | Local Finder metadata. Also present verbatim as `dist/.DS_Store`. Not a runtime asset. |
| `public/film-overlays/aperture-mask.png` | 1307x1203 RGB; process file documented at `docs/project/rendering.md:82`. No production-code reference found. |
| `public/film-overlays/aperture-shadow.png` | 1306x1204 RGB; same process-file evidence and no production reference. |
| `public/film-overlays/aperture-shadow-clean.png` | 1307x1203 indexed PNG; same evidence. |
| `public/film-overlays/aperture-shadow-cutout.png` | 1307x1203 RGBA; same evidence. |
| `public/film-overlays/aperture-shadow-derived.png` | Exported by `services/filmOverlay.ts:22` and present in tests, but documented as not loaded/drawn at `docs/project/rendering.md:64,97`. Do not classify as the four unequivocally unreferenced files; decide its fallback/test contract separately. |
| `public/film-overlays/film-base.png`, `aperture-mask-derived.png` | Active Gold layered assets, `services/filmOverlay.ts:20-21`, `docs/project/rendering.md:62-63`. Not cleanup candidates. |
| `public/film-overlays/kodak-gold-200.png` plus 15 flattened templates | Historical runtime images; 16 flattened-template entries at `manifest.json:94-177`. Geometry contract is in `public/film-overlays/README.md:29-33` and `docs/project/rendering.md:45-56`. |
| `public/film-sprocket-masks/*.png` | 16 runtime masks derived from templates; mapped in `services/filmSprocket.ts:8-36`, unresolved at `manifest.json:220-299`. Replacement must accompany/align with template replacement. |
| `public/alipay.jpg` | Current file is valid baseline JPEG, 1260x1890, served by `components/feedback/SupportDialog.tsx:18`. Old docs claiming it is unreadable are stale. Creator/redistribution permission still unresolved (`manifest.json:300-320`). |
| `services/spectral/resources/*.json` and `stockResources.ts` | Spectral JSON is imported into emitted JS chunks, not merely source-tree documentation. `stockResources.ts:1-37` shows direct imports of negative-stock setup tables. Current `dist/assets/` contains unresolved negative, positive and monochrome setup chunks. |
| `services/spectral/NOTICE.md` | Code/profile attribution at lines 13-61; explicit Hanatos/KG3 redistribution block at lines 63-76. |
| `ops/provenance/manifest.json` | 17 entries with local digests. Unresolved entries include negative/positive/B&W data and CineStill model; all listed film templates/masks/payment image are owner-review. Project corresponding source is `planned` at lines 3-12. |
| `ops/provenance/lib/provenance-contract.mjs` | `getDistributionBlockers` (lines 96-113) only reports non-verified/planned fields. No coverage of unlisted public files, built artifacts or actual source offer. |
| `ops/provenance/validate-provenance.mjs` | Prints blockers but exits 0 after valid schema/digests (lines 28-35). `check:release` therefore cannot currently block unresolved rights by itself. |
| `components/feedback/CreditsDialog.tsx` | Five source sections and links to three copied license texts plus README. Header entry wired at `App.tsx:1517-1520`; dialog rendered at `App.tsx:1724-1727`. It explicitly states review is incomplete (lines 74-79). |
| `vite.config.ts`, `Dockerfile` | No public-copy exclusion configured. Dockerfile copies repository, builds, then copies all `dist` into Nginx (`Dockerfile:11-15,27-28`). Vite officially copies publicDir contents as-is. |
| `.github/workflows/release.yml` | Runs `check:release` (line 78), builds deploy tar and both static/access images (lines 80-134), publishes bundle/manifest/schema (lines 192-219). No local `dist` archive or dependency/source archive is uploaded. |
| `ops/release/build-deploy-bundle.sh` | Deploy bundle contains only `compose.yaml`, `.env.example`, `ops/backup` (lines 21-26); it is not the static web distribution or corresponding-source archive. |
| `server/access/Dockerfile` | Separate runtime distribution with production `node_modules`, compiled JS and Node base (lines 34-38). Requires its own notices/SBOM/source review; frontend `npm ls --omit=dev` is insufficient. |

## 3. Four separated risk classes and options

### A. Local metadata and documented intermediates

Recommended: exclusion-first, separate from rights review.

1. `.DS_Store`: exclude from distribution through an authorized build/public-copy allowlist or staging step, and add a built-artifact absence assertion. Whether also to remove it from source control is a later repository-maintenance choice, not required for release hygiene. It need not enter legal provenance review.
2. The four exact files `aperture-mask.png`, `aperture-shadow.png`, `aperture-shadow-clean.png`, `aperture-shadow-cutout.png`: owner/engineering confirms no offline/manual regeneration dependency, records hashes/paths as retained source-process evidence, then excludes from web distribution. Prefer distribution exclusion over immediate deletion, retaining rollback and original evidence. If removal is later approved, update manifest digests in the same authorized implementation.
3. Do not bundle `aperture-shadow-derived.png`, `alipay.jpg`, `film-overlays/README.md` or `film-base.png` into this safe set. The shadow-derived constant/tests, payment UI, instructions and active renderer create distinct behavior or rights considerations.
4. Alternative: move only the four process files outside `public/` after owner confirms their archival location. This keeps them available but avoids indiscriminate copying; manifest paths/digests and contributor instructions must move together. More bookkeeping than exclusion but clearer source/runtime separation.

Verification: a fresh build must not contain these five distribution-excluded paths; Gold single/strip and real135 fallback tests remain green; production asset requests have no new 404s. Confirm no manifest `localPaths` still points at a deleted file.

### B. Historical template/source ownership and replacement

Recommended: request specific evidence now, while preparing a replacement path that can proceed if evidence is insufficient.

Option B1 — retain and document:

- Required per original image/group: original unnormalized image, creator/owner identity and authority to grant rights, generator/tool/version and relevant tool terms at creation date, source images/font inputs and their terms, prompt/session/export record where available, and explicit permission for modification and web/commercial redistribution under the chosen project/asset terms.
- Map each source to current normalized bytes with a deterministic transformation record. Include Gold layered base/masks and all derived sprocket masks, not just the 16 flattened templates.
- For `alipay.jpg`: owner confirms the current payment account/QR is intended, supplies origin/permission and verifies it decodes/scans to the intended recipient in a controlled test. Do not create a replacement QR or infer ownership from Git history.
- Film names/labels do not establish artwork permission; any separate trademark/branding concerns are a named review question, not a clearance conclusion.

Option B2 — replace with project-owned/original or separately cleared assets:

- Owner/legal chooses acceptable source provenance and trademark/text treatment before production starts. Preserve source files/tool terms/creation record and license grant.
- Replace a template together with dependent Gold layers/masks and matching sprocket mask. Maintain 1307x1203 and aperture `(92,211,1123,800)` unless a separately reviewed geometry migration is authorized; see `public/film-overlays/README.md:29-33`.
- Compare existing recipes and classic/physical compatibility routes before/after; worker and main-thread parity plus visual approval are required. Programmatic compatibility borders can reduce exposure for routes without dedicated artwork, but do not clear still-shipping historical assets or spectral data.
- Preserve old bytes/digests privately as historical evidence where permitted, rather than claiming Git deletion erases earlier distributions.

Decision gate: owner/legal approves B1 evidence or B2 source/replacement brief. Engineering cannot turn an undocumented AI/generated asset into cleared artwork by redrawing, re-encoding, renaming or deleting its metadata.

### C. Spectral-data rights

Current profile CC BY-SA evidence is not enough for all embedded data. `manifest.json:78-92,372-475` leaves Hanatos/KG3-dependent Portra, negative and positive data unresolved; `manifest.json:478-519` also leaves product B&W data and CineStill model unresolved. `NOTICE.md:65-74` explicitly forbids public distribution of affected setup tables until resolved/replaced and globally reviewed.

Option C1 — source-specific permission/evidence:

- For Hanatos irradiance/TC: exact upstream file and commit, original author/rightsholder, separate redistribution grant or verified public-domain/license evidence, and which generated arrays contain/derive from it.
- For measured Schott KG3/filter data: exact datasheet/file/version, rightsholder and redistribution basis; a manufacturer URL or spectral measurement alone is not a license.
- For SpektraLab product B&W and CineStill: pinned source file/digest plus the product-specific notice and owner/legal review. Do not extend spektrafilm's CC BY-SA to those product records.
- For colour-science tables: retain its BSD notice and exact export/version provenance; this does not settle Hanatos/KG3.
- Record source digest -> exporter/version/options -> output digest -> emitted chunk mapping, with modifications in `CHANGELOG.md` / `PROFILE-CHANGELOG.md`.

Option C2 — independently sourced replacement:

- Replace unresolved inputs with standards/project-measured data whose ownership and redistribution terms are documented. Re-export all affected resources and rerun parity against controlled references, not merely a build.
- If one shared unresolved input affects many stocks, treat it as one upstream decision with a fan-out re-export, not 20 unrelated approvals.

Option C3 — feature/distribution reduction:

- If rights cannot be established, owner decides whether to exclude affected spectral resources/routes or hold the whole candidate. Any reduction needs an explicit UI capability/fallback and recipe-compatibility plan; old recipes must not silently render with a different stock/model. The current code imports unresolved resources into production chunks, so an exclusion implementation and bundle assertion are required.

Decision gate: legal/owner reviews exact source-specific evidence or replacement provenance for each unresolved manifest group. Passing spectral tests demonstrates numerical behavior only.

### D. Runtime notices, LGPL and corresponding source

Observed frontend production tree: `exif-js@2.3.0` (MIT), `heic-to@1.5.2` (package LGPL-3.0, local license text says v3 or later), `react@19.2.5`, `react-dom@19.2.5`, `scheduler@0.27.0` (MIT). Exact lock entries: `package-lock.json:1979-1984,2041-2046,2518-2538,2594-2599`.

Current credits/dist shortcomings:

- Credits lists SpektraLab, spektrafilm, positive profiles, B&W review and heic-to, but no React/React DOM/scheduler/exif-js entries and no project GPL text/copyright/corresponding-source route.
- `dist` has three imported license text chunks; `services/spectral/NOTICE.md`, `CHANGELOG.md` and colour-science BSD text are not copied by Vite merely because they exist in `services/`.
- Installed exif-js 2.3.0 has no standalone LICENSE file or full embedded MIT grant found; its `package.json` declares MIT. Acquire the exact-source copyright/license evidence rather than inventing attribution.
- `heic-to/dist/heic-to.js` is ~3 MB and contains a generated Worker and libheif references. Pinned upstream README records libheif 1.22.2 and libde265 1.0.16; `esbuild.mjs` supplies pre-existing `src/lib/libheif` paths but does not itself pin libheif. A transitive native/codec/source inventory remains necessary; LGPL analysis limited to the outer package is incomplete.

Recommended option D1 — retain the current bundled library, document and rehearse compliance:

1. Owner/legal chooses the exact GNU GPL/LGPL application to this web bundle and records it. Supply required library/project copyright notices, license texts and source links/offers in a stable, accessible offline-capable credits/help surface where required.
2. Pin exact heic-to/libheif/codec versions, source commits/tarball digests, build configuration and unmodified/modified status. Verify whether installed bytes match the claimed source build.
3. Produce Minimal Corresponding Source for the linked library and Corresponding Application Code/build instructions sufficient to recombine/relink, or obtain approval for a genuinely suitable shared-library mechanism. A URL to the project homepage or an SBOM/build attestation alone is not this demonstration.
4. Rehearse on a clean environment: obtain the exact distributed static JS, replace/rebuild the library with a compatible modified version, regenerate the application bundle and run HEIC conversion. Record any bundler/CSP/Worker limits and required installation information. The current code has no such test evidence.
5. Project-wide GPL route requires owner confirmation for all project-owned source/assets, root license/copyright notices and exact corresponding source/build instructions for each released binary. `projectDistribution.correspondingSource.status` must not become `ready` until a recipient can retrieve and reproduce the matching release.

Alternative D2 — replace/lazy-separate the HEIC dependency only after legal approves the chosen architecture. Do not assume dynamic import, Worker use, WASM or local browser processing automatically removes notice/source/relink obligations. Any replacement must preserve current HEIC behavior or have an explicit product decision.

Separate inventory: generate artifact-specific SBOMs for the static app and Access image, including OS/base-image components and production npm trees. `npm run check:release` and Docker Buildx `sbom: true` are build/security evidence, not human-readable third-party notice completion.

## 4. Staged execution plan and dependencies

| Stage | Authorized future actions | Decision owner | Exit evidence |
|---|---|---|---|
| 0. Freeze evidence and release status | Keep no-public-release status; snapshot candidate commit, current file/chunk hashes, unresolved manifest output, direct and transitive runtime inventories. No deployment needed for local build inspection. | Release owner | One candidate ID; artifact-specific file/SBOM inventory; explicit outstanding decisions. |
| 1. Low-risk distribution hygiene | Exclude `.DS_Store` and four confirmed process files; decide shadow-derived separately; add fresh-build absence tests. Independent of legal clearance but does not unlock release. | Engineering plus asset owner for offline use | No excluded paths in static output; relevant rendering/fallback tests; retained source evidence and valid manifest paths. |
| 2. Rights tracks in parallel | Gather B1 or prepare B2 historical assets; C1/C2 spectral evidence/re-export; D1 dependency notices/source/relink package. | Owner/legal for rights choices; engineering for evidence/replacement/testing | Every retained/shipped manifest group has evidence-backed verified status or is actually excluded; no generated asset presumed cleared. |
| 3. Complete notices and corresponding source | Add approved project license/copyright, complete dependency notices, data attribution/modification links, durable source/build route. Keep out-of-app copies when artifact requires them. | Owner/legal + release engineering | Clean-room recipient obtains exact source, build scripts and library materials; notices work from distributed artifact. |
| 4. Enforce gates | Make unresolved shipped rights a nonzero release-gate failure; verify manifest coverage against actual artifact, not just listed hashes. Avoid simply marking all entries verified. | Release owner | Negative test with unresolved shipped entry fails; positive test requires human approval evidence. |
| 5. Candidate validation and publication rehearsal | Build from exact source; inspect all four release outputs and runtime UI; test replacement/rollback and HEIC relink; only then seek release approval. | Release owner + human legal review | Artifact manifest/digest/source bundle match; all checks and approvals attached. No tag/push/deploy performed in this planning task. |

Ordering: Stage 1 can proceed alone. Historical templates, spectral inputs and dependencies can run in parallel but all affect final source/notice completeness. Corresponding source must be finalized after exact candidate contents are known. Do not tag/release before the artifact gates pass.

## 5. Verify the actual distribution contents

Use an isolated output directory outside the repository for build/export inspections; do not use the existing `dist` as proof of a future build. The current static artifact is the Nginx image filesystem, not the small deploy tar.

1. Build from the exact candidate commit with the locked dependencies and record source commit, tool versions and artifact digests.
2. Static web: enumerate `/usr/share/nginx/html` from the exact image digest (or an authorized local equivalent) and recursively list all JS/CSS/Worker/WASM/text/image files. Assert:
   - no `.DS_Store`, unintended process images, source-only backups or unapproved assets;
   - no unresolved spectral setup chunks or historical derivatives, unless their approvals are attached;
   - every Credits URL returns the intended content (including text MIME where practical) and all required notices remain reachable;
   - source map inclusion is intentional and matches the source-delivery decision;
   - active assets and their replacement masks match approved manifest hashes.
3. Access image: inventory `/app/node_modules`, `/app/dist`, base OS and native modules such as better-sqlite3; include their notice/source requirements. Do not infer its coverage from frontend dependencies.
4. Deploy tar: `tar -tzf` must show only intended compose/env/backup files and match the canonical manifest SHA-256. Do not mistake it for a source archive or static app bundle.
5. GitHub Release/attestations/SBOM: bind image digests, tar digest, source commit and release version; retain machine-readable SBOM and human notices/source materials. Attestations prove build linkage, not permission to distribute.
6. Runtime checks: production-preview worker/main rendering for retained classic/physical routes, current recipes and fallbacks; Credits opens from header and all local notice/source routes work; HEIC conversion works and the planned modified-library relink rehearsal succeeds; intended payment QR is verified separately.
7. Corresponding-source recipient test: from only the materials offered with that artifact, a clean environment can retrieve the exact source and reproduce/run the delivered application. Archive the exact offered materials alongside candidate evidence.
8. Human release signoff compares the artifact-derived list to the approved manifest. Unlisted files are failures, not implicitly approved content.

## 6. Validation performed and limitations

- `npm run verify:provenance`: passed schema/digest checks for 17 entries; printed 15 blocker lines, including project rights/source, templates/masks/payment image, heic-to, spectral groups and CineStill.
- `npm run test:provenance`: 7/7 passed. This confirms the current checker, not legal readiness or artifact completeness.
- `file` confirmed current public PNG/JPEG formats and `alipay.jpg` readability by type. No visual QR scan or rights verification performed.
- Read installed package metadata, emitted dist files and exact frontend production tree. Did not run a new build, modify/delete assets, edit licenses/manifests, commit/push, use Docker or deploy.
- Did not independently verify every upstream copyright holder, original AI tool/input, Hanatos/KG3/product-data license, full native codec stack, root project ownership or a working relink. Those remain required evidence, not assumed outcomes.

## External references

- [Vite static asset handling](https://vite.dev/guide/assets): publicDir contents are copied as-is to the root of `dist`; supports the observed public metadata/process-file copying.
- [Pinned heic-to README](https://raw.githubusercontent.com/hoppergee/heic-to/f37af866f9aa6212ddc84b67a279c9f2386aba4f/README.md): records libheif 1.22.2, libde265 1.0.16 and Emscripten build route; does not itself grant their rights.
- [Pinned heic-to esbuild.mjs](https://raw.githubusercontent.com/hoppergee/heic-to/f37af866f9aa6212ddc84b67a279c9f2386aba4f/esbuild.mjs): bundles Worker/libheif modules from local paths; no version pin in this script.
- [Local heic-to license](/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/ops/provenance/licenses/heic-to-LGPL-3.0.txt): sections 4b-4e are the concrete combined-work notice/source/relink requirements for legal review; no conclusion is made here about the exact classification of this bundle.

## Caveats / not found

- No root license file or existing corresponding-source/relink rehearsal was found.
- No complete current third-party notices file covering React/exif-js/scheduler, colour-science, libheif/codecs or Access runtime was found in the static `dist`.
- No evidence of generator/tool/source-image rights for historical artwork was found; archived task records establish process, not ownership.
- No evidence that an exclusion of `aperture-shadow-derived.png` is behavior-neutral was established; its exported constant/tests require a separate decision.
- Manifest verification only covers listed files and explicitly preserves blockers. It does not enumerate artifact files or prevent release with blockers.
