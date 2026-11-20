# SpektraLab 全底片逐项迁移与发布验收

## Goal

Build a complete, source-pinned mapping between SpektraLab's stock catalog and FilmFrame's `stockRegistry`. Replace duplicate looks only with exact validated film/paper resources; add missing supported stocks without inventing profiles or treating every catalog entry as a 135 color-negative. Close physical imaging, provenance and release evidence separately.

## Current Evidence

- Final 2026-11-14 Pro 400H acceptance: 289 unit tests, 78 production browser workflows, 12 development-only numerical/physical diagnostics (including two five-frame strip reruns), Firefox/WebKit workflows and 7 provenance tests passed. CPU/GPU final RGB maximum difference is 1/255, Worker/main full-frame hashes match, the final request IDs and spectral backends are bound to successful Worker responses, and GPU FLOAT readback and frame disposal are asserted. Distribution rights remain separately blocked.
- Current runtime coverage is 14 exact color-negative setups including two push variants, four positive setups, four product monochrome setups and one bounded CineStill alias (24 picker options, five blocked legacy stocks). Generic compatibility edges are programmatic and labeled, never a borrowed stock's branded scan. Pro 400H now supports full physical spectral rendering following upstream overscan.cpp's least-squares CMY with no residual gate (updated 2026-11-13).
- SpektraLab `StockCatalog.json` at `02d82b56cf65f0f8e802a708612edc4e9a4790af` contains 34 entries: 21 camera negatives, 9 print papers/destinations and 4 positive films. `engine/resources_product/profiles` also contains Acros II, HP5, Tri-X, T-Max 100 and CineStill resources.
- Public distribution remains blocked by historical image rights, some spectral constants, project rights/corresponding source, runtime dependencies and application credits.

## Requirements

### R1 — Complete catalog mapping

- Record every pinned upstream ID, name, stage, type, formats, paired print, exact FilmFrame enum/profile, current migration status and next action.
- Distinguish camera negative, monochrome, positive/slide, push variant and printing paper. Never register a print paper as a camera stock or use one stock's profile for another.
- Include stocks present in upstream catalog but absent from FilmFrame, and FilmFrame stocks absent from the upstream catalog, with explicit evidence.

### R2 — Pro 400H physical-density acceptance

- Reproduce the upstream finite-sample least-squares CMY and residual independently. Do not invent a residual gate or tune resource data to force acceptance. Upstream `overscan.cpp` uses the solved CMY without rejecting this stock.
- Enable Pro 400H full physical rendering with its exact aperture resource and X-Tra-derived 135 edge layout. Label that layout as compatibility evidence, not a measured Pro 400H 135 scan, and verify CPU/GPU and Worker/main final pixels.

### R3 — Missing exact stocks and independent imaging

- Add source-backed missing negative resources such as Portra 800 push variants only with exact identities and numerical references.
- Use product B&W profiles for Acros II, HP5, Tri-X and T-Max 100 through a distinct monochrome path; do not pass them through a color-negative development claim.
- Keep CineStill's no-rem-jet/spatial behavior separate. Positive/slide resources require a different pipeline, not a negative inversion approximation.
- Missing exact resources such as ColorPlus, ProImage, Superia, T-Max 400 and P3200 remain blocked until evidence exists; no fake DX, profile or paper substitution.

### R4 — Evidence and release

- Add source digests, identity verification, license and modification records for every imported/derived resource.
- Run numerical stage comparisons, real Worker/main rendering, supported physical-edge checks and full-stock matrices. Do not equate a rendering matrix with complete imaging parity.
- Resolve rights and credits independently of technical acceptance: historical asset rights, spectral constants, project license/corresponding source, dependency inventory and accessible attribution.
- No commit, push, deployment or public release without explicit authorization and completed rights review.

## Acceptance Criteria

- [x] All 34 upstream entries and current FilmFrame stocks have a reviewed mapping and explicit next action.
- [x] Pro 400H full physical rendering matches the independently anchored upstream CMY and CPU/GPU/Worker/main acceptance; its X-Tra-derived 135 edge remains explicitly approximate.
- [x] Every currently admissible missing stock has exact identity, source digest, numerical stage evidence and actual production rendering; unavailable resources and motion-only Verita remain explicitly out of runtime coverage rather than being promoted.
- [x] B&W and positive/slide routes are explicitly separated from color-negative development, with their own tests and capability presentation.
- [x] Full browser/physical/stock matrices and independent `trellis-check` pass for the final candidate, including follow-up findings.
- [ ] Distribution rights, corresponding source, historical assets, runtime dependencies and remaining spectral data require owner/legal review; accessible credits are implemented but do not clear release.

## Out of Scope for False Completion Claims

- Claiming all 33 catalog entries are 135 color-negative or pixel-identical native SpektraLab output.
- Inventing missing measured resources, treating a geometry-compatible edge as spectral development, or using another film's DX/paper/profile.
- Uploading photos, using a server GPU or importing unlicensed SpektraLab artwork, icons, covers or proprietary fonts.

## 发布就绪度（2026-11-20）

1.5.0 已在本地准备好但**没有发布**，因为分发门禁未过。核实结果：

- `npm run verify:provenance` 校验 17 条记录通过，同时输出 16 条未解的分发阻塞：项目分发权利、对应源码、spectral constants、四类 derived tables、CineStill spatial model，以及胶片模板、图层掩膜、齿孔掩膜、支付图与 `heic-to` 的 owner 复核。
- 仓库没有根 LICENSE，而 `services/spectral` 衍生自 GPL-3.0-or-later 的 SpektraLab，profile 来自 CC BY-SA 4.0 的 spektrafilm。
- `origin/main` 不含 `services/spectral`、`services/physical135`、`services/darkroomGallery.ts`；`gh repo view` 显示仓库为公开仓库，所以推送 main 会成为这批衍生代码的**首次公开分发**。
- `ops/release/README.md` 第 5–6 步明确：在阻塞全部按 owner/法务证据解决前不得创建或推送稳定标签，技术门禁通过不等于获得分发许可。
- 版本号必须为 1.5.0：`ops/updater/filmframe_updater/deploy.py` 的 `FIRST_6_GIB_VERSION = "1.5.0"` 是 6144 MiB 预算的固定能力边界，v1.4.12 仍上限 2048 MiB。

尚需完成：根 LICENSE、GPL 对应源码的提供方式、逐项 notice，以及验证器列出的每一条阻塞的 owner/法务证据。
