# Research: Negative-stock registry and generalized setup generation

- Query: Inventory pinned upstream camera negatives, map FilmFrame's 16 stocks and migration candidates, and specify the data needed to generalize the fixed Portra exporter.
- Scope: mixed (local FilmFrame source plus public GitHub REST API responses at two pinned commits)
- Date: 2026-11-06
- Upstream A: `andreavolpato/spektrafilm@3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`
- Upstream B: `JamesQiu2005/SpektraLab@02d82b56cf65f0f8e802a708612edc4e9a4790af`
- Method: GitHub `git/trees/<commit>?recursive=1` and `contents/<path>?ref=<commit>`; decoded content hashed locally as SHA-256. No upstream code was executed. `replace-look` below is a registry recommendation, not evidence that a generated setup has already passed numerical validation or is cleared for distribution.

## Findings

### Counting and classification rules

The pinned spektrafilm tree has **28 profiles: 16 camera negatives, 4 positive/slide films, and 8 print-stage profiles**. SpektraLab adds **one camera-negative alias (CineStill 800T), four standalone B&W camera negatives, and one B&W paper**. Thus there are **21 selectable upstream camera-negative IDs (20 standalone + one alias)**, not 28 or 34.

A camera negative in this report must resolve to `info.type=negative`, `info.support=film`, and `info.stage=filming`. `type=negative` alone is insufficient: photo paper and cinema print stocks also use it. `target_print` is the declared default destination, not permission to replace a negative with that print stock.

### Pinned camera-negative inventory

All 16 spektrafilm color camera negatives have `channel_model=color`, `viewing_illuminant=D50`, a four-number Hanatos adaptation-window vector, and a 3x15 adaptation surface in the JSON. In the pinned fixed configuration, the **window is on and the surface is off** (`SettingsParams` defaults in `runtime/params_schema.py`). Halation metadata selects spatial behavior; it does not change the exported pointwise DIR matrix. The current FilmFrame prototype disables spatial halation for every stock.

Filter values are exact TH-KG3 C/M/Y neutral Kodak CC values for the declared default target paper. All rows exist in the pinned `neutral_print_filters.json`, except the B&W values come from SpektraLab's separate product pack. The full-precision source remains authoritative; six decimals below are only a compact registry representation.

| Upstream negative ID / display name | Stage / type / support / use | Halation (`antihalation`) | Reference illuminant | Default target paper | Compatible default TH-KG3 filter C/M/Y |
|---|---|---|---|---|---|
| `fujifilm_c200` / Fujifilm C200 | filming / negative / film / still | weak | D55 | `fujifilm_crystal_archive_typeii` | [0, 85.913804, 108.320181] |
| `fujifilm_pro_400h` / Fujifilm Pro 400H | filming / negative / film / still | strong | D55 | `fujifilm_crystal_archive_typeii` | [0, 48.153656, 50.735253] |
| `fujifilm_xtra_400` / Fujifilm X-Tra 400 | filming / negative / film / still | weak | D55 | `fujifilm_crystal_archive_typeii` | [0, 85.850515, 109.095639] |
| `kodak_ektar_100` / Kodak Ektar 100 | filming / negative / film / still | strong | D55 | `kodak_portra_endura` | [0, 74.444385, 60.742113] |
| `kodak_gold_200` / Kodak Gold 200 | filming / negative / film / still | weak | D55 | `kodak_portra_endura` | [0, 58.661060, 55.551852] |
| `kodak_portra_160` / Kodak Portra 160 | filming / negative / film / still | strong | D55 | `kodak_portra_endura` | [0, 59.967377, 53.213338] |
| `kodak_portra_400` / Kodak Portra 400 | filming / negative / film / still | strong | D55 | `kodak_portra_endura` | [0, 51.568015, 52.534004] |
| `kodak_portra_800` / Kodak Portra 800 | filming / negative / film / still | strong | D55 | `kodak_portra_endura` | [0, 65.888030, 66.083364] |
| `kodak_portra_800_push1` / Kodak Portra 800 (Push 1) | filming / negative / film / still | strong | D55 | `kodak_portra_endura` | [0, 66.060616, 68.039517] |
| `kodak_portra_800_push2` / Kodak Portra 800 (Push 2) | filming / negative / film / still | strong | D55 | `kodak_portra_endura` | [0, 66.280379, 69.591131] |
| `kodak_ultramax_400` / Kodak Ultramax 400 | filming / negative / film / still | weak | D55 | `kodak_portra_endura` | [0, 58.662568, 59.170498] |
| `kodak_verita_200d` / Kodak Verita 200D | filming / negative / film / cine | strong | D55 | `kodak_2383` | [0, 50.569989, 57.618563] |
| `kodak_vision3_50d` / Kodak Vision3 50D | filming / negative / film / cine | strong | D55 | `kodak_2383` | [0, 50.569989, 57.618563] |
| `kodak_vision3_200t` / Kodak Vision3 200T | filming / negative / film / cine | strong | **T (incandescent)** | `kodak_2383` | [0, 45.027590, 54.779229] |
| `kodak_vision3_250d` / Kodak Vision3 250D | filming / negative / film / cine | strong | D55 | `kodak_2383` | [0, 50.754746, 54.476948] |
| `kodak_vision3_500t` / Kodak Vision3 500T | filming / negative / film / cine | strong | **T (incandescent)** | `kodak_2383` | [0, 44.613539, 56.764120] |
| `cinestill_800t` / CineStill 800T (SpektraLab alias) | filming / negative / film / **still** | **no** | **T (inherited from `kodak_vision3_500t`)** | `kodak_2383` (inherited and catalog-confirmed) | [0, 44.613539, 56.764120] (base-pair value) |
| `kodak_tri_x_400` / Kodak Tri-X 400 (SpektraLab product) | filming / negative / film / still | weak | D55 | `ilford_multigrade_iv_rc` | grade 2: [0, 0, 68], print exposure 1.0 |
| `kodak_tmax_100` / Kodak T-Max 100 (SpektraLab product) | filming / negative / film / still | weak | D55 | `ilford_multigrade_iv_rc` | grade 2: [0, 0, 68], print exposure 1.0 |
| `fujifilm_neopan_acros_100_ii` / Fujifilm Neopan 100 Acros II (SpektraLab product) | filming / negative / film / still | weak | D55 | `ilford_multigrade_iv_rc` | grade 2: [0, 0, 68], print exposure 1.0 |
| `ilford_hp5_plus_400` / Ilford HP5 Plus 400 (SpektraLab product) | filming / negative / film / still | weak | D55 | `ilford_multigrade_iv_rc` | grade 2: [0, 0, 68], print exposure 1.0 |

The last four rows have `channel_model=bw`, `densitometer=diffuse_visual`, no Hanatos adaptation-window/surface fields, and a panchromatic emulsion replicated into three channels per the product NOTICE. They are real camera negatives but **not drop-in inputs for the fixed color-negative setup generator**.

### Hanatos adaptation-window evidence

These are the four window parameters `[c_uv, s_uv, c_ir, s_ir]` in each spektrafilm camera-negative JSON. Surface coefficients are deliberately not dumped here; all are present but inactive under the fixed contract. SpektraLab product B&W profiles omit both fields.

| Negative ID | Window parameters | Negative ID | Window parameters |
|---|---|---|---|
| `fujifilm_c200` | [408.28452672811625, 18.521057051731727, 618.9981412134122, 50.466058903465196] | `kodak_ultramax_400` | [421.5244345846789, 26.694588054217107, 593.1439307880398, 56.101703409375816] |
| `fujifilm_pro_400h` | [408.8159179081456, 28.193006074619696, 618.0464207790596, 48.92989977921233] | `kodak_verita_200d` | [423.3147986703333, 27.578840364197628, 596.6916785992878, 52.74754702293304] |
| `fujifilm_xtra_400` | [401.8713878121131, 23.25971512133682, 627.1187931825383, 52.56909474169852] | `kodak_vision3_50d` | [414.2581367249097, 27.044706919970885, 599.9789126614678, 40.30118405468025] |
| `kodak_ektar_100` | [421.7957663534462, 29.239515141946775, 594.6965849469772, 51.853512742047364] | `kodak_vision3_200t` | [417.6881350607179, 28.12589206445241, 628.7354686566281, 21.897934224166548] |
| `kodak_gold_200` | [413.7083919172667, 25.796234580161293, 602.2294861328671, 59.08513817256133] | `kodak_vision3_250d` | [423.88758785038334, 30.68927612310501, 589.5450472433422, 44.742746003638494] |
| `kodak_portra_160` | [419.423855422887, 26.094664039135147, 616.4955928126741, 69.59524903462093] | `kodak_vision3_500t` | [420.39949347982474, 27.405956769807666, 615.5981569816424, 40.42816633027961] |
| `kodak_portra_400` | [433.4923489479147, 31.559013783682733, 593.1340731719018, 68.76320496148521] | `kodak_portra_800_push1` | same four values as ordinary `kodak_portra_800`; distinct curve data/digest |
| `kodak_portra_800` | [420.0446899377541, 23.379617187533793, 592.4389557257218, 51.81122039686686] | `kodak_portra_800_push2` | same four values as ordinary `kodak_portra_800`; distinct curve data/digest |

Halation presets selected by the pinned `params_builder.py` are: still/strong sigma 65 um, strength RGB [0.015,0.005,0]; still/weak sigma 65, [0.08,0.02,0]; still/no sigma 65, [0.30,0.10,0.015]; cine/strong sigma 50, [0.015,0.005,0]. The four B&W films are still/weak; CineStill is still/no. These are cited behavior, not implemented FilmFrame features. CineStill's distinguishing back-reflection cannot be represented by merely copying the Vision3 500T pointwise setup.

### Exact SHA-256 evidence ledger

Paths under upstream A are `src/spektrafilm/data/profiles/<id>.json`; paths under upstream B are `engine/resources_product/profiles/<id>.json`. These are hashes of decoded JSON file bytes, not Git blob SHA values or packed-array payload hashes.

| Source | Profile ID | SHA-256 |
|---|---|---|
| A | `fujifilm_c200` | `30db07d88090aadc62e03d18c2c51f67a20a1673390c69f99933b7ed5406d2c8` |
| A | `fujifilm_pro_400h` | `da1be731ab79fb5535c43042494fa7298c942179abb68270b928aa012c629b31` |
| A | `fujifilm_xtra_400` | `5f2a3642c7c8db5e750d7366c34b47d24b89ad78d2abe41da4b5282fd4286e58` |
| A | `kodak_ektar_100` | `60acbd46c75005771569eafb97f534a4495e9d4e1e9c1e419b90cea2676ec7cf` |
| A | `kodak_gold_200` | `aa8a0c1c7851fface3752f968cdf6c6d74a26fc9756a4460d3155d2382506b7c` |
| A | `kodak_portra_160` | `1bc9b65a6940f3a4381e8d14d0ac43594aff9495051992ce4d7408e761549992` |
| A | `kodak_portra_400` | `b5cdc73dbec8f462f488bca70bedf23fd13ce79969c0457e8ac2a2565d92bf5d` |
| A | `kodak_portra_800` | `5b0c6e861c6273a2ecdf552525e80738037918e650a0dc206e095acfd02f8b43` |
| A | `kodak_portra_800_push1` | `dac9cbcd2442442d9dee90bd2d6a28dcc4b996635dcac0b44ac8ecd32c4b3a4f` |
| A | `kodak_portra_800_push2` | `5ee01e4a00c157721738314313a43b46fcd5dae62ed3a7e4730f9054b66f6282` |
| A | `kodak_ultramax_400` | `248b78bdcc4fdbe864e30f193f900059ecd98cbdb276c88ad8f6f5b520137901` |
| A | `kodak_verita_200d` | `5d71a3f544721a71cfa0b0671ce1b5eda6dc1e6a09273810793d4bc821b272fc` |
| A | `kodak_vision3_50d` | `fd426abc9de911682080db222020978dee4e8df7ca939bfcd5c9d0f6df249fa1` |
| A | `kodak_vision3_200t` | `4a28f049fd6bad67be98efdb058b413c6b3c022e2932b357b346d902c4c393c8` |
| A | `kodak_vision3_250d` | `9ab85c8627c0533beb925b747e441e93beabe9e98c2429695b0a53866b56fcc7` |
| A | `kodak_vision3_500t` | `d7beca68bf16db88dbb7373fd13a6a1150a57a911a54bb0309a760a6f9883329` |
| B | `cinestill_800t` (alias JSON) | `4b5c5771a1d4755cf2f2994bbc0529387d579cc8d9fb6e23fe5d3d856fc13161` |
| B | `kodak_tri_x_400` | `a54be071c6a055a9a49acb7072d10bf0b1bcddf9c0a459b0800a9b14bb66b1f1` |
| B | `kodak_tmax_100` | `c9160236872034b86fb42b67be3a9252088bfa7bdbb450148b0c20ad83e3033a` |
| B | `fujifilm_neopan_acros_100_ii` | `4429b45664a06c7ee8d16687bcc7adf656403e534fba584f83762e160abdc4f9` |
| B | `ilford_hp5_plus_400` | `a09ccdb57816f220ab598e534318a743ef79e16a300f8bd2de7453d451fe8ec5` |

Default-paper evidence: A `kodak_portra_endura` = `e3bb6069e02d088d8080d38ce28035816038f62786e2aff9176bf4aeeb4820a0`; A `fujifilm_crystal_archive_typeii` = `0db98e5b8e2ed5248696e62bc39b7f21459a8812d64049b1275d7be995af873b`; A `kodak_2383` = `eb7fdfa3b75a909bf5c400802f7401160c8017ed1ac3e8e0d1c8448d56fbe184`; B `ilford_multigrade_iv_rc` = `0f776f1f26f04aca4ec438ed377dc1acf4073dc1a8ae32c51607a6cb1a02521d`.

Filter/catalog evidence: A `src/spektrafilm/data/filters/neutral_print_filters.json` SHA-256 `8bbf8d8db76aecdc9e94bc0b1e31f3329553eeda56d210ab36294fa5e4bf3b13` (matches the earlier prototype record); B `engine/resources_product/neutral_print_filters.json` = `320f92b0608d599a1affb6231fcabd3d0df8f79a87514e34bf27c5b8e622be69`; B `engine/resources_product/paper_grades.json` = `a6a2f689c73b104880d965519586db7c0976027aad05b6103872537f81b76ce9`; B `modern_UI/Spektrafilm/Spektrafilm/Resources/StockCatalog.json` = `06df0239df5f7a6af57a0eee3ea383999bf03fbc39be3746c401ae6940889db3`.

Local Portra source copies match A exactly. `services/spectral/resources/portra-setup.json` SHA-256 is `16f6217f8f1fa81c7064d5926f3ab4344f088a18520fd71e260c80fbbe5febd5`. This does not validate any other pairing.

### Explicit exclusions: not camera negatives

| Upstream ID | Actual role | Migration consequence |
|---|---|---|
| `kodak_portra_endura`, `kodak_endura_premier`, `kodak_ultra_endura`, `kodak_supra_endura`, `kodak_ektacolor_edge` | negative / **paper** / printing / still | Printing destinations only. In particular, **block the proposed `kodak_ektacolor_edge` camera-stock addition**. |
| `fujifilm_crystal_archive_typeii` | negative / paper / printing / still | Default Fuji paper, not C200/X-Tra/Pro 400H camera film. |
| `kodak_2383`, `kodak_2393` | negative / film / **printing** / cine; viewing illuminant `K75P` (Kinoton 75P) | Cinema print destinations, not Vision3 camera-negative substitutes. |
| `ilford_multigrade_iv_rc` | negative / paper / printing / still | B&W paper destination, not HP5/Tri-X/etc. camera film. |
| `kodak_ektachrome_100`, `kodak_kodachrome_64`, `fujifilm_provia_100f`, `fujifilm_velvia_100` | positive / film / filming | Slide/positive films require separate semantics; no negative-print mapping. |

### FilmFrame's current 16 stocks: exact mapping and disposition

Local evidence: `types.ts:2-24` defines the 16 `FilmType` entries; `services/filmOverlay.ts:27-44` registers all 16 real-135 templates. Only Gold currently receives `applyGold200Look` in the main and Worker real-135 paths (`services/filmEngine.ts:493-494,701-702,748-749,1040-1041`; `services/filmWorker.ts:542,889`). The other flattened-template paths do not have an existing per-stock spectral transform.

| FilmFrame `FilmType` | Exact upstream negative ID | Recommended mapping | Evidence / limit |
|---|---|---|---|
| `KODAK_PORTRA_160` | A `kodak_portra_160` | **replace-look** | Exact name/brand; declared Portra Endura pair. New fixture required. |
| `KODAK_PORTRA_400` | A `kodak_portra_400` | **replace-look** (existing prototype route) | Exact profile and paper already copied. Historical darkest-column output drift remains documented; not blanket full-pipeline validation. |
| `KODAK_PORTRA_800` | A `kodak_portra_800` | **replace-look** | Exact ordinary stock; do not replace it with push1/push2. |
| `KODAK_EKTAR_100` | A `kodak_ektar_100` | **replace-look** | Exact name/brand and Portra Endura pairing. |
| `KODAK_GOLD_200` | A `kodak_gold_200` | **replace-look** | Exact name/brand; replace only the aperture RGB approximation and retain owned border/template behavior. |
| `KODAK_ULTRAMAX_400` (`GC 400 KODAK`) | A `kodak_ultramax_400` | **replace-look** | Exact stock identity; display code is not a separate emulsion. |
| `KODAK_COLORPLUS_200` | **not found in either pinned tree** | **blocked** | Do not map to `fujifilm_c200`, Gold, or another brand/model. A new independently evidenced Kodak ColorPlus profile is required. |
| `KODAK_PROIMAGE_100` | **not found in either pinned tree** | **blocked** | Do not substitute Portra 160, Ektar, Gold, or Fuji. No exact Pro Image 100 profile exists in these commits. |
| `KODAK_EKTACHROME_E100` | none exact; A has `kodak_ektachrome_100` positive/slide | **blocked for negative migration** | Existing stock is positive, and the upstream name is Ektachrome 100, not an explicit E100 match. Separate positive-film work and identity review required. |
| `KODAK_TRI_X_400` | B `kodak_tri_x_400` | **blocked in fixed color pipeline; exact profile exists** | B&W profile plus Multigrade paper/grade semantics and provenance review required. |
| `KODAK_TMAX_100` | B `kodak_tmax_100` | **blocked in fixed color pipeline; exact profile exists** | Same B&W boundary; do not use color Portra or Vision3 resources. |
| `KODAK_TMAX_400` | **not found in either pinned tree** | **blocked** | Do not substitute T-Max 100 or Tri-X 400. |
| `KODAK_P3200` | **not found in either pinned tree** | **blocked** | No T-Max P3200 profile at the pins. |
| `FUJI_SUPERIA` (`FUJI SUPERIA 400`) | no exact Superia 400; A `fujifilm_xtra_400` is X-Tra 400 | **blocked as an exact Superia replacement; add X-Tra separately** | Same brand does not establish same stock. An explicitly named X-Tra 400 candidate is supportable; silently relabeling it Superia is not. |
| `CINESTILL_800T` | B `cinestill_800t` -> A `kodak_vision3_500t` | **blocked for exact fixed-pipeline look** | The alias is exact upstream identity, not an unknown match, but `antihalation=no` and the back-reflection model are its distinguishing behavior. A no-halation Vision3 pointwise render must not be presented as full CineStill parity. |
| `ILFORD_HP5` (`ILFORD HP5 PLUS`) | B `ilford_hp5_plus_400` | **blocked in fixed color pipeline; exact profile exists** | B&W Multigrade setup, filter grade, curve/model handling and product-profile provenance are separate from the validated color path. |

### Candidate additions

| Candidate | Exact upstream ID and default print | Recommendation |
|---|---|---|
| Fujifilm C200 | A `fujifilm_c200` -> `fujifilm_crystal_archive_typeii` | **add**, after pair-specific export and validation. Never assign this ID to Kodak ColorPlus. |
| Fujifilm X-Tra 400 | A `fujifilm_xtra_400` -> `fujifilm_crystal_archive_typeii` | **add as X-Tra 400**, not as verified Superia 400. |
| Fujifilm Pro 400H | A `fujifilm_pro_400h` -> `fujifilm_crystal_archive_typeii` | **add**, with its own film TC/curves and Fuji paper/filter setup. |
| Kodak Vision3 50D | A `kodak_vision3_50d` -> `kodak_2383` | **add with cinema-print prerequisites**; D55 camera reference, K75P print viewing. |
| Kodak Vision3 200T | A `kodak_vision3_200t` -> `kodak_2383` | **add with cinema-print and tungsten-reference prerequisites**; cannot reuse Portra's D55 matrix. |
| Kodak Vision3 250D | A `kodak_vision3_250d` -> `kodak_2383` | **add with cinema-print prerequisites**. |
| Kodak Vision3 500T | A `kodak_vision3_500t` -> `kodak_2383` | **add as Vision3 500T with cinema/tungsten prerequisites**; this alone is not CineStill 800T. |
| Kodak Ektacolor Edge | A `kodak_ektacolor_edge` is paper | **blocked; remove from negative additions**. It can be considered later only as an explicitly selectable print destination. |
| Kodak Verita 200D | A `kodak_verita_200d` -> `kodak_2383` | **add candidate**, same cinema-print requirements; not an initial PRD requirement. |
| Portra 800 Push 1 / Push 2 | A `kodak_portra_800_push1` / `_push2` -> `kodak_portra_endura` | **optional separate add variants**, each with distinct profile/filter data; not replacements for normal Portra 800. |
| Fujifilm Neopan 100 Acros II | B `fujifilm_neopan_acros_100_ii` -> `ilford_multigrade_iv_rc` | **blocked pending B&W support**, like Tri-X/T-Max 100/HP5; not part of the color-only setup generator. |

### Compact exact JSON identity examples

CineStill is an alias, not an independently measured spectral profile. SpektraLab `profile.cpp` loads the entire base profile, overlays the alias's `info`, and sets the addressed stock ID/base-stock relationship.

```json
{
  "id": "cinestill_800t",
  "source": "JamesQiu2005/SpektraLab@02d82b56cf65f0f8e802a708612edc4e9a4790af",
  "path": "engine/resources_product/profiles/cinestill_800t.json",
  "sha256": "4b5c5771a1d4755cf2f2994bbc0529387d579cc8d9fb6e23fe5d3d856fc13161",
  "derived_from": "kodak_vision3_500t",
  "info": {"name": "CineStill 800T", "use": "still", "antihalation": "no"}
}
```

Ektacolor Edge must fail the camera-negative predicate even though its type is negative.

```json
{
  "id": "kodak_ektacolor_edge",
  "source": "andreavolpato/spektrafilm@3bb2c2d2801ff68b92019cf1dbcbb133d60832bc",
  "sha256": "5db23694d478c35cc0f96d42f94da79e552b2f8eb0853767449a24ac0f0f890e",
  "info": {"type": "negative", "support": "paper", "stage": "printing", "target_print": null}
}
```

## Setup-generation contract for generalizing the Portra exporter

The existing maintenance exporter is `scripts/spectral/export_portra_reference.py`; the runtime schema is `services/spectral/types.ts:9-56`, with fixed-shape validation in `services/spectral/setup.ts:3-136`. Mid-gray preparation uses raw, non-DIR curves in `services/spectral/print.ts:46-72`. The following describes the required input identity and data dependencies; it is not a claim that the generic exporter exists.

### Registry/setup identity that must vary per pair

Each setup key should bind **film ID + paper ID + exact revisions + source file digests + fixed processing configuration**. It is not sufficient to key only by FilmType. Record paper/filter/resource digests and the viewing/reference illuminants. A cached paper receiver cannot be reused across different film/filter pairs; a common observer or output gamut table can be shared only when its complete generating configuration matches.

| Field / derived resource | What changes per negative or negative-paper pair | Contract |
|---|---|---|
| Film TC LUT (`filmTcLut`) | Film log sensitivity; film-specific Hanatos adaptation window; film reference illuminant (D55 or T); input gamut remapping. Surface remains disabled for the fixed reference contract. | Generate from the selected film, never copy Portra's TC table. Resolve T with upstream `standard_illuminant`, not D55. A missing B&W window is not an invitation to reuse a color film window. |
| Film exposure/development (`filmLogExposure`, `filmNormalizedCurves`, `filmRawCurves`, `filmDirCurves`, `filmDirMatrix`) | Selected film's log-exposure axis and density curves; raw curves for mid-gray; normalized and pre-DIR curves. | Preserve raw vs normalized roles. For color negatives, the pinned generic negative DIR gammas produce the same coefficient set, but recompute the matrix/curves from the selected profile and explicit settings. B&W requires a separately validated path, not assumed color-DIR behavior. Validate actual dimensions rather than assuming every future profile has Portra's 256 points. |
| Film spectral response (`filmLogSensitivity`, `filmChannelDensity`, `filmBaseDensity`, `filmSpectralValidMask`) | Entirely film-specific. | Preserve a separate complete-measurement validity mask. NaN-to-zero export without that mask incorrectly admits unmeasured wavelengths. |
| Paper curves/response (`paperLogExposure`, `paperFittedCurves`, `paperLogSensitivity`, `paperChannelDensity`, `paperBaseDensity`, `paperSpectralValidMask`) | Selected declared paper: Portra Endura, Fuji Crystal Archive Type II, Kodak 2383, or supported B&W paper. | Evaluate the selected paper's fitted curve model with the fixed morph settings. Do not reuse Portra Endura's arrays for Fuji or cinema output. |
| Enlarger/filter (`filteredEnlarger`) | Pair-specific C/M/Y from the exact neutral-filter database; paper log sensitivity; selected TH-KG3 source; print exposure if explicitly non-1. | Lookup order is `[paper][illuminant][film]`. Reject a missing exact entry instead of silently retaining Portra [0,51.568...,52.534...] or generic defaults. B&W filter-2 values and `paper_grades.json` are product data, not entries in the original color filter database. |
| Mid-gray calibration | Both film raw curves and the pair's enlarger receiver, film dye/base/mask, and selected print-exposure policy. | Recompute neutral scene-linear [0.184,0.184,0.184], develop **without DIR**, integrate, then divide all three channels by the scalar geometric mean as in the validated fixed path. Do not use normalized film curves or independent per-channel normalization. The existing mid-gray scalar is not transferable to another pair. |
| Reference/viewing color transforms | `proPhotoToXyzD55Cat16` must become reference-illuminant-aware for T; fixed `d50` and `xyzD50ToSrgbCat02` cannot represent `kodak_2383`/`2393` viewing illuminant K75P. | Use a general `proPhotoToXyzReferenceCat16`, `viewingIlluminant`, and `xyzViewingToSrgbCat02` (or equivalent explicit versioned schema). D50 paper pairs can reuse D50 arrays; K75P requires its spectrum, normalization and CAT matrix generated from the same colour-science environment. |
| Output gamut | Common only while output color space, algorithm, knee parameters, observer and viewing conversion remain fixed. | Current contract is sRGB + measured **OkLch** configuration, not the upstream current CAM16-UCS default. `cam16LGrid`, `cam16HGrid`, `cam16Cmax` are misleading legacy names for the cached OkLch maximum-chroma grid; keep them common only for identical OkLch generation. A different algorithm/color space needs new tables and fixtures. |
| Provenance/validity metadata | Film/paper IDs, exact target, all source/filter/table hashes, reference/viewing illuminants, adaptation flags, spatial/stochastic omissions, modification notice. | Reject role-invalid pairs (`film.stage != filming`, wrong support/type; `paper.stage != printing`), missing filters, invalid spectral masks, nonfinite tables, or unsupported channel models. Do not label an unexecuted setup as validated. |

### Fields and behavior that stay common for the supported fixed color contract

- Scene-linear ProPhoto RGB input (`input_cctf_decoding=false`), byte adapter from sRGB to linear ProPhoto (`srgbToProPhoto`), and encoded sRGB output with alpha preserved outside the spectral stages.
- 380-780 nm at 5 nm (81 samples), CIE 1931 2-degree CMFs, spectral-integral ordering, `10**log_sensitivity`, density-to-transmission rules, `1e-10` log epsilon, and separate film/paper validity masks.
- 192x192 TC geometry and Mitchell-Netravali interpolation with reflected indexes/clamped coordinates, the established input CIE-xy compression, and the tri/quad coordinate conversion. The numeric TC contents still vary by film.
- Zero camera exposure compensation, no auto exposure, fixed mid-gray 0.184, print exposure 1 for the supported color pairings, print exposure normalization enabled, no preflash/filter shifts, TH-KG3 enlarger with the exact pair filter, and analytic dichroic filter construction. The Schott KG3 source itself remains a provenance blocker.
- Film development order, pointwise DIR amount 1 with zero spatial diffusion, paper fitted-curve evaluation, and distinct film raw / negative density / paper log exposure / paper density / print RGB stages.
- sRGB/XYZ/ProPhoto primary matrices, OkLab transform matrices and the fixed OkLch grids/knees when the output configuration is unchanged. `cmfs` is shared across all four declared color papers; the viewing illuminant is not necessarily shared.
- Spatial/stochastic omissions: no grain, halation/scatter, DIR diffusion, glare, lens/scanner blur or unsharp mask. Consequently `antihalation` is inventory metadata, not an implemented per-stock effect. CineStill cannot be considered fully represented under this common subset.
- Per-setup source and fixture manifests, finite/shape/digest validation, explicit tolerances, gray/green/neutral/photo cases, and CPU/GPU comparisons at all intermediate stages. Portra fixtures cannot serve as expected values for other stocks.

### Required generation order

1. Resolve the exact film and its declared default paper; assert the camera-negative and print roles.
2. Read exact pair filters and processing settings; fail on missing entries or unsupported `channel_model`.
3. Generate the film TC table using that film's sensitivity/window/reference illuminant; generate its film curve/DIR arrays and validity mask.
4. Generate paper curves/dye/base/mask, filtered enlarger and viewing spectrum/transform for that pair.
5. Recompute mid-gray normalization from the selected film raw curves and pair receiver.
6. Reuse only configuration-identical common color/gamut resources; emit a compact manifest of source hashes, settings, generated payload hashes and validation status.
7. Validate each new pair against independently generated pinned-upstream fixtures. Do not execute new setups in production merely because the resource decoder accepts them.

### Current local patterns relevant to the contract

- `services/spectral/setup.ts:3` pins one upstream revision and `:94-111` validates only the fixed configuration; `ARRAY_SHAPES` is Portra-specific despite most shapes being common to current profiles.
- `services/spectral/film.ts:5-14` consumes the exported reference-adapted matrix and TC table; `:17-35` applies normalized curves then pointwise DIR.
- `services/spectral/print.ts:41-72` prepares a pair-specific receiver and scalar normalization; `:75-109` exposes/develops paper; `:111-121` constructs a D50 receiver.
- `services/spectral/scan.ts:58-74` applies the fixed D50-to-sRGB matrix and OkLch compressor; this is a concrete cinema-print blocker until generalized.
- `scripts/spectral/export_portra_reference.py:123-168` constructs Portra resources; `:169-246` emits the setup; `:256-320` exports fixtures and source copies. Its fixed test parameter helper always chooses Portra 400/Endura.

## External references (all pinned)

- [spektrafilm profile directory](https://github.com/andreavolpato/spektrafilm/tree/3bb2c2d2801ff68b92019cf1dbcbb133d60832bc/src/spektrafilm/data/profiles) - authoritative stage/type/support/illuminant/target metadata and measured arrays.
- [spektrafilm neutral filters](https://github.com/andreavolpato/spektrafilm/blob/3bb2c2d2801ff68b92019cf1dbcbb133d60832bc/src/spektrafilm/data/filters/neutral_print_filters.json) - exact paper/illuminant/film pair values.
- [spektrafilm runtime defaults](https://github.com/andreavolpato/spektrafilm/blob/3bb2c2d2801ff68b92019cf1dbcbb133d60832bc/src/spektrafilm/runtime/params_schema.py) and [stock-specific digestion](https://github.com/andreavolpato/spektrafilm/blob/3bb2c2d2801ff68b92019cf1dbcbb133d60832bc/src/spektrafilm/runtime/params_builder.py) - adaptation flags, neutral-filter lookup, DIR and halation presets.
- [spektrafilm illuminants](https://github.com/andreavolpato/spektrafilm/blob/3bb2c2d2801ff68b92019cf1dbcbb133d60832bc/src/spektrafilm/model/illuminants.py) - T = Incandescent, K75P = Kinoton 75P, TH-KG3 = filtered 3400 K blackbody.
- [spektrafilm profile/LUT license](https://github.com/andreavolpato/spektrafilm/blob/3bb2c2d2801ff68b92019cf1dbcbb133d60832bc/SPEKTRAFILM_LICENSE.txt) - CC BY-SA 4.0 attribution/share-alike/changelog requirements.
- [SpektraLab product NOTICE](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/engine/resources_product/NOTICE.md) - product-owned B&W profile provenance and CineStill alias explanation.
- [SpektraLab profile loader](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/engine/src/core/profile.cpp) - exact alias inheritance behavior.
- [SpektraLab StockCatalog](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/modern_UI/Spektrafilm/Spektrafilm/Resources/StockCatalog.json) - catalog roles, CineStill default print and gauge metadata.
- [SpektraLab B&W filters](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/engine/resources_product/neutral_print_filters.json) and [paper grades](https://github.com/JamesQiu2005/SpektraLab/blob/02d82b56cf65f0f8e802a708612edc4e9a4790af/engine/resources_product/paper_grades.json) - grade-2 default and grade-dependent print exposure.

## Related specs and prior research

- `.trellis/tasks/11-06-webgl2-spectral-migration/prd.md` - Phase C registry, exact-pairing and no-faked-parity requirements.
- `.trellis/tasks/11-06-webgl2-spectral-migration/design.md:39-67` - initial mapping hypotheses; this report verifies and corrects them.
- `.trellis/tasks/11-06-spectral-negative-print-prototype/research/upstream-configuration-and-provenance.md` - fixed Portra numerical configuration, source hashes and known dark-column drift.
- `.trellis/tasks/11-06-integrate-spektralab-negative/research/spektralab-film-edge-and-licensing.md` - separate physical-edge scope and licensing boundaries.
- `.trellis/spec/frontend/quality-guidelines.md` - real-browser image validation, resource ownership, Worker/main parity and render-identity requirements.

## Licensing and unresolved-distribution caveats

1. The 28 original spektrafilm profiles and direct encoded derivatives are **CC BY-SA 4.0**, by Andrea Volpato. Preserve attribution, canonical source, license text/link and modification indication/changelog; direct derived tables remain share-alike. The supplied license says finished photographs remain their authors' works. This report does not clear FilmFrame's overall distribution.
2. Derived numeric code remains **GPL-3.0-or-later** per the existing prototype notice. SpektraLab's product profiles are not Andrea's CC profiles; the product NOTICE supplies provenance but no separate standalone data grant was identified. Do not silently reclassify them as CC BY-SA or claim their redistribution is resolved.
3. **Hanatos irradiance and measured KG3 filter redistribution remain unresolved.** The SpektraLab profile changelog explicitly says Hanatos/KG3 and other constants are not covered by Andrea's profile license. Do not describe them as public domain, permissive or CC-covered.
4. The local `services/spectral/NOTICE.md` prohibits public distribution of the derived setup tables/build until the sibling provenance task and global FilmFrame asset review resolve the blockers. No rights are cleared by this research; the global manifest was not read as authorization and was not modified.

## Caveats / Not Found

- No upstream renderer or exporter was run in this research. Metadata, source behavior and byte hashes were inspected through public GitHub API responses; no new pair was numerically validated.
- Exact profiles were not found for Kodak ColorPlus 200, Kodak Pro Image 100, Kodak T-Max 400, Kodak T-Max P3200, Fuji Superia 400, or an explicitly named Ektachrome E100 at the two pins. Absence at these pins is not a claim that no independently licensed profile can ever be created.
- CineStill's alias identity is resolved; exact CineStill appearance is **not** resolved by the fixed pointwise pipeline because the alias's no-rem-jet halation is omitted. The filter row above is inherited base-pair data, not a newly fitted CineStill print calibration.
- The Vision3 additions require K75P viewing resources and the two T-balanced stocks require tungsten camera-reference transforms. These are unsupported by the current D55/D50-only setup schema.
- SpektraLab's B&W NOTICE says its engine does not read `paper_grades.json` or the product neutral-filter pack directly; a caller supplies them. The registry must therefore pass the selected grade/exposure explicitly rather than assuming profile `target_print` alone configures the print.
- No product code, spec, global provenance manifest, git state, or task-selection state was changed.
