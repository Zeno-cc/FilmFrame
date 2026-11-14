# Research: SpektraLab Film Edge / overscan physical-negative visuals and licensing versus FilmFrame

- Query: Research SpektraLab Film Edge / overscan physical negative visuals and licensing versus FilmFrame, including a feasible 135-only first increment and visual acceptance checks.
- Scope: mixed (local FilmFrame source plus pinned public SpektraLab source)
- Date: 2026-11-06
- Pinned upstream: `JamesQiu2005/SpektraLab@02d82b56cf65f0f8e802a708612edc4e9a4790af` (`chore(release): 1.3.5 (20)`), verified through GitHub's commit API.
- Evidence convention: **Observed** means read in the cited source. **Upstream claim** means a comment/README says it was measured; the reference scans and measurements were not present in this repository tree and were not independently verified here. **Proposal** is research guidance, not an existing behavior or approved implementation. This is practical engineering analysis, not legal advice.

## Executive conclusions

1. **SpektraLab is not just a better border PNG.** Its Film Edge expands the photograph into a physical film canvas before development. Gate exposure, rebate fog/leaks and edge/date imprints then pass through halation, development and grain. Film density is removed at perforations; the scan's light and carrier are composited after print/scan processing. FilmFrame currently applies a byte-space Gold look and grain only in the photograph aperture, then draws or overlays borders afterward.
2. **A visual-only Canvas increment is feasible without porting Metal or spectral color.** A new opt-in Kodak Gold 200 physical-135 mode can preserve existing flattened templates, crop transforms, frame numbering, browser-local processing, Worker fallback, and output formats. It should be described honestly as a physical-geometry/scan-appearance approximation, not SpektraLab's photochemical pipeline.
3. **Use a clean-room, independently measured physical model for the recommended increment.** Do not translate the pinned C++/Metal, copy its exact parameter/range tables or glyph maps, or reuse its profiles/LUTs/artwork under the assumption that different syntax avoids licensing obligations. Code reuse is a deliberate GPL-3.0-or-later decision; measured-profile/LUT reuse adds CC BY-SA 4.0 obligations. The source review below is for functional comparison, not an instruction to reproduce protected expression.
4. **135 full frame is the right first scope; half-frame and 120 are not merely extra sizes.** Half-frame introduces a second gate/exposure and pairing behavior. 120 removes perforation registration and changes gate families, film width, print placement and roll-specific spacing. Gate-family variants, filed scans, date backs, extra stock layouts, and spectral color should remain separate decisions.
5. **Existing FilmFrame asset provenance is an independent unresolved issue.** Its README says there is no project license and warns not to assume its code or film assets are freely reusable. Do not treat this as permission to copy either project's resources.

## Files found and roles

### SpektraLab (all at the pinned commit)

| File / authoritative link | Description |
|---|---|
| [`engine/src/pipeline/overscan.cpp`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/engine/src/pipeline/overscan.cpp) | Physical format table, seeded layout, gate shapes, stock edge layouts, rasterization, dispatch of three Film Edge nodes. |
| [`engine/src/shaders/overscan.metal`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/engine/src/shaders/overscan.metal) | Film-space gate/perforation distance functions, exposure, fog/leaks, film-presence mask and final scan-light/cut-wall treatment. |
| [`engine/src/pipeline/strip.hpp`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/engine/src/pipeline/strip.hpp) | **Not filmstrip geometry.** Defines `StripSpan { y0, rows }`, a full-width band for tiled/striped render execution. |
| [`Model/FilmEdge.swift`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/modern_UI/Spektrafilm/Spektrafilm/Model/FilmEdge.swift) | Format/gate/view/hole enums, body/frame seeds, frame number, fog/leak controls, wire parameters and Date Back settings. |
| [`Model/Session+FilmEdge.swift`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/modern_UI/Spektrafilm/Spektrafilm/Model/Session%2BFilmEdge.swift) | Crop-in-gate contract, stable per-frame seed derivation, shared user body seed and real edge-text mapping. |
| [`Resources/StockCatalog.json`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/modern_UI/Spektrafilm/Spektrafilm/Resources/StockCatalog.json) | Film/paper picker metadata, gauge availability and cover filenames. It is **not** the complete edge-geometry database. |
| [`Model/StockCatalog.swift`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/modern_UI/Spektrafilm/Spektrafilm/Model/StockCatalog.swift) | Catalog generated from profiles; `cover` resolves to `Resources/FilmCovers`; gauge filtering permits 135/120 where available. |
| [`ARCHITECTURE.md`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/ARCHITECTURE.md#L116-L140) | Named pipeline order and three-stage Film Edge explanation; §7.11/§8.10 explain crop and geometry contracts. |
| [`engine/tests/overscan_checks.py`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/engine/tests/overscan_checks.py#L123-L191) | Geometry, seed reproducibility, DX decoding, hole-softness and rendering assertions; useful acceptance-test patterns, not portable browser tests. |
| [`README.md`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/README.md) | Product Film Edge description and explicit credits/license/trademark sections. |
| [`LICENSE.txt`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/LICENSE.txt) | GNU GPL version 3 text; README declares app/engine GPL-3.0-or-later. |
| [`Resources/Licenses/README.txt`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/modern_UI/Spektrafilm/Spektrafilm/Resources/Licenses/README.txt) | Distinguishes SpektraLab source from Andrea Volpato's profile/LUT work; bundled attribution behavior. |
| [`license/SPEKTRAFILM_LICENSE.txt`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/license/SPEKTRAFILM_LICENSE.txt) | CC BY-SA 4.0 for upstream profiles, LUTs and direct derivatives; attribution and modification notices. |
| [`Profiles-and-LUTs-CHANGELOG.txt`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/modern_UI/Spektrafilm/Spektrafilm/Resources/Licenses/Profiles-and-LUTs-CHANGELOG.txt) | States 28 profiles are unmodified and eight baked LUTs are CC BY-SA derivatives. |
| [`engine/resources_product/NOTICE.md`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/engine/resources_product/NOTICE.md) | Separates SpektraLab's own B&W/product data from upstream resources and lists source data sheets. |
| [`Resources/FilmCovers`](https://github.com/JamesQiu2005/SpektraLab/tree/02d82b56cf65f0f8e802a708612edc4e9a4790af/modern_UI/Spektrafilm/Spektrafilm/Resources/FilmCovers) | Eleven JPEG covers named by the catalog; no adjacent artwork license/attribution file was found. |

### FilmFrame (local repository)

| File | Description |
|---|---|
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/services/filmGeometry.ts` | `PHYS_135`, nominal 35 mm / 36×24 mm / 38 mm advance / 4.75 mm pitch, plus separate landscape and side-rail layouts (`:4-134`). |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/services/filmOverlay.ts` | Registry of 16 real-135 template URLs; normalized 1307×1203 / `92,211,1123,800` geometry; single and strip layouts (`:3-59`, `:101-192`). |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/services/filmEngine.ts` | Main-thread layered Gold frame, flattened other-stock frames, programmatic Gold continuous strip and fallbacks (`:523-1053`, `:1058-1080`, `:1254-1268`). |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/services/filmWorker.ts` | OffscreenCanvas equivalents; layered Gold and flattened template routes (`:422-589`, `:674-909`). |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/services/filmTexture.ts` | Unseeded cached noise, dust, scratches, scan bands and film-stock texture (`:7-169`). |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/services/filmMarkings.ts` | Canvas text, safety-film/date labels and DX-like decorative bars; one alpha uses `Math.random()` (`:5-139`). |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/services/filmFrameNumber.ts` | Normalized roll numbering and dedicated Gold versus flattened-template positions (`:11-118`). |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/services/filmColor.ts` | Gold 200 byte-space RGB scaling, soft contrast and highlight compression (`:1-44`). |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/public/film-overlays/README.md` | Runtime asset contract and fallback notes. |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/docs/project/rendering.md` | Current renderer routing, assets, texture nondeterminism and export contracts. |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/tests/filmGeometry.test.ts` | Nominal physical and strip-layout checks; frame-number/orientation cases. |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/tests/filmOverlayTemplates.test.ts` | All 16 registry entries and exact four-band aperture clipping. |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/README.md` | `:202-204`: no repository license; code and film assets are not to be assumed freely reusable. |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/.trellis/spec/frontend/quality-guidelines.md` | Real-browser verification, asset normalization, Worker routing, render identity and Canvas budget contracts. |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/.trellis/spec/guides/code-reuse-thinking-guide.md` | Shared utility rather than duplicated rendering logic. |
| `/Users/zacheryxu/Code_NoIcloud/FilmFrame-main/.trellis/tasks/11-06-integrate-spektralab-negative/prd.md` | Local-only, staged integration, no unlicensed resource copying and explicit MVP/open-question requirements. |

## What SpektraLab's physical Film Edge actually does

### A. Film-space geometry and gate

- **Observed:** Coordinates are millimetres: `s` runs along the film and `t` across it. Each canvas pixel is mapped through a small scan rotation and translation. Portrait images can rotate the film direction without mirroring edge text ([`overscan.metal` `:1-40`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/engine/src/shaders/overscan.metal); `overscan.cpp:647-671`).
- **Observed:** The input frame is the gate. The app applies the crop before rendering and constrains it to the gate ratio; the returned canvas contains gate, rebate and holes, not a frame to be cropped again (`Session+FilmEdge.swift` opening comments; `FilmEdge.swift`, `FilmParams.cutsFrame`). This is different from adding a border around an already finished image.
- **Observed:** Full-frame 135 uses film width **35.0 mm**, measured gate **36.25×24.3 mm**, and eight perforations per 38 mm advance. The source's `PHYS_135`-like nominal table is not the same as FilmFrame's 36×24 gate. Half-frame is **18×24 mm**, four perforations / 19 mm advance. XPan is **65×24 mm**. 120 uses **61 mm** film and 56 mm across-the-film gates ([`overscan.cpp:96-124`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/engine/src/pipeline/overscan.cpp#L96-L124)).
- **Upstream claim:** The 36.25×24.3 gate is a mean from seven strips, not a universal ISO dimension. Gate families are `square`, `rounded`, `eared`, `shouldered` and `kicked`; only `square` is used by ordinary 135. Eared/shouldered/kicked variants are primarily associated with 120 bodies. Treat these as observed implementation data, not universally validated camera geometry.
- **Observed:** Four corner radii, low-amplitude side wobble, nicks, roughness and additive/subtractive gate polygons create non-perfect openings. Gate-to-emulsion gap and f-number determine a circular-aperture penumbra, not an arbitrary Gaussian border (`overscan.cpp:354-475`, `:566-603`; `overscan.metal:76-117`). Gate flare samples nearby scene brightness just outside the gate (`overscan.metal:168-182`).

### B. Film base, rebate and perforations

- **Observed:** The rebate is initially unexposed film exposure, not a painted brown/black rectangle. It develops and grains with the picture. Halation can spread beyond the gate because overscan exposure precedes halation and development ([`ARCHITECTURE.md:123-140`](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/ARCHITECTURE.md#L123-L140)).
- **Observed:** 135 perforation pitch is 4.75 mm; holes are **1.98 mm along the film × 2.80 mm across it**, 2.00 mm from the long edge, with a 0.50 mm base radius (`overscan.cpp:608-619`). FilmFrame's landscape constants use 2.8×2.0 in the corresponding landscape orientation; do not copy dimensions between differently oriented layout structs without transposing them deliberately.
- **Observed:** Each hole has seeded small location/size/radius deviations, roughness and occasional burrs. Film alpha includes an approximate **17 µm physical edge sigma plus pixel footprint**. In the printing stage, absent film receives dye densities fitted to cancel the film base (`overscan.cpp:712-741`; `overscan.metal:226-320`).
- **Observed:** Final scan light supplies white/open or black-backed hole interiors. The cut base wall can give a subtle warm/olive shoulder and occasional light spill; outside the strip is a separate black/open carrier (`overscan.metal:322-394`). The source test explicitly rejects a hard hole plus a uniformly dark surrounding ring (`overscan_checks.py:224-241`).
- **Upstream claim:** 17 µm and the measured 44–71 µm 10–90% edge transitions come from the owner's scans. They are not independent measurements from this research.

### C. Frame text and stock-specific imprints

- **Observed:** Text, bars, arrows and dot glyphs are laid out in film millimetres, rasterized to a coverage mask, slightly blurred, and added as per-layer exposure before development (`overscan.cpp:844-989`, `:1388-1509`; `overscan.metal:206-224`). This is why the marks can bloom and grain with the image rather than remaining crisp UI-like text.
- **Observed:** Stock layouts include Kodak, Fuji negative, Fuji slide, cine, Ilford and CineStill. Kodak 135 uses a 19 mm half-frame print grid, stock text and full/half frame numbers on the upper band, and DX tracks, numbers and arrows on the lower band (`overscan.cpp:1452-1568`). `Session.edgeText` supplies film-specific text; for Gold 200 it is `KODAK GB 200-7`, not just the picker name (`Session+FilmEdge.swift:198-245`).
- **Observed:** Gold 200's DX extract is 1548 in this implementation; its test decodes that value from rendered bars. The comment says this corrects a database value after reading a real strip (`overscan.cpp:1067-1086`; `overscan_checks.py:175-187`). **Do not present 1548 as independently verified by this research.** A first increment can use independently documented/owned reference data, or defer exact DX fidelity.
- **Observed:** `StockCatalog.json` maps IDs to marketing names, negative/positive type, default paper, gauge and optional cover artwork. It does not encode the measured edge geometry, printer exposure or DX tables. Those live in the engine and session (`kEdgeLooks`, `dx_extract_for`, `imprint_groups`, `Session.edgeText`). Copying only StockCatalog would not reproduce Film Edge.
- **Observed:** Some stocks borrow layouts because references are missing; examples are noted explicitly in `kEdgeLooks`. Some measured features remain assumptions. Edge appearance is therefore not uniformly verified across every catalog entry.

### D. Fog, light leaks and Date Back

- **Observed:** Edge fog decays inward from each long edge and varies slowly along the film. Spool/cassette leaks are localized along-and-across Gaussian-like exposure contributions, with a preferred camera-side choice (`overscan.cpp:673-710`; `overscan.metal:183-200`). On 135 the comment associates fog with cassette-lip light piping; on 120 it uses broader backing-paper-edge behavior.
- **Observed:** Their spectral color weights are derived from film sensitivity, illuminant and layer filtering, not fixed orange CSS overlays (`overscan.cpp:318-351`, `:704-710`). A browser-only colored gradient would be a different approximation.
- **Observed:** Date Back supports LCD, dots and shooting-data faces, in-frame or between-frame placement, and per-frame second-date handling for pairs. On supported 120 formats it prints in the margin; on 135 it can print between frames. This is beyond the proposed first increment (`FilmEdge.swift`, `DateBackSettings`; `overscan.cpp:1996-2150`).

### E. Seeded randomness: body versus frame

| Level | Observed behavior |
|---|---|
| Film/stock data | Text, print period, layout, DX and marker choice are deterministic per stock/format. |
| Camera/body | Gate radii/shape/wobble/nicks, gate gap/penumbra, film registration, perforation phase, spacing, gate flare and preferred leak side. One body is intended to remain coherent across a roll. |
| Frame/advance/scan | Per-frame advance error, weave, scan tilt/offset, fog/leak realization, hole/cut-wall variation and imprint-density variation. On 120, edge-number registration also varies because no perforations lock it. |

- **Observed:** Separate SplitMix64 streams avoid shifting every random choice when one feature is added (`overscan.cpp:72-94`, `:566-603`).
- **Observed:** A frame seed is initially derived from a stable file path and then stored; a body seed is shared per user and persisted. Frame numbers follow session order (`Session+FilmEdge.swift:308-357`). This is a product-state pattern, not a requirement to derive browser seeds from a user's local file path.
- **Observed:** `FilmEdgeSettings` defaults to full-frame 135, strip view, automatic gate, white holes, body/frame seed 1, fog 1 and leaks 0. Body and advance/scan have separate “another” controls (`FilmEdgeSection.swift:203-233`).

### F. Strip versus filed scans, half-frame and 120

- **Strip view:** Full 35 mm film width with partial inter-frame gaps. Full 135 draws 0.75–0.95 mm at each end (nominal 36.25 gate plus roughly 1.5–1.9 mm total); half-frame draws 0.40–0.50 mm. Default `carrier=none` ends the canvas at the film edge; optional black/open carrier adds 0.40 mm beyond each long edge (`overscan.cpp:621-650`). Current host copy says strip scans show no carrier by default.
- **Filed view:** Crops across the film to the gate plus approximately 1.1 mm on each side, with approximately 0.9 mm along each end (`overscan.cpp:638-641`). It is a mounted/filed-frame view, not evidence of another film gauge. `FilmEdgeSection.swift` retains summary helpers for this view even though the inspected visible panel controls focus on gate, holes, body, advance, fog and leaks; no claim is made here about its current UI visibility.
- **Half-frame:** Two 18×24 exposures share one normal full-frame piece of 135 with a 19 mm advance. `P_PAIR_ADV` samples the same gate twice. The app composes two separately framed/graded photographs and treats the pair as one export (`overscan.metal:156-166`; `ARCHITECTURE.md` §7.12). It is not a four-perforation version of FilmFrame's current contact strip.
- **120:** 61 mm unperforated stock, format-dependent gates, more gate centring/advance variation, stock print that is not sprocket-locked, and margin-only Date Back on supported formats. Its physical and interaction model should not be inferred from the 135 implementation.
- **Execution caveat:** Overscan refuses SpektraLab's striped/tiled executor (`overscan.cpp:520-523`). This reinforces that `strip.hpp` is unrelated to a photographic filmstrip; do not port that header for this feature.

## Conceptual comparison with FilmFrame

| Concern | FilmFrame observed now | SpektraLab observed | Practical distinction |
|---|---|---|---|
| Physical gate | Shared flattened-template aperture is `1123/800 = 1.40375`; landscape constants use nominal 36×24; fallback has a different side-rail model. | Full 135 uses measured 36.25×24.3 and body variation. | A real-film-like increment should not claim the current shared template aperture is physically exact 3:2. |
| Film base/rebate | PNG pixels or dark Canvas fills/gradients, plus random stock texture. | Unexposed/developed film over the whole expanded canvas; scan/base interaction at holes. | Static tint plus grain cannot reproduce density/scan coupling, but geometry and soft scan lighting are portable. |
| Perforations | Regular rounded rectangles and shadows; continuous strip computes pitch from image stride. | Film-mm pitch, registration, small per-hole variation and resolution-dependent optical softness. | The largest visible difference can be addressed without spectral processing. |
| Text/DX | Arial/Helvetica Canvas text; decorative DX-like bar patterns; dynamic Gold numbers in free rebate spaces. | Film-mm stock-specific layout, dot faces, actual DX encoding, developed imprints. | Reusing existing Canvas text with independent reference measurements is a bounded first step; exact font/glyph copying is unnecessary. |
| Fog/leaks | No corresponding Film Edge exposure model was found in current render paths. | Pre-development warm fog/leaks with separate body/frame variation. | Implement only restrained, explicitly approximate edge light in the first look; do not claim chemical fidelity. |
| Grain/order | Gold look and grain are aperture-only; border/template composited afterward. Grain is unseeded. | Expanded film is developed/grained together; scan lighting is last. | For parity with the chosen approximation, keep rebate texture within the new film layer and final hole light after texture. |
| Body/frame variation | `Math.random()` in grain, texture, DX alpha and strip texture; no body/frame seed contract found. | Stable independent body and frame streams. | A seeded plan is both an appearance improvement and a prerequisite for reliable visual regression tests. |
| Single/strip | Gold has a programmatic continuous strip; the other 15 registered stocks repeat complete flattened templates with zero inter-template gap. | One physical strip exposure per frame; half-frame pair is a separate composed entity. | Extend Gold's existing continuous-strip concept using shared millimetre geometry; preserve the other 15 paths. |
| Color model | Byte-space `applyGold200Look`, no linear-light or spectral stage. | 81-wavelength film/paper pipeline, ProPhoto-oriented color management. | This increment changes film geometry/appearance, not negative-to-print color science. |
| Runtime | Main Canvas and Worker OffscreenCanvas, local images, established Blob/Object URL exports and canvas budgets. | C++20 + Metal on macOS; CoreText/CoreGraphics/vImage for imprint rasterization. | No native engine, WASM or remote service is needed for the first visual increment. |

### Existing behavior that the first increment should preserve

**Proposal:** Add a separate opt-in physical-135/Gold look rather than silently replacing `real135` or mutating the flattened templates. Existing `classic`, legacy Gold layered/PNG fallback and the other 15 stock paths remain available and unchanged by default.

- Reuse `drawImageCoverAutoRotate` / `RenderTransform`, automatic portrait handling and user crop/focus/zoom rather than introducing a second crop model.
- Reuse `getFrameNumberForImage` and the frame-number color override; physical-mode seeds must participate in recipe/render-result identity, not live only in component state.
- Retain preview/high-resolution policy, 4:3 scanner option, output MIME/quality, Blob URL + byte-size metadata, strip ordering and existing canvas budget/admission checks.
- Use one shared typed geometry/seed plan and Canvas-compatible drawing helpers for main and Worker paths. Thin adapters may manage `HTMLCanvasElement` versus `OffscreenCanvas`; duplicated independently varying geometry, text and seeds would recreate current parity risks.
- No network conversion, remote GPU or imported native application. An asset-free procedural first look can run wherever existing Canvas rendering runs.

## Feasible 135-only first increment (proposal)

### Scope

**One Kodak Gold 200 full-frame 135 physical-strip look, for one frame and the existing continuous multi-frame Gold strip.** Use independently measured/owned reference film or explicitly labeled nominal geometry. Keep current looks as fallbacks and compatibility choices. No copied source, profiles, LUTs, icons, covers, reference scans, proprietary fonts or exact SpektraLab stock tables.

Suggested progression, not an approved implementation plan:

1. **Shared millimetre layout + deterministic plan.** Landscape full-frame gate and 35 mm stock; eight perforations per frame on a 4.75 mm pitch; small bounded gate offset/corner variation per body; frame-specific scan tilt/offset; frame numbers remain sequential. Keep a fixed debug seed in tests.
2. **Film material and aperture.** Procedural dark/warm base, a restrained aperture shadow/soft edge and low-amplitude rebate texture. Clip photo coverage to the gate without covering the aperture with opaque template pixels. Apply existing Gold color only to the photograph for this first increment, so A/B tests isolate border changes from a new color algorithm.
3. **Perforations and scan light.** Punch regular-but-not-identical rounded holes on the physical grid; soft edges at a chosen pixels-per-mm scale; independently chosen white/black backing behavior; subtle cut-wall/edge light, not a uniform black halo. For a continuous strip, evaluate pitch across the row, not separately per photo.
4. **Gold edge print.** Independently drawn stock text, frame number/`A` marker, simple arrow and documented DX-like or real DX data only when its accuracy/provenance is established. Rasterize into the film plan before the rebate texture/grain approximation so marks share its softness/texture. Do not add `SAFETY FILM` or batch numbers to Gold solely because a generic preset contains them.
5. **Optional edge fog, initially restrained or off by default.** Seeded smooth inward falloff and sparse edge leaks, visually checked on bright/dark photographs. Do not use exact upstream exposure ranges or claim these are photochemically calibrated. Leaks default off matches the pinned model; the first increment may defer leaks without blocking geometry validation.
6. **Main + Worker parity and strip.** Generate the same immutable plan from body seed + stable image identifier/roll index + strip identity. Preserve seeds on re-render and keep body characteristics fixed across the roll; changing advance/frame seed must not regenerate the body. Do not use local path names, file bytes, timestamps or upload/network calls to derive seeds.

### Explicit exclusions for this increment

- 135 half-frame/pair composition, XPan, all 120 formats and non-square gate families.
- Filed/mounted scan mode, black/open carrier extension beyond the film, Date Back and shooting-data imprint.
- Portra/other-stock measured layouts, spectral film/paper conversion, negative-scan inversion, RAW decoding, ICC color management, native Metal/WASM port and remote service.
- Exact parity with SpektraLab pixels or fonts. Acceptance should target independently defined FilmFrame behavior and physical plausibility, not clone a GPL shader.

### Why this is feasible in Canvas

The necessary first-step operations—rounded paths, clipping, transforms, text, gradients, small procedural coverage masks, alpha compositing and seeded noise—are available in the current main-thread and Worker Canvas models. A per-frame millimetre plan is cheap; only bounded raster textures/masks need allocation. The existing continuous Gold strip already establishes row-based film and per-frame cover/number handling. The spectral and CoreText-dependent portions are not prerequisites for these visual improvements.

## Visual acceptance checks (proposal)

All tests should compare **the same source, crop, color settings, body/frame seeds, resolution and output format**. First establish a fixed-seed procedural baseline; do not rely on existing unseeded grain for exact snapshots.

### Automated geometry and deterministic rendering

1. **Nominal layout:** At 100 px/mm, landscape 35 mm stock is 3500 px across. The independently selected gate has its declared physical dimensions; eight perforation pitches span 38 mm. Ensure orientation transposition does not swap 1.98×2.80 mm holes incorrectly.
2. **Gate registration:** Gate stays within the perforation grid and inter-frame advance; photograph reaches the gate without a black outline or transparent seam. No border text crosses into the image except an explicitly later Date Back feature.
3. **Hole softness:** At preview and high resolution, 10–90% transitions remain visibly soft but bounded, with no uniform dark ring. If adopting the upstream **candidate** 35–75 µm test band, label it as borrowed test guidance pending independent reference measurements, not FilmFrame's verified physical truth.
4. **Seed contract:** Same body/frame seeds + inputs => identical geometry and texture (and pixel output in the same browser). Different frame seed changes only advance/scan/fog/hole-level attributes; different body seed also changes persistent gate/registration attributes. All frames in one strip retain the same body choices.
5. **Resolution independence:** Seeds address physical coordinates, not array iteration. Preview and high output have matching gate/text/hole positions and no re-randomized composition; expected differences are raster sampling only.
6. **Text:** `KODAK GB 200-7` (only if independently validated for the selected Gold reference), frame `N` and `NA` markers are legible, oriented with the film, and do not overlap. Changing frame number changes both visible number and any intentionally supported encoded DX data.
7. **Color isolation:** With physical-edge look off versus on, the gate's photo pixels match when grain is disabled and geometry is aligned. This proves an edge improvement is not secretly a new Gold color transform.
8. **Fog controls:** Fog=0 leaves no fog; leaks=0 leaves no leaks. Monotonic controls do not change the body seed or crop. Highlights near the gate do not clip into an opaque orange outline.
9. **Single/strip parity:** One frame from a strip has the same gate/text/holes as its single-frame rendering at the same effective px/mm and seed. Continuous strips do not reset perforation pitch or stock print per frame.
10. **Regression matrix:** Existing 16 template registry/aperture tests, Gold PNG/layered fallback, frame-number color override, crop/portrait/user rotation, 4:3 scanner, JPEG/PNG, one/four/five-frame strips, Worker success and main fallback, and unchanged current recipes.

### Human visual review

- **At fit-to-screen:** It reads as one continuous strip, not repeated cards. Gate, holes and rebate have plausible relative sizes. Film text follows the strip and is not mirrored after portrait rotation.
- **At 100% and 200%:** No knife-edge holes, identical repeated hole damage, excessive scratches, uniform dark rims, hard-edged orange fog, crisp screen-font imprints, text collisions or seams at frame boundaries.
- **Across several seeds:** Variation is restrained and coherent; a roll looks like one camera/body, while separate frames do not have identical scan tilt, fog or hole edges.
- **Bright and dark source images:** Gate-edge behavior remains subtle and the base retains material detail; no source-dependent black frame or unexpected global color shift.
- **Browsers:** Chromium, Firefox and WebKit compare screenshots for the same deterministic fixture, then verify Worker-off fallback and real mobile Safari according to existing project policy. Font selection/rasterization differences should be bounded by using an explicitly licensed bundled font or independently drawn simple glyphs, not reliance on macOS Helvetica Neue.

### Useful upstream acceptance precedent (not executed here)

`overscan_checks.py:123-149` checks off-size preservation, 135 physical canvas dimensions, same-seed equality and changed-frame behavior; `:224-303` checks hole softness/no dark ring and differing shoulders; `:375-388` checks frame numbers; `:476-506` checks carrier distinctions. Its `:163-166` also confirms the tiled executor limitation. These tests were read, not run, and no SpektraLab reference renders were generated or visually inspected during this research.

## Licensing and attribution: practical engineering constraints

### Verified declarations

| Material | Observed terms and source | Engineering consequence |
|---|---|---|
| SpektraLab app/engine, including overscan C++/Metal and Swift | README declares **GPL-3.0-or-later**; root `LICENSE.txt` contains GPLv3. | Copying, translating or adapting implementation into distributed FilmFrame code requires a deliberate GPL compliance/license decision. A Canvas rewrite is not automatically independent merely because it is TypeScript. |
| Original 28 measured film/paper profiles and eight derived preview LUTs | README and bundled license notice declare **CC BY-SA 4.0**, credit Andrea Volpato / `spektrafilm`, and link the canonical upstream. Changelog says profiles are unmodified and LUTs derived. | Reuse requires attribution, source/license links, license preservation, modification indication and share-alike for adapted material. Do not relabel these as GPL assets. |
| SpektraLab's own `resources_product` profiles/data | `NOTICE.md` separates them from upstream resources and documents data-sheet provenance, but does not state a separate standalone license there. | Do not infer a new permissive grant from “not spektrafilm's.” Evaluate under the repository's declared app/engine terms and seek clarification for data redistribution as needed. |
| `StockCatalog.json` and cover filenames | Catalog is generated from profile metadata; no separate catalog license notice was found. | Do not assume it is CC BY-SA merely because it references profile IDs, or freely reusable merely because it is JSON. A clean first increment needs none of it. |
| `FilmCovers/*.jpg`, screenshots and icon artwork | README credits code/profiles/metal-cpp; trademark section separately withholds SpektraLab name/icon from the code/data grant. No explicit FilmCovers/screenshot/asset license was found in the searched tree and license bundle list. | Treat artwork redistribution permission as **unverified**, not as automatically GPL/CC-BY-SA. Exclude all such images and the icon. |
| Fonts | Overscan names Helvetica Neue, Menlo and Arial Narrow through native platform APIs; no bundled font files were found in the pinned tree. | A system font reference is not a grant to extract/redistribute a font. Use independently drawn glyphs or an appropriately licensed font with its own notice. |
| SpektraLab name/icon | README states trademark registration is in progress, requests a distinct name/icon for published forks, and permits clear unofficial “based on” references. | FilmFrame must not brand itself as SpektraLab or imply endorsement. Film stock names also remain third-party marks; factual labeling is a separate review issue from copyright. |
| FilmFrame code/current PNG assets | Local README says no license file and warns against assuming free copying/modification/commercial use. No asset-specific credits were found in `public/film-overlays/README.md`. | Resolve provenance before relicensing or distributing a GPL-derived combined work. This report cannot clear those rights. |

### GPL-3.0-or-later: if direct code reuse is chosen instead

- The GPL text defines modification as copying/adapting all or part of a work; changing language or GPU API does not, by itself, establish a clean-room implementation. Preserve copyright/license notices, mark modified source, provide appropriate legal notices and comply with corresponding-source obligations for distributed covered/combined works as applicable.
- GPLv3 §6 permits object-code distribution with equivalent source access under its conditions. Serving a browser application/JavaScript bundle to users is a software distribution scenario to review even though **photos remain local**; “local processing” is not a licensing exemption.
- GPLv3 §0 distinguishes mere network interaction with no copy transferred from conveying, and §13 here concerns combination with AGPL. Do not claim ordinary GPL automatically imposes an AGPL-style network-source obligation. Conversely, do not use that distinction to ignore actual distribution of JS/WASM/application copies.
- GPL-3.0-**or-later** is not equivalent to MIT/BSD/Apache permissive reuse. Before implementation, the project owner must decide whether the resulting covered work and its distribution model can satisfy those obligations, including the currently unlicensed FilmFrame portions.
- The recommended first increment avoids this fork by using no copied/translated code. A separate helper process or remote service would add architecture/privacy costs and should not be treated as a magic way to bypass license analysis.

### CC BY-SA 4.0: if profiles/LUTs are chosen later

- Retain Andrea Volpato's name, canonical `https://github.com/andreavolpato/spektrafilm`, supplied copyright/license/disclaimer notices and CC BY-SA 4.0 text/link; mark changes and retain earlier modification indications. The upstream preamble requests a separate changelog for changes.
- Shared adapted material must use CC BY-SA 4.0, a later same-elements license or a BY-SA-compatible license, without additional restrictions on recipients' exercise of those rights. Keep asset-specific licensing/attribution intact within the larger application rather than asserting one vague global license.
- The upstream license explicitly says finished films/photographs are the user's works and imposes no copyleft on those outputs. It distinguishes creative output from redistributed profiles, LUTs and other direct encodings.
- The proposed 135-only visual increment does not need any measured color profile, print LUT, baked resource or CC BY-SA artwork. Avoiding these assets greatly reduces scope but does not excuse copied GPL implementation code.

### Clean-room recommendation and its limits

**Recommended development boundary:**

1. Record functional requirements and independently observable physical facts: film runs in millimetres; 135 is 35 mm wide; frames advance on a perforation grid; gates/scanning are imperfect; factory imprints are physical marks; scan backlight is seen through perforations.
2. Acquire FilmFrame-owned or appropriately licensed reference strips/scans and take independent geometry/edge-softness/color measurements. Document which values are measured, nominal standard, or artistic choices.
3. Have implementation work from that independent physical specification, not from transcription of the pinned functions, exact magic-number tables, dot glyph arrays, hash streams, shader formulas, edge layouts or raster parameter block. Do not paste this report's source-linked implementation details into code comments as a substitute specification.
4. Keep third-party resource ingestion out of the first increment: no StockCatalog, profiles/LUTs, FilmCovers, icons, screenshots, fonts or generated SpektraLab reference masks.
5. Maintain a provenance manifest for every new reference/asset and a short clean-design note. Cite SpektraLab only as conceptual research inspiration, without implying affiliation.

**Important caveat:** “Clean-room” is a process description, not a legal guarantee. The researcher has read GPL implementation source; independently writing code afterward is not automatically uncontaminated. Strict separation of functional requirements from expressive implementation, independent measurements and project-owner/legal review are required if this distinction matters. Exact numerical physical facts may have different treatment from expressive tables/code in different jurisdictions; this report does not decide that question.

## Caveats / not found

- SpektraLab's referenced `reference_film/`, owner scans and many RFC/research documents were **not present** in the pinned public tree returned by GitHub. Measurement claims in comments were not independently reproduced. No upstream binary was built or run.
- No full filed-mode UI presentation or direct visual sample was evaluated. Filed geometry comes from the pinned engine layout, not a visual screenshot.
- No explicit FilmCovers, screenshot, generic artwork, StockCatalog, or font redistribution license was found beyond the identified GPL/CC notices and trademark statement. Absence of a found notice is not proof that no permission exists elsewhere; it means permission is unresolved for this engineering decision.
- The separate `resources_product` data has provenance documentation but no separate standalone license statement in its NOTICE; do not conflate it with the explicitly CC BY-SA original 28 profiles.
- FilmFrame's PNG creation tools, original source scans and asset copyright holders were not identified in the searched renderer docs. This must remain an open licensing question.
- FilmFrame's current real-135 Gold strip is programmatic; its single-frame Gold look is layered PNG plus dynamic markings. Other stocks' strips are complete flattened frames joined edge-to-edge. These are distinct current behaviors, not one universal renderer.
- SpektraLab's `strip.hpp` concerns executor bands, and its overscan path rejects striped execution. Neither it nor the Metal shader is a drop-in browser filmstrip implementation.
- No source code, project specs, configuration or git state was changed. Only this research document was written.
