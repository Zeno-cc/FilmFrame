# Research: independent B&W, positive, and CineStill imaging paths

- Query: Trace the exact pinned SpektraLab algorithms, calibration assumptions, tests, and practical FilmFrame CPU/WebGL2 slices.
- Scope: mixed (pinned source inspection plus local FilmFrame integration surfaces).
- Date: 2026-11-11
- Source pin: `JamesQiu2005/SpektraLab@02d82b56cf65f0f8e802a708612edc4e9a4790af`.
- Method: static reading and data-only JSON/blob inspection. **No upstream script, library, build, or test was executed.** No implementation or distribution clearance is claimed.

## Citation convention

Paths below are repository-relative within the pinned source tree unless prefixed `FilmFrame:`. Exact absolute source root is `/tmp/filmframe-spektralab-source-20261111/extracted/SpektraLab-02d82b56cf65f0f8e802a708612edc4e9a4790af`. JSON product profiles are each a single physical line; references to `...json:1` therefore cover the complete object, including `metadata.tags`, not merely an array.

## 1. Shared structure that matters to all three paths

### Files found

| File | Role |
|---|---|
| `engine/src/core/profile.hpp:35-80`, `profile.cpp:49-175` | `info.type`, `channel_model`, illuminants, measured arrays, normalized curves |
| `engine/src/core/params.cpp:533-590` | film-specific halation and DIR presets |
| `engine/src/core/curves.cpp:98-165` | 1-D table setup and pre-DIR curve inversion |
| `engine/src/pipeline/pipeline.cpp:1846-1907`, `1963-2016`, `2071-2087` | physical pitch, stage ordering, paper bypass |
| `engine/src/shaders/nodes.metal:79-91`, `165-222` | curve, DIR correction, fused spectral, print exposure kernels |
| `FilmFrame:services/spectral/portraPipeline.ts:47-91` | existing fixed five-stage color-negative CPU route |
| `FilmFrame:services/spectral/film.ts:17-55`, `print.ts:75-108`, `scan.ts:58-76` | current CPU film development, paper development, scan |
| `FilmFrame:services/spectral/webgl/renderer.ts:38-39`, `214-249` | current GPU passes and bindings |
| `FilmFrame:scripts/spectral/export_stock_pair_resources.py:163-186` | current exporter explicitly rejects non-`negative`/non-`color` profiles |

There is **no separate C++ monochrome engine pipeline** keyed on `channel_model == "bw"`; the only engine read of that field is profile parsing (`profile.cpp:60,224`). B&W distinction comes from different film/paper arrays and caller policy. Positive development is distinguished by `is_positive()` in curve/DIR/scan stages. CineStill has a distinct halo selected from its own profile tag.

The common profile arrays are 81 wavelengths and three channels, with `normalized = density_curves - nanmin(density_curves, axis=channel)` (`profile.cpp:73-89`, `166-174`). The normal film interpolation is `C_c(logRaw_c) = interp(logRaw_c, logExposure / gamma, normalized_c)` (`curves.cpp:98-111`; `pipeline.cpp:221-232,1245-1275`). A positive profile's density falls with exposure; interpolation handles that directly. There is no generic `1 - density` negative inversion in this route.

The exact final scan integral is

```text
D_c(lambda) = base(lambda) + sum_c CMY_c * channelDensity(lambda,c)
T(lambda) = 10^(-D(lambda))
out_c = sum_lambda T(lambda) * illuminantTimesReceiver(lambda,c)
```

with unmeasured/invalid wavelengths zeroed in prepared constants. See `nodes.metal:185-210`, `pipeline.cpp:322-338,1626-1635`; FilmFrame's equivalent is `FilmFrame:services/spectral/print.ts:5-27`. Print exposure is `log10(max(10^(logRaw) * exposure, 0) + 1e-10)` (`nodes.metal:213-222`). These pointwise stages can be implemented without an 81-samples-per-pixel image.

## 2. B&W profiles and Multigrade semantics

### 2.1 Source-backed product resources

`engine/resources_product/NOTICE.md:1-29` identifies four independently authored product film profiles, the Multigrade paper, filter table, and CineStill alias. It distinguishes these from the CC BY-SA spektrafilm profiles. All four B&W film profiles are `type: negative`, `support: film`, `channel_model: bw`, `target_print: ilford_multigrade_iv_rc`, with the same panchromatic emulsion replicated in three channels. Film channel density is `[1/3,1/3,1/3]` at all wavelengths; base density is spectrally flat. These are data representations, not a claim of three color-sensitive emulsions.

| Film and pinned data reference | Fixed calibration / explicit assumptions in `metadata.tags` |
|---|---|
| `resources_product/profiles/kodak_tri_x_400.json:1`; summary `NOTICE.md:9` | Tri-X 400, D-76 large tank, interpolated 7.72 min / CI 0.56. Sheet exposure `log10(0.8/400)+1 = -1.699 log lux-s`; base+fog 0.286; measured range -1.74..2.04 logE, flat toe, slope 0.473 to gross D 3.0 ceiling. Sensitivity 380-668 nm plus assumed -0.0526 dex/nm tail. |
| `resources_product/profiles/kodak_tmax_100.json:1`; `NOTICE.md:10` | T-Max 100, D-76 small tank, 6.18 min / CI 0.56. ISO anchor `log10(0.8/100)+1 = -1.097`; base+fog 0.209; sheet -2.04..1.74, slope 0.601 to gross D 3.2. Sensitivity 400-700 nm, held below 400, assumed -0.0354 dex/nm tail. |
| `resources_product/profiles/fujifilm_neopan_acros_100_ii.json:1`; `NOTICE.md:11` | Acros II, D-76 20 C, 7.25 min, CI 0.572. Same ISO 100 anchor; base+fog 0.1442; sheet -2.10..1.56, slope 0.802 to gross D 3.0. The 5400 K blackbody is divided out of the daylight spectrogram; 401-662 nm measured, held below 401, assumed -0.0680 dex/nm tail. |
| `resources_product/profiles/ilford_hp5_plus_400.json:1`; `NOTICE.md:12` | HP5 Plus, ILFOTEC HC 1+31, 6.5 min, CI 0.599. Base+fog 0.1748; sheet -2.03..2.03, slope 0.634 to gross D 3.0. Relative exposure is assumed to place film exactly at rated ISO 400. The 2850 K wedge spectrogram is taken **as drawn**, not divided out, with assumed log-unit ordinate and -0.0365 dex/nm tail beyond 654 nm. |

All use a generated 256-point log exposure axis from -3 to 4. All scale sensitivity so a 0.184 grey maps to raw 1. Their `density_curves_layers` are fitted three-CDF decompositions, not measured sublayers; product caller disables sublayer grain on B&W (`Params.swift:754-761`). Profile references give fit errors: Tri-X 0.0047 D, T-Max 0.0088 D, Acros II 0.0139 D, HP5 0.0087 D. Hanatos adaptation is deliberately absent. This does **not** imply the existing tc-LUT generation can simply ignore profile-specific window/surface behavior for every other stock; it is a property of these B&W profiles.

The product's current calibrated grain multipliers are host, not profile, constants: Tri-X 1.70, HP5 1.49, T-Max 0.74, Acros II 0.64 (`Params.swift:592-611,800-803`). The documented measurement conditions are 6 um pixels, one-layer grain, net density 1.0, 48 um aperture, with target RMS 17, 16, 8, 7 respectively. Those `research/bw-films/grain/` data are missing from this archive. `AGENTS.md:345-348` explicitly says B&W grain/sharpness/halation are not all calibrated to the sheets. Do not infer full physical granularity from the tone profiles.

### 2.2 Multigrade paper is a feasibility fit

`resources_product/profiles/ilford_multigrade_iv_rc.json:1` models three emulsions, one per transport channel, each as a sum of three normal CDFs. Its `metadata.provenance` states:

- paper sensitivity chart shape is taken as **linear relative sensitivity by assumption** and split into shared blue and green responses; split edge and green speeds are fitted because per-emulsion sensitivities are not published;
- channel density is assumed spectrally flat silver (`1` per channel);
- base is assumed flat `0.06`;
- origin is chosen so Tri-X mid-grey at filter 2 lands at Y=0.184;
- fitted green-speed offsets are `[0, -0.7607054540, -1.7275822015]`, blue edge 465.4381848689 nm, edge width 6.6377252765 nm, `dmax_over_base = 2.22`.

`NOTICE.md:13` calls it a feasibility fit. Neutrality comes from flat silver paper dyes and matching developed channels; it does not turn the three paper emulsions into a color-print response. Product pairing enforces silver-on-silver / color-on-color (`StockCatalog.swift:128-142`).

### 2.3 Exact filter and exposure arithmetic

`resources_product/paper_grades.json:1-43` is caller input, not automatically loaded by the engine (`NOTICE.md:23-28`). It fixes `film=kodak_tri_x_400`, `paper=ilford_multigrade_iv_rc`, `enlarger_illuminant=TH-KG3`, no half grades. Grade 2 is reference `print_exposure=1`; all four B&W films use the same filter pack because mid-grey normalization is per film.

| Grade | M neutral | Y neutral | `print_exposure` |
|---|---:|---:|---:|
| 00 | 0.0 | 199.0 | 0.5323 |
| 0 | 0.0 | 137.9 | 0.6642 |
| 1 | 0.0 | 99.8 | 0.8257 |
| 2 | 0.0 | 68.0 | 1.0 |
| 3 | 0.0 | 34.1 | 1.159 |
| 4 | 39.1 | 0.0 | 1.334 |
| 5 | 151.7 | 0.0 | 1.3507 |

C neutral is 0 for every row. `neutral_print_filters.json:1-25` repeats `[C,M,Y]=[0,0,68]` for all four films under TH-KG3. The product currently sends grade 2 only and documents that no grade UI exists (`Params.swift:584-590,826-835`). `filter_shift_scale` is engine default 1; neutral M/Y are distinct from live shifts (`params.hpp:339-350`). Filter shifts are **not** grade numbers.

At `printing.cpp:92-108`, effective CC is `[Cneutral, Mneutral + Mshift*scale, Yneutral + Yshift*scale]`; packs are not clamped to nonnegative. Dichroic transmission is `10^(-CC/100)`, each filter is dimmed toward transparent, and the three multiply the light (`spectral.cpp:70-101`). TH-KG3 is a 3400 K blackbody times the baked KG3 transmittance, then normalized to mean 1 (`spectral.cpp:18-57`). The blob contains `filters/kg3` as float64 `[81]`; it is extractable as data using the documented `SPKR` format (`tools/bake_resources.py:15-28,44-50`, `blob.cpp:150-192`).

For each grade, compute `prepare_spectral_constants` with the filtered light and `10^paperLogSensitivity`, evaluate the same negative spectral integral, and apply `print_exposure` before the paper curve. The mid-grey gain is **not** part of the grade value: it is independently derived from the film's 0.184 mid-grey spectral density through the selected light/paper and is `1/geomean(rawRGB)` (`printing.cpp:107-185`). The gain is geometric-mean scalar replicated across channels, preserving the filter pack's color. Note the deliberately fixed **sRGB** mid-grey probe even if input color space differs (`printing.hpp:42-57`). The default exposure-compensation branch retimes against mid-grey at `0.184 * 2^cameraEV` (`printing.cpp:169-185`); that is separate from grade exposure.

The paper curve evaluated at rendering time is not the raw `density_curves` array: `print_curves_morph` evaluates the profile's fitted CDF model; at default morph-off, `D(x)=sum_l A_l * Phi((x-center_l)/sigma_l)` for a negative paper (`curves.cpp:23-40,167-180`). FilmFrame's existing exported `paperFittedCurves` matches this route, but its resource setup must include the Multigrade model and the filtered receiver for each grade. The scanner's default black/white correction is off (`params.hpp:357-364`); `print_exposure_bw_gain` is 1 in that configuration (`printing.cpp:227-250`). If enabled, it retimes exposure to preserve mid-grey through a luminance-only black/white stretch, rather than regrading the paper.

B&W optional lens filter semantics are also explicit: sensitivity is multiplied by Wratten transmission divided by the green-layer's factor under the reference illuminant, so neutral grey keeps its exposure (`hanatos.cpp:159-183`). The edge exposure uses the bare camera sensitivity and does not receive the lens filter (`pipeline.cpp:187-194`). Transmittance provenance is in `camera_filters.hpp:1-11`; the product research file behind its claimed filter-factor comparisons is absent.

### 2.4 Practical FilmFrame B&W slice

1. **Setup / resource layer:** accept `channel_model=bw`, pair only the four film IDs with Multigrade, retain the actual product profiles and provenance, build per-grade filtered-enlarger receivers and mid-grey normalization. The existing exporter's `negative/color` guard and Hanatos requirement (`export_stock_pair_resources.py:163-186`) make it unsuitable unchanged.
2. **CPU:** reuse scene-to-raw, log, curve and two spectral integrals from `film.ts` and `print.ts`, with B&W-specific setup and default non-layered grain policy. Keep `negativeDensity -> paperLogExposure -> paperDensity -> printRgb`, but do not present that as a color-negative preset. Multigrade's three channels are required to make grade work; a single global gamma is not equivalent.
3. **WebGL2:** the existing `filmRaw`, `negativeDensity`, `paperLogExposure`, `paperDensity`, `printRgb` passes suffice for the tone path (`renderer.ts:38-39,214-249`). Grade selects setup tables; no additional full-frame pass is necessary. Non-layered grain and lens-filter-aware tc-LUT generation are setup/backend additions, not a fourth paper channel.
4. **Parity anchors:** neutral color-chart channels within 0.002, grade-2 displayed mid-grey density 0.55-0.95, monotonic density spans 00 < 2 < 5 with span5 > 1.3*span00, and lens-filter directional/neutral assertions from `bw_checks.py:73-128`. These are source-defined acceptance rules, not stored golden output and not yet FilmFrame results.

## 3. Positive / slide develop-to-positive and film scan

### 3.1 Exact branch and order

`profile.hpp:35-46` treats `info.type == "positive"` as the switch. All four positive profiles have 256 samples, `reference_illuminant=D55`, `viewing_illuminant=D50`, and no target paper. Their curves descend: e.g. Provia starts `[2.5543,2.5433,2.0745]` and ends near zero; Velvia starts `[2.7296,3.5719,2.8576]` and ends near zero. Provia/Velvia/Ektachrome have strong antihalation, Kodachrome weak. All four JSON resources have generic spektrafilm provenance, not stock-specific development-process calibration metadata.

The actual chain is:

```text
scene RGB -> spectral raw -> log10(max(raw,0)+1e-10)
          -> positive film's descending normalized curves
          -> positive-specific DIR (when enabled) -> grain
          -> DIRECT FILM SCAN, no enlarger/paper exposure/paper curves
          -> film base + dye spectrum under film viewing illuminant
          -> XYZ -> output RGB/gamut/CCTF
```

Source: `pipeline.cpp:1245-1275,1963-2016`; scan receiver chooses the film when `io.scan_film` (`pipeline.cpp:322-338`). `Params.swift:527-541` explicitly defines the direct film scan; `Session.swift:3123-3156` selects it on positive-stock choice while preserving the paper preference. **The engine does not force this from `type`:** raw default is `scan_film=false` (`params.hpp:429`), and `init_params` loads whatever pair the caller requests (`params.cpp:668-681`). Product selection must therefore enforce direct scan; merely marking a profile positive is insufficient. `StockCatalog.swift:49-56` says printing a positive is technically possible but unwanted product policy.

The scanner integral retains the film's own `base_density` and `channel_density`; there is no base subtraction or inverse print development. `node_glare` and EDR bypass direct film scans (`pipeline.cpp:1703-1705,1748`; `Params.swift:564-576`). Default scanner blur/unsharp still run, so an implementation claiming exact product output cannot stop immediately after the XYZ integral. DI is disabled for positives (`pipeline.cpp:287-290`; `engine.cpp:1630-1634`). Black/white correction on directly scanned positives is explicitly unimplemented and rejected (`pipeline.cpp:1245-1256,1548-1557`), while a negative direct scan bypasses that correction.

### 3.2 Positive DIR is different arithmetic, not an inverted negative LUT

`apply_film_specifics` sets positive default same-layer gamma `[0.12,0.08,0.06]`, interlayer R->GB `[0.12,0.06]`, G->RB `[0.08,0.06]`, B->RG `[0.06,0.06]`; negatives use `[0.336,0.319,0.273]`, `[0.353,0.302]`, `[0.154,0.353]`, `[0.168,0.226]` (`params.cpp:566-578`). Velvia scales positive defaults by 0.9 and Provia by 1.3 (`params.cpp:580-590`). These are engine constants, not per-stock measured DIR data.

At setup, convert normalized positive density to silver density `silver = Dmax - D`; pre-DIR log exposure is `LE0_m = LE_m - sum_k silver_k * matrix_km`; then interpolate `-D` against LE0 and negate the result (`curves.cpp:128-165`). At render time the correction field uses `Dmax - developedCMY` before multiplying by the matrix (`nodes.metal:165-182`), and is subtracted from log raw before applying the pre-DIR curve (`pipeline.cpp:1278-1307`). This is necessary for source semantics. The current FilmFrame `developFilmPixel` always uses normalized density directly (`FilmFrame:services/spectral/film.ts:17-35`) and therefore cannot serve positives unchanged.

Positive sublayer grain, if enabled, negates both the curve axis and query (`pipeline.cpp:255-277`). That is another independent distinction; positive support should not inherit the color-negative grain code path untested.

### 3.3 Practical FilmFrame positive slice

1. **Schema / setup:** add positive capability and `directFilmScan` mode, `filmDensityMax`, positive-pre-DIR curves/matrix, and scan constants made from film (not paper) plus D50 CMFs. Existing `PortraSetupResource` fields and names (`types.ts:43-60`) and CPU stage types (`types.ts:69-89`) are color-negative-specific; they are not evidence of positive support.
2. **CPU:** reuse exposure/log/curve and `spectralIntegral`; add positive DIR correction as above, then `filmDensity -> XYZ(film dyes/base,D50) -> output`. Skip `exposePaper` and `developPaper`, not by zeroing a paper but by an explicit route (`portraPipeline.ts:65-80` is the current fixed path).
3. **WebGL2:** use a positive development shader or an explicit positive branch in film development, bind film spectral constants into a film-scan program, and route developed density directly to scan/output. `renderer.ts:228-249` is the insertion boundary. Keep paper intermediates out of capability claims and working-set accounting for direct scan.
4. **Validation:** source coverage includes positive DIR setup (`dump_setup.cpp:154-182`), a Velvia render parity case (`parity_render.py:121,134-140`), and all-four-stock direct-scan/paper-independence product tests (`desktop_preview.cpp:388-458`). These require their respective native/Python fixtures. There is no standalone four-positive numerical golden set in this archive.

## 4. CineStill no-rem-jet back-reflection

### 4.1 Identity and branch selection

`resources_product/profiles/cinestill_800t.json:1-13` is only `derived_from: kodak_vision3_500t` plus `info: {name,use:still,antihalation:no}`. `load_profile` loads the base data whole, overlays only alias info, and rejects chained aliases (`profile.cpp:210-231,235-277`). No CineStill-specific emulsion array exists. Its distinct behavior comes from `antihalation:no`, not a duplicated Vision3 profile.

`apply_halation_preset` explicitly distinguishes the profile's own `no` from a user `antihalation_removed` override (`params.cpp:533-562`). The latter retains old Gaussian bounces, even though its effective tag is also `no`. CineStill sets `back_reflection=true`, strengths `[0.30,0.03,0.003]`; the generic removed-layer path uses `[0.30,0.10,0.015]` and `back_reflection=false`. A generic "remove rem-jet" checkbox is therefore not equivalent to the CineStill model. CineStill still uses the common pre-halation scatter mixture (`pipeline.cpp:1020-1053,1199-1242`).

### 4.2 Fixed physical assumptions and fitted PSF

`halation_psf.hpp:1-43` and `halation_psf_fit.py:8-39,45-51` document a parameterized, partly fitted model, not a direct measurement of every CineStill halo:

- acetate refractive index `n=1.48`; critical angle `asin(1/n)` about 42.5 degrees; radial return `r=2*d*tan(theta)` and rim near `1.83*d`;
- Fresnel back-face reflection plus a **10% pressure-plate** return with `R_eff = R_f + (1-R_f)^2 R_p/(1-R_f R_p)`;
- unscattered fraction 0.15 at f/2.8; emulsion re-scatter 0.35; thickness softening sigma 0.08*d;
- slant-path attenuation `exp(-tau*(1/cos(theta)-1))`, with tau `[0,1.2,3.0]` for red/green/blue, attributed to an external GPT Astra study; its `measurements.json` and scans are not in this archive;
- base thickness fixed at **120 um** (`params.hpp:91-107`), a 35 mm acetate assumption.

The physical kernel is `R_eff(theta)*cos(theta)^4/(4*pi)*attenuation` before the specified direct-light and re-scatter terms (`halation_psf_fit.py:67-94`). Four signed Gaussians approximate the unit-mass kernel per channel, constrained nonnegative, weights sum 1, L1 weight <=2, sigma ratio >=1.35. Exact production coefficients are `halation_psf.hpp:48-61`:

| k | sigma/d R,G,B | weight R,G,B |
|---|---|---|
| 0 | 0.184586, 0.178469, 0.170237 | +0.041510, +0.106789, +0.202791 |
| 1 | 1.121207, 1.000078, 0.546805 | -0.500000, -0.500000, +0.156578 |
| 2 | 1.651048, 1.581389, 0.808738 | +1.034500, +1.384389, -0.500000 |
| 3 | 4.677567, 9.448921, 1.340598 | +0.423990, +0.008822, +1.140631 |

At a 36 mm frame of width W, pixel pitch is `36000/W um`; `d_px = 120*spatialScale*sqrt(max(amount,0))/pixelPitch` (`pipeline.cpp:96-101,1055-1089,1846-1864`). Every component's sigma is `sigmaOverBase[k][c]*d_px`. `halation_amount` scales both light and area: strength becomes `strength*amount`, sigmas take `sqrt(amount)`. This is a deliberate divergence from the Python reference, which scales only light (`params.hpp:55-63`; `parity_render.py:32-37,112-116`). With renormalization on, `out = raw/(1+a_tot) + halo*a_tot/(1+a_tot)`; otherwise `raw+a_tot*halo` (`pipeline.cpp:1221-1240`). Signed component weights must not be clamped or blended with normalized hardware alpha blending.

The source Gaussian is FIR for sigma <3 px with reflected edges and truncate 3; at sigma >=3 it uses Young & van Vliet IIR, horizontal then vertical, not a tile-local approximation (`blur.hpp:1-11,81-112`; `blur.cpp:77-148`; `numeric.cpp:78-105`). A bounded WebGL2 kernel is therefore an independently validated approximation, not automatically the source's IIR algorithm.

### 4.3 Highlight headroom is before the halo, and frame-global

Default headroom is 4 EV, allowed wire range 0-8 (`params.hpp:95-107`; `params.cpp:211`). It only activates for the profile-driven back-reflection branch (`pipeline.cpp:963-985`). First reduce the maximum over the entire frame (after scene spectral upsampling/exposure and before edge/photo gate and halation). For each pixel with brightest channel `m>0`:

```text
nearClip = smoothstep(clamp((log2(m/clip) - (-1.0)) / 0.75, 0, 1))
overFloor = smoothstep(clamp((log2(m/0.184) - 1.5) / 1.0, 0, 1))
gain = 2^(headroomEV * nearClip * overFloor)
RGB *= gain
```

See `nodes.metal:45-77` and `halation_psf.hpp:70-75`. All three channels scale together. It changes both source light seen by the film shoulder and subsequent halo, not just a cosmetic red overlay. `film_boost` is a separate optional highlight operator and also requires a global max (`pipeline.cpp:904-945`). Headroom has no effect for ordinary Vision3 or its generic antihalation-removed Gaussian branch; this is directly asserted by `cinestill_checks.py:87-89,129-138`.

### 4.4 Practical FilmFrame CineStill slice

1. **Base setup:** reference the already validated Vision3 500T spectral resource by identity/digest, not a copied ordinary Vision3 registration. Apply only alias metadata and a distinct no-rem-jet capability. Keep `print_stock=kodak_2383` for the supplied numerical checks (`cinestill_checks.py:23-28`).
2. **Whole-frame reduction:** compute max of linear film raw input before spatial effects; CPU can do this in the exposure loop. WebGL2 needs a reduction (mipmap/downsample chain or equivalent), not an 8-bit framebuffer maximum. Then apply the headroom formula in an RGBA32F pass.
3. **Spatial halo:** implement four separable, per-channel Gaussian convolutions, accumulate signed weights in floating point, then apply the source scatter and normalized halo mix. CPU can use explicit finite kernels with a declared truncation and edge rule. WebGL2 should use horizontal/vertical ping-pong RGBA32F passes and per-channel sigma/weight uniforms; a full transform-feedback-like compute path is unavailable in WebGL2, so fragment passes are the practical primitive.
4. **Bounds / resolution:** record `filmFormatMM`, uncropped long-edge pixel count, `d_px`, kernel radius/truncation, and all scratch textures. The largest sigma at the test's 2048x1366, 36 mm, amount 1 is `9.448921 * (120/(36000/2048)) = 64.5403 px`; truncate 3 implies radius `int(3*sigma+0.5) = 194`. This is a concrete budget example, not a universal constant. Tiling requires halos for FIR and a different validated strategy for source-equivalent IIR; do not claim tile parity from a cropped blur.
5. **Validation anchors:** direct export of the PSF table, identity/alias tests, ring-vs-gap shape, red/green half-height reach 1.49-2.65 at +9 and +12 EV, and clipped-vs-unclipped headroom behavior (`cinestill_checks.py:77-159`). A CPU/WebGL2 comparison should additionally compare the isolated halo after subtracting a `1e-6` amount render, matching the source test's reasoning at lines 91-106.

## 5. Numerical tests and safe export boundary

### What exists

| Evidence | Exact references | Exportability without running untrusted code |
|---|---|---|
| B&W synthetic charts, ramps, neutral/grade/filter invariants | `bw_checks.py:23-76,79-128` | Parameters, fixture recipes, formulas and assertion predicates can be transcribed as data. They require a built engine for reference values. |
| B&W negative/rebate independence and DX checks | `bw_checks.py:129-175` | Recipes/assertions exportable; no expected image files included. |
| CineStill synthetic disc/ring, reach, gate tests | `cinestill_checks.py:23-63,66-159` | Geometry and predicates exportable; requires built engine to obtain numerical outputs. |
| Positive Velvia parity and four-stock policy | `parity_render.py:81-87,121,134-140,168-195`; `desktop_preview.cpp:388-458` | Test definitions exportable, not their result arrays. Parity requires missing Python `src` and reference stack; desktop test requires built host and RAW fixture. |
| Setup tables for Velvia and filtered enlarger | `dump_setup.cpp:44-70,141-188,216-255`; `parity_setup.py:1-36,81-115` | Data output format is documented, but no generated dump or oracle is included. C++ must be independently reviewed/built outside the untrusted tree to produce it. |
| PSF fitting algorithm | `halation_psf_fit.py:41-173` | Algorithm and assumptions can be reimplemented independently. The shipped four-component coefficients are directly available in `halation_psf.hpp:48-68`; fitted PSF JSON and scan measurements are absent. |
| Baked constants blob | `tools/bake_resources.py:15-28,44-50,91-119,132-137`; `blob.cpp:105-132,150-192` | **Directly readable without source execution.** 71 named entries include float64 D50/D55, 81x3 CMFs, CAT matrices, RGB matrices, KG3; float16 Hanatos spectra 192x192x81. Static inspection confirmed these keys and shapes. Extraction still needs digest/provenance/rights review. |
| Product profiles and grade table | `resources_product/profiles/*.json:1`, `paper_grades.json:1-43` | Directly parseable data. Film arrays include NaN in some positive profiles; the source intentionally sanitizes prepared spectral constants rather than emitting NaN pixels. |
| Prebuilt reference binary/images | `spk_test_paths.py:19-30`; repository inventory | **Not found.** No `engine/build` library, no B&W/CineStill golden images, no original `src/` Python oracle, no referenced `research/` tree. |

No numerical tests were run, so this report makes no claim that upstream checks pass on the pinned tree. The assertions can be exported as declarative JSON/TypeScript fixtures without executing upstream Python, but numerical expected values require either (a) a separately reviewed, built native oracle with synthetic input/parameter/output digests, or (b) independent recomputation from the cited equations. For B&W and CineStill, synthetic inputs make those references reproducible once a trusted oracle exists; no photograph is needed for the specified tests.

For the positive setup case, `dump_setup` already names Velvia (`dump_setup.cpp:154-158`) but also computes paper constants under Portra Endura (`dump_setup.cpp:243-255`); those paper constants are not evidence for the product's direct-positive output route. Likewise the `stock_positive` parity case sets only `film_stock` (`parity_render.py:135`) and should not be described as a four-stock direct-scan golden suite.

### Missing / uncertain calibration evidence

- Product B&W research named at `AGENTS.md:345-348` and `NOTICE.md:18-19` is not included, including granularity calibration files. Profile `metadata.tags` are the available primary record.
- Multigrade per-emulsion sensitivities are fitted, not published; the paper is a feasibility fit. No source-backed half-grade rows or per-film grade exposures beyond the common table exist.
- CineStill's cited scans, GPT Astra `measurements.json`, and fitted `psf_*.json` are absent. The source supports the given fitted model and its synthetic predicates, not independent empirical validation from this archive.
- Positive profiles have generic spektrafilm measurement provenance and engine-level polarity/coupler constants; no individual E-6/K-14 development calibration or measured scan golden was found.
- The pinned source is GPU-native Metal, with Vulkan work elsewhere; it does not supply FilmFrame CPU/WebGL2 implementations. The slices above identify integration boundaries, not completed code or parity.
- The existing FilmFrame exporter is pinned to a different spektrafilm revision and validates only color-negative pairs (`export_stock_pair_resources.py:1-14,30-81,163-198`). New-family resource provenance and source digests must be established independently; numerical extractability is not redistribution clearance.

## Related task documents

- `.trellis/tasks/11-11-spektralab-full-stock-migration/design.md:16-30` — independent imaging and evidence requirements.
- `.trellis/tasks/11-11-spektralab-full-stock-migration/research/upstream-catalog-map.md:28-61` — stock mapping and known provenance/geometry limits.
- `.trellis/tasks/11-11-spektralab-full-stock-migration/prd.md:27-39` — requirement R3 and evidence/release separation.
