# Pinned upstream configuration and provenance

- Recorded: 2026-11-06, before creating any TypeScript numeric implementation.
- Task: `.trellis/tasks/11-06-spectral-negative-print-prototype`.
- Scope: isolated local research/prototype only. This is not a public-release approval, full-engine parity claim, or legal opinion.

## Retrieval and execution boundary

Only the following public upstream source archives were retrieved. They were fetched by exact commit, not by a moving branch, into separate newly created empty directories outside this repository. The archives were inspected as untrusted input. No downloaded source was run from the repository or from a downloaded-source working directory. Owned scripts live separately under `/tmp/filmframe-spectral-owned-scripts-20261106.SPQjkk`; Python reading the downloads uses `-I` and explicit absolute paths.

| Project | Pinned source archive | Commit URL | Download SHA-256 | Temporary extraction path |
|---|---|---|---|---|
| spektrafilm, Andrea Volpato | https://github.com/andreavolpato/spektrafilm/archive/3bb2c2d2801ff68b92019cf1dbcbb133d60832bc.tar.gz | https://github.com/andreavolpato/spektrafilm/commit/3bb2c2d2801ff68b92019cf1dbcbb133d60832bc | `b2aca043227bb76f7f09eef4466cd8f9410f0cd5832ae2f4d045b80cb13b328f` | `/tmp/filmframe-spectral-upstream-20261106.lGlxkC/spektrafilm/spektrafilm-3bb2c2d2801ff68b92019cf1dbcbb133d60832bc` |
| SpektraLab, JamesQiu2005 | https://github.com/JamesQiu2005/SpektraLab/archive/02d82b56cf65f0f8e802a708612edc4e9a4790af.tar.gz | https://github.com/JamesQiu2005/SpektraLab/commit/02d82b56cf65f0f8e802a708612edc4e9a4790af | `5db9655c56e9d5df5a69c011d48ff1fd75d132b238ef6fa131e425c19a9cfd72` | `/tmp/filmframe-spectral-upstream-20261106.lGlxkC/SpektraLab/SpektraLab-02d82b56cf65f0f8e802a708612edc4e9a4790af` |

All digests below were computed from the files in those extracted pinned archives. Source URLs for a row use `https://raw.githubusercontent.com/<owner>/<repository>/<commit>/<path>`; these are provenance references, not browser-runtime requests. The temporary paths and isolated virtual environment are not repository deliverables.

## Exact `make_fast_test_params` and regression configuration

`tests/conftest.py:15-25`, SHA-256 `6e3a63720c4937a22cfd622c88b9a56033c99b535fcdafe99eaf90b40c1e55e8`, calls `init_params(film_profile="kodak_portra_400", print_profile="kodak_portra_endura")` and `digest_params` with the following explicit overrides:

| Field | Value |
|---|---|
| `debug.deactivate_spatial_effects` | `True` |
| `debug.deactivate_stochastic_effects` | `True` |
| `settings.use_enlarger_lut` | `False` |
| `settings.use_scanner_lut` | `False` |
| `io.upscale_factor` | `1.0` |
| `io.crop` | `False` |
| `camera.auto_exposure` | `False` |
| `camera.exposure_compensation_ev` | `0.0` |

`tests/regression_baselines.py`, SHA-256 `52cefe16dcae17b35d5133f8d75fa57b35becacafef991875b9cf9390e8c6d61`, supplies `np.random.seed(0)` before each run. The stochastic switches make the four Portra cases deterministic. The test compares the `output` member of the committed compressed NPZ with `np.testing.assert_allclose(actual, expected, rtol=1.5e-3, atol=1e-6)`. Thus the elementwise condition is `abs(actual - expected) <= 1e-6 + 1.5e-3 * abs(expected)`; this is not an absolute-only tolerance. The same threshold is the initial TypeScript regression gate, with measured float32 differences to be reported rather than hidden by loosening it.

### Effective configuration that remains enabled

These values come from `runtime/params_schema.py` and `runtime/params_builder.py` after `digest_params`; disabling spatial effects does **not** disable all chemistry or color processing.

| Area | Effective setting required for equivalent baselines |
|---|---|
| Input | RGB, channel-last, double source converted to the float32 output contract; scene-linear **ProPhoto RGB**; `input_cctf_decoding=False`; no automatic exposure; zero exposure compensation. |
| Spectral sampling | 380 through 780 nm in 5 nm steps, 81 samples. Film log-exposure grid has 256 samples from -3 to 4. |
| Scene spectral reconstruction | `hanatos2025`; 192x192x81 float16 irradiance table; film sensitivity adaptation window enabled; adaptation surface disabled; no spectral Gaussian blur. The default active input CIE-xy Reinhard compression `(threshold=0, limit=1, power=6)` is baked into the contracted 192x192x3 TC table. Runtime TC interpolation is Mitchell-Netravali cubic with `B=C=1/3`, reflected indexes and coordinate clamping. |
| Highlight and camera filters | `boost_ev=0`, no UV/IR filtering (zero amplitudes), camera diffusion/lens blur/halation disabled. Film exposure still uses `log10(max(raw, 0) + 1e-10)`. |
| Film development | Film curves minus per-channel `nanmin`; linear interpolation with endpoint clamping and `gamma=1`. Pointwise DIR couplers remain **active**, amount=1; only their spatial diffusion is zero. Negative-film diagonal self terms `[0.336,0.319,0.273]`; donor-to-receiver off diagonals R->G/B `[0.353,0.302]`, G->R/B `[0.154,0.353]`, B->R/G `[0.168,0.226]`. Corrected pre-coupler curves and a second curve interpolation are required. Grain is disabled. |
| Mid-gray calibration | A separate simple, non-DIR film development of neutral linear `[0.184,0.184,0.184]` obtains film spectral density. `normalize_print_exposure=True` and `print_exposure_compensation=True`; camera compensation is zero, so the compensated and ordinary mid-gray factors coincide. Each print channel is divided by the geometric mean of the three mid-gray paper raw responses. |
| Enlarger | TH-KG3, a normalized 3400 K blackbody times Akima-interpolated Schott KG3 transmittance. The neutral-filter database overrides defaults for Portra 400 / Portra Endura to C/M/Y `[0, 51.56801468495496, 52.53400422349596]` Kodak CC units. Shifts are zero. `print_exposure=1`, preflash=0. Custom dichroic curves are the analytic erf filters at transitions `[12,8,8,8]` and edges `[516,500,610,607]`; CC values become `10^(-CC/100)` transmittance. The 81-wavelength integral uses film channel dye density plus base density, `10^(-density)`, filtered enlarger light and paper `10^log_sensitivity`; enlarger LUT is off. |
| Paper development | `density_curves_morph.active=False`, but the **fitted** three-CDF paper model is evaluated on the 256-point exposure grid, then linearly interpolated. It is not replaced by the tabulated paper `density_curves`. Negative paper uses `0.5*(1+erf(z/sqrt(2)))` for each layer. |
| Viewing/scan | Portra Endura D50 viewing illuminant and CIE 1931 2-degree observer. The second 81-wavelength integral uses paper dye density plus base, `10^(-density)`, D50 and CMFs, normalized by `sum(D50*ybar)`. Scanner and black/white corrections are off. |
| Output | sRGB, `output_cctf_encoding=True`. The current default is CAM16-UCS, but the committed baselines establish **OkLch** as their actual output compressor: `algorithm="oklch"`, `knee=(0,1,6)`, one-sided lightness compression `(0.7,1,2.2)`. Its 64x720 maximum-chroma table uses 18 bisection iterations, `L` grid 0.02 through 1.0, hue grid `[-pi,pi)`, initial chroma bound 0.5, and in-gamut slack `[-1e-6,1+1e-6]`. Lens blur, glare and unsharp mask are disabled. See the configuration-drift note below; CAM16-UCS does not match the green fixture. |

### Fixture recipes and stages

- `gray_ramp_16`: `ramp=np.linspace(0.01,1.0,16)`; `image=np.ones((16,16,3),dtype=float64)*ramp[None,:,None]`. All rows repeat; channel-last RGB columns are neutral.
- `green_patch_8`: tile float64 `[0.05,0.40,0.05]` over `(8,8,3)`.
- `film_raw`: collect `log_e_film`, i.e. log10 film exposure after Hanatos reconstruction and before development; it is not unlogged irradiance.
- `negative_density`: collect `cmy_film` after normalized film curves and pointwise DIR correction, before grain.
- `print_rgb`: full film -> print exposure -> fitted paper development -> D50/XYZ -> **OkLch output compression** -> encoded sRGB. It is not a direct negative-color inversion.

### Configuration drift found before implementation

The pinned source and its committed NPZ files are not entirely consistent with the current default `OutputGamutCompressSpec`. This was found by direct controlled execution in an isolated environment, not inferred from appearance:

1. Two isolated runs used Python 3.13.12, NumPy 2.4.2, SciPy 1.17.1, colour-science 0.4.6 and opt-einsum 3.4.0; Numba 0.68.1 and 0.64.0 both yielded **3 failed, 2 passed** in `tests/test_regression_baselines.py`. The two passing Portra cases are `film_raw` and `negative_density`; all three print-RGB cases (including the out-of-scope Fuji case) fail. No baseline file was regenerated.
2. With `OutputGamutCompressSpec(algorithm="oklch")` substituted at runtime, green-patch8 becomes `[0.05075252058361825,0.467321614194582,0.1754605268242157]`, a maximum absolute difference of `3.24740234703e-15` from its committed baseline. The gray-ramp print output also matches exactly in every pixel except the first/darkest column. The residual 48 violations are confined to that column; the darkest actual RGB is `[0.05540321782719592,0.06180870780476045,0.06998943689742321]` versus expected `[0.062362773821203844,0.06884311159634343,0.07712007291639433]`. Maximum absolute error is `0.00713063601897`; mean absolute error is `0.000440095745929`.
3. Therefore the port uses `oklch` as the measured regression configuration, not current native-default CAM16-UCS. No parameter is selected to make a single pixel pass at the expense of others. The remaining dark-column discrepancy is an unresolved numerical blocker and must stay visible in TypeScript results. Tested and rejected hypotheses include CAM16 lightness interpolation clamp, tabulated versus fitted paper curves, scanner black/white corrections, alternate illuminant/observer normalization, alternate output color spaces, legacy sRGB negative handling, mid-gray reconstruction, mid-gray normalized curves, and alternate lightness knees. The film raw and negative-density fixtures remain the validated target stages.

## Baseline array identity and tolerances

NPZ files were opened from the isolated pinned archive using Python `-I`, `numpy.load(..., allow_pickle=False)`. Every archive contains only `output`; every output is finite, little-endian-compatible numeric float64, C-contiguous. SHA-256 `output payload` is the hash of the decoded C-order float64 values, not of an NPY header.

| Case / source path under `tests/baselines/` | NPZ SHA-256 | Shape / dtype | Min / max | Output-payload SHA-256 | First / last ramp pixel, or constant green output |
|---|---|---|---|---|---|
| `film_raw_portra_endura_gray_ramp16.npz` | `8e7a7f72f3b14ce5cb473ff11fa5f1058a6a8e26054facaec1a0957ae17214fc` | `(16,16,3)`, `float64` | `-1.3021170737788434` / `0.7406151504604933` | `b87f94120e376277a206962ad2c312446423c02b99a4cdea92f38d2cd80e55ff` | `[-1.2593848487582309,-1.2694172549415974,-1.3021170737788434]` / `[0.7406151504604933,0.7305827442588687,0.6978829253590985]` |
| `negative_density_portra_endura_gray_ramp16.npz` | `05b3e914e9b24c0743a4042841379157ae4ed8752726fe55e027e6de786fd124` | `(16,16,3)`, `float64` | `0.06804511351678183` / `1.2646719250353458` | `4982e183186191ab89fbf03d6c7cc78d4e397fd0e296aebf2a1ec74fd0915d72` | `[0.06804511351678183,0.0964357700979269,0.12823734544008936]` / `[1.0945746744420792,1.074398697448832,1.2646719250353458]` |
| `print_rgb_portra_endura_gray_ramp16.npz` | `4345814abe4c516618963c186a5c3f019eae01c7eec0654c25e0b93fff604311` | `(16,16,3)`, `float64` | `0.062362773821203844` / `0.8201999149632995` | `bcb82e8d714be8d62e21c3727e123c016a4c0fc3853b495153a6619bc91d5f8d` | `[0.062362773821203844,0.06884311159634343,0.07712007291639433]` / `[0.8161286588489114,0.8201999149632995,0.8192007371817952]` |
| `print_rgb_portra_endura_green_patch8.npz` | `a115fdebed2347f3106e6ec17e38fd3e3dd82721880b892507601595576b4399` | `(8,8,3)`, `float64` | `0.0507525205836215` / `0.4673216141945819` | `e1737ef99db2897fe69cc9f8704af7d348ebfca80997e49575d2be7d016fc961` | every pixel `[0.0507525205836215,0.4673216141945819,0.1754605268242167]` |

The TypeScript API uses packed `Float32Array` RGB, but decoded test expectations retain float64 values for error measurement. Comparisons must assert dimensions and finiteness first, then count threshold violations and report maximum/mean absolute error. An independently recomputed upstream result is evidence only when its exact dependency versions and comparison result are recorded separately; the committed arrays above remain the target fixtures.

## Source and resource ledger

Paths in this table are relative to the pinned spektrafilm archive unless explicitly marked SpektraLab. They identify the exact code consulted for the port. No upstream Python/C++ implementation is copied into the repository as an executable dependency.

| Source path | SHA-256 | Proposed use and modifications |
|---|---|---|
| `src/spektrafilm/runtime/pipeline.py` | `22d3772529270f936363ddfc5ae8f30e4ee2fa2a8d562ef359242d6de728f4e8` | Stage order and taps; replaced by bounded TypeScript orchestration. |
| `src/spektrafilm/runtime/params_builder.py` | `edc4537e2b1e021eea4a46e746550185525f9bcc25610ae577f936ad513d99c2` | Digested parameters, stock-specific DIR matrix, neutral-filter override; reduced to the fixed configuration above. |
| `src/spektrafilm/runtime/params_schema.py` | `3373d4cbc31476041dd5ae071ff00445313ac1a2d9d5e3517cf13dc5e87e18fa` | Effective defaults; no generic runtime settings framework port. |
| `src/spektrafilm/runtime/stages/filming.py` | `e5f7acc4a5d90b1452ff08cb8aee13dbeb28d08e9c6a31eff4471df5dcc6aa3e` | Hanatos, log exposure, film development and mid-gray reference; scalar/buffer TypeScript port. |
| `src/spektrafilm/runtime/stages/printing.py` | `6d47514f230c65ed60b0012be93277057bac4d3dd16089123aaa0ce99c0a25b0` | Enlarger integral and normalization; scalar/buffer TypeScript port, no spatial filtering. |
| `src/spektrafilm/runtime/stages/scanning.py` | `30078ef985e731b4b0150ed310ec1e2870fc6f7e037f5876c9afa2188b2cc99f` | D50 scan integral, XYZ/RGB and output encoding; scalar/buffer TypeScript port. |
| `src/spektrafilm/model/develop.py` | `41dfe710e89188dcdc87b5ad87c56095efa44f3dbc9393095f95762e2c1d0c83` | Normalized curves, fitted paper curves and stage boundaries. |
| `src/spektrafilm/model/couplers.py` | `706a1832cdfa0399b45e9a246b4c29ef669d42bf4d679080fb0346cf6ec5fcf3` | Pointwise DIR exposure/curve correction with zero diffusion. |
| `src/spektrafilm/model/color_filters.py` | `175aa801e228484880805e84af66bf1005fe916860fa4c36b955b4f5967579a7` | Analytic dichroic curves and CC transmittance; filter resources read, not executed. |
| `src/spektrafilm/model/illuminants.py` | `757608544bd603bfcf26db24c70d84ec9618569fb26bdfe6bf4e7362b62e4676` | D55/D50, normalized blackbody and KG3 construction. |
| `src/spektrafilm/utils/spectral_upsampling.py` | `6c51273383c6aa5538c3c742dfd46a6660300c8211936bfbbc498c64e60ef6ea` | TC coordinates, sensitivity window and contracted LUT. |
| `src/spektrafilm/utils/gamut_compression.py` | `4f7e6b48f8fd582c5ed3bb9559cf55a2c32be8b637cf90532b7979719fd13924` | Input and CAM16-UCS output math; fixed cached tables, not a GUI/general color-management library. |
| `src/spektrafilm/utils/morph_curves.py` | `f082d40c69f8f8c70f4d94ae947becf907609f2f56426c2fa7b9dd3006d4a6c9` | Fitted normal CDF curves only; morph controls disabled. |
| `src/spektrafilm/utils/fast_interp_lut.py` | `520c649ee63c4131ac178b45f363dc6e83130a5c0b03dc259d46347dabbe4e2f` | Mitchell weights, index reflection and endpoint behavior. |
| `src/spektrafilm/data/profiles/kodak_portra_400.json` | `b5cdc73dbec8f462f488bca70bedf23fd13ce79969c0457e8ac2a2565d92bf5d` | Film sensitivity, dyes, base, curves and adaptation window. Arrays `(81,3)`, `(81,)`, `(256,3)`; null spectral measurements become zero. Unmodified profile if copied. |
| `src/spektrafilm/data/profiles/kodak_portra_endura.json` | `e3bb6069e02d088d8080d38ce28035816038f62786e2aff9176bf4aeeb4820a0` | Paper sensitivity, dyes, base and fitted curve model. Unmodified profile if copied. |
| `src/spektrafilm/data/luts/spectral_upsampling/irradiance_xy_tc.npy` | `52f90c724811f5fab80769f8548bf24d08a521eb09e65ab6e016893258d2a783` | `(192,192,81)` float16 C-order, finite range `[1.97e-6,16.28]`; decoded-values SHA-256 `46f9b945ae486c0369a978df59a355ad8734537bc48c9e0ee68039185ba690d8`. Contract to film sensitivity and window, bake input compression; do not ship the raw spectrum table. |
| `src/spektrafilm/data/luts/spectral_upsampling/hanatos_irradiance_xy_coeffs_250304.lut` | `6bfb031761bd5a68975030d61426351a58bd15a3254ff42f384e09d7d3d1e40f` | Provenance inspected only; precomputed NPY is used by the actual runtime, so this coefficients LUT is not imported. |
| `src/spektrafilm/data/filters/neutral_print_filters.json` | `8bbf8d8db76aecdc9e94bc0b1e31f3329553eeda56d210ab36294fa5e4bf3b13` | Only the three exact Portra pairing values enter fixed setup. |
| `src/spektrafilm/data/filters/heat_absorbing/schott/KG3.csv` | `7654aa57fa8e42ae280e8d679ae9ebf8cef48ed5cbe6c2ab43eba1c6608f3d1f` | Duplicate-wavelength first occurrence, Akima interpolation onto 81 samples; precompute only required normalized filtered illuminant. |
| `src/spektrafilm/LICENSE` | `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986` | GNU GPL version 3; project CITATION declares GPL-3.0-or-later. Preserve with derived TypeScript source. |
| `src/spektrafilm/SPEKTRAFILM_LICENSE.txt` and root copy | `76d629501783ae52e8d63aee1e054c1e1a9713b9fe7d36fb306e25b1d14b24e9` | Unmodified CC BY-SA 4.0 profile/LUT text and preamble; retain alongside profiles/derivatives and a separate local changelog. |
| SpektraLab `engine/src/pipeline/pipeline.hpp` | `d80aa8b12cd148e6627a4c9bd8e4dfcd6f75e7324e7730acfd5f4eaadb0da3d1` | Cross-check of RGB_IN -> CMY_FILM -> RGB_OUT boundaries only. No C++/Metal/Vulkan source or resource imported. |
| SpektraLab `LICENSE.txt` and `license/SPEKTRAFILM_LICENSE.txt` | `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986` / `76d629501783ae52e8d63aee1e054c1e1a9713b9fe7d36fb306e25b1d14b24e9` | Confirm same GPL/profile license texts; no additional SpektraLab asset use. |

## License and distribution boundaries

1. **Derived numeric code:** the pinned spektrafilm project is GPL-3.0-or-later (`CITATION.cff:28`, GPL text above); SpektraLab is also GPL-3.0-or-later. The fixed-pipeline TypeScript port is treated as GPL-3.0-or-later derived work, with attribution, source availability and modification notice. The local task acceptance of this route does not relicense unrelated FilmFrame files or resolve their historical rights.
2. **Profiles and direct derived tables:** Kodak Portra 400 and Portra Endura JSON are Andrea Volpato's CC BY-SA 4.0 work. Keep the unmodified license/preamble, canonical source, author attribution and a separate modifications changelog. Unmodified JSON stays CC BY-SA 4.0; any profile/LUT encoded derivative remains CC BY-SA 4.0. The license says finished photographs belong to their authors; no CC license is imposed on synthetic/user output by this experiment.
3. **Hanatos irradiance resource:** the source credits hanatos for the data but the examined notices do not establish a standalone reuse license. SpektraLab's changelog explicitly excludes it from Andrea's profile license. Its contracted table is therefore an **unresolved-provenance research input**, not declared public-domain, permissive, or CC BY-SA. It may be inspected in this controlled local prototype; public redistribution remains blocked until the sibling license task resolves it or replaces it.
4. **KG3 measured filter data:** `heat_absorbing/schott/info.txt` identifies Newport's heat-absorbing filter page but no redistribution license was found. Treat the derived TH-KG3 illuminant as unresolved provenance as well; do not infer CC coverage. Public redistribution remains blocked.
5. **Standard observer, illuminants and RGB/CAM transforms:** these are obtained at setup time from the separately pinned `colour-science` package, not silently treated as Andrea's measured profiles. The dependency version and its BSD-3-Clause notice must accompany any extracted numerical table. Their presence does not clear the Hanatos/KG3 gaps.
6. **No SpektraLab branding/artwork:** no application icon, fonts, screenshot, product-owned B&W profiles, native binary or trademarked product presentation is used. Factual source attribution does not imply endorsement.
7. **Global ownership:** `ops/provenance/manifest.json`, global notices, license-child records and release configuration belong to the main/license task and are intentionally untouched here. Prototype-specific notices must not state that global FilmFrame distribution is approved. No public release/deploy is authorized by this record.

## Port and evidence requirements carried forward

- Preserve distinct film log exposure, normalized/DIR negative density, paper exposure/density and scan/output RGB. Never quantize negative density to display RGB before printing.
- Keep all arrays finite and bounded before allocation; reject malformed shapes/data instead of sanitizing a failed result into a plausible picture. Alpha is an adapter concern and must remain byte-identical.
- Include exact two 81-wavelength integrals, not a print LUT approximation. Spatial DIR diffusion, grain, halation, glare, lens/scanner blur and unsharp are omitted. No GPU, WASM, runtime CDN or remote processing.
- Precompute only fixed setup products in an owned script; preserve their source digests and modification description. Local unmodified profiles and baselines stay outside `public/` and are not a runtime network dependency.
- Record upstream runner results, generated-table digests, TypeScript errors, browser/device timings and missing-browser evidence in separate result artifacts. Failure or unavailable evidence must remain visible and blocks UI integration rather than being described as success.

## Final setup/export notes

- `services/spectral/resources/portra-setup.json` has SHA-256 `16f6217f8f1fa81c7064d5926f3ab4344f088a18520fd71e260c80fbbe5febd5` after the verified matrix, raw-curve, mask and ProPhoto-input corrections. The exporter is deterministic for the pinned source/environment.
- `filmRawCurves` is the unnormalized `(256,3)` film density curve table used only for mid-gray calibration, with decoded payload SHA-256 `cde56132253bcc03627652b7eef49e19c314e37312d5f43a2c19a2dad0d0a78d`. `filmNormalizedCurves` remains the curve-minus-minimum table used for actual film development; `filmDirCurves` is its pre-coupler correction. No normalized curve is substituted for mid-gray calibration.
- The exported ProPhoto-to-D55 CAT16 matrix is `[0.789402915377827,0.12282122346225705,0.04446820668845445,0.28698841093710076,0.7134785957697437,-0.0004666708336755257,0.00147101009359126,0.0038855140649431226,0.915783799797923]`, verified against the pinned RGB transform. The D50-to-sRGB CAT02 matrix is adaptation followed by the sRGB inverse matrix. These matrices are not screen-space transposes.
- The additional `srgbToProPhoto` matrix converts decoded linear sRGB primaries into linear ProPhoto primaries with CAT02 adaptation to ProPhoto D50, for the byte adapter. The film exposure matrix above then converts that ProPhoto scene input into D55 XYZ. These are different stages; using the latter directly on sRGB bytes would be incorrect. The exported matrix is row-major for `multiply3`; an earlier transpose was rejected by the white-byte regression `[1.0002467779346262,0.999934941771564,1.0002209135817952]`.
- `filmSpectralValidMask` and `paperSpectralValidMask` are separate `(81,)` masks. A sample is valid only if its base and all three channel-density measurements are finite. Upstream `density_to_light` turns any NaN transmission into zero; the masks preserve that rule while the exported numeric values remain finite. NaN-to-zero without a mask would incorrectly admit unmeasured light. Film mask payload SHA-256 `75061b7c55509eaf6e62fa1787743682a25dce699c751d35b65f387402e02225`; paper mask payload SHA-256 `ee33eff665f50e6869030d0c689a3b56f96c4eed4fe737de523d8392fc85695a`.
- Mid-gray normalization is a scalar geometric mean across the 81 spectral responses. Direct upstream probe: `0.8357499244020924`; TypeScript after masks: `0.835687686107377`. It is neither a geometric mean of three RGB channels nor three independently fitted factors.
- The final type/resource boundary accepts `unknown`, validates exact schema, dimensions and finite numeric values, then produces typed setup. The bundled JSON import has no unchecked resource assertion. The setup is excluded from `public/` and is used only by isolated services/tests/harness.
