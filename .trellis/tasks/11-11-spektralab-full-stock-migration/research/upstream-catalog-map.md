# SpektraLab → FilmFrame 全目录逐项对照

Source pin: `JamesQiu2005/SpektraLab@02d82b56cf65f0f8e802a708612edc4e9a4790af`.
Catalog: 34 entries, not 34 interchangeable 135 color-negative profiles. Current runtime coverage: 14 exact color-negative setups including two push variants, four positive setups, four product monochrome setups, and one CineStill alias with its own bounded spatial path. Missing resources remain explicitly blocked.

## Camera negatives and push variants

| Upstream ID / name | FilmFrame identity | Current state | Required next action |
| --- | --- | --- | --- |
| `kodak_portra_160` | `KODAK PORTRA 160` | Exact spectral + physical135, replace-look | Keep; no duplicate import. |
| `kodak_portra_400` | `KODAK PORTRA 400` | Exact spectral + physical135, replace-look | Keep; primary validated reference. |
| `kodak_portra_800` | `KODAK PORTRA 800` | Exact spectral + physical135, replace-look | Keep; distinct from push variants. |
| `kodak_portra_800_push1` | `KODAK PORTRA 800 PUSH 1` | Exact spectral + physical135, add | Separate profile/digest and independent residual verified; shared documented Portra 800 edge identity only. |
| `kodak_portra_800_push2` | `KODAK PORTRA 800 PUSH 2` | Exact spectral + physical135, add | Separate profile/digest and independent residual verified; do not reuse ordinary Portra 800 numerical acceptance. |
| `kodak_ektar_100` | `KODAK EKTAR 100` | Exact spectral + physical135, replace-look | Keep. |
| `kodak_gold_200` | `KODAK GOLD 200` | Exact spectral + physical135, replace-look | Keep. |
| `kodak_ultramax_400` | `GC 400 KODAK` | Exact spectral + physical135, replace-look | Keep. |
| `fujifilm_c200` | `FUJI C200` | Exact spectral + physical135, add | Keep distinct Fuji paper and Kodak-family edge, not Portra. |
| `fujifilm_xtra_400` | `FUJI X-TRA 400` | Exact spectral + physical135, add | Keep; distinct from Superia. |
| `fujifilm_pro_400h` | `FUJI PRO 400H` | Exact spectral + physical135, replace-look | Full physical spectral enabled following upstream overscan.cpp (no residual gate). 135 edge borrows X-Tra 400 layout, unverified; not a measured Pro 400H edge. |
| `kodak_vision3_50d` | `KODAK VISION3 50D` | Exact spectral + physical135, add | Keep. |
| `kodak_vision3_200t` | `KODAK VISION3 200T` | Exact spectral + physical135, add | Keep tungsten/K75P behavior. |
| `kodak_vision3_250d` | `KODAK VISION3 250D` | Exact spectral + physical135, add | Keep. |
| `kodak_vision3_500t` | `KODAK VISION3 500T` | Exact spectral + physical135, add | Keep; do not alias to CineStill. |
| `cinestill_800t` | `CINESTILL 800T` | Exact Vision3 alias + bounded no-rem-jet spatial path, add | Headroom and four signed Gaussians have independent CPU/SciPy and WebGL2 references. Compatibility edge only; not full native spatial/perforation or measured-halo parity. |
| `kodak_verita_200d` | Missing | No exact resource/enum; motion formats not current 135 scope | Add only with exact resource and format-specific evidence; never substitute Vision3. |

## Monochrome — distinct imaging required

| Upstream ID / name | FilmFrame identity | Current state | Required next action |
| --- | --- | --- | --- |
| `fujifilm_neopan_acros_100_ii` | `FUJI ACROS II` | Product monochrome + Multigrade, add | Distinct silver tone and scalar hole-density checks passed; physical135 not enabled, native grain/sharpness not claimed. |
| `ilford_hp5_plus_400` | `ILFORD HP5 PLUS` | Product monochrome + Multigrade, replace-look | Exact product tone and Worker/main rendering verified; preserve compatibility Ilford edge and independent rights review. |
| `kodak_tri_x_400` | `KODAK TRI-X 400` | Product monochrome + Multigrade, replace-look | Exact product tone; no ordinary DX per upstream evidence; physical135 not enabled. |
| `kodak_tmax_100` | `KODAK T-MAX 100` | Product monochrome + Multigrade, replace-look | Exact product tone; no fake DX; not a T-Max 400 substitute. |

## Positive / slide — separate pipeline required

| Upstream ID / name | FilmFrame identity | Current state | Required next action |
| --- | --- | --- | --- |
| `fujifilm_provia_100f` | `FUJI PROVIA 100F` | Positive develop + direct film scan, add | Exact descending curves and positive DIR verified; no paper, native spatial effects or physical perforation claim. |
| `fujifilm_velvia_100` | `FUJI VELVIA 100` | Positive develop + direct film scan, add | Exact profile and CPU/GPU/Worker-main checks; compatibility edge only. |
| `kodak_ektachrome_100` | `KODAK EKTACHROME E100` | Positive develop + direct film scan, replace-look | Positive references verified; existing E100 flattened compatibility template is not measured evidence. |
| `kodak_kodachrome_64` | `KODAK KODACHROME 64` | Positive develop + direct film scan, add | Exact profile and direct scan; no negative/paper substitution. |

## Printing paper / destinations — not camera stocks

- `fujifilm_crystal_archive_typeii`, `kodak_portra_endura`, `kodak_endura_premier`, `kodak_supra_endura`, `kodak_ultra_endura`, `kodak_ektacolor_edge`, `kodak_2383`, `kodak_2393`, `ilford_multigrade_iv_rc`.
- Current implementation binds exact paper only to the currently selected color-negative (Fuji paper, Portra Endura, Kodak 2383) or product monochrome Multigrade grade 2. These are destination resources, not camera stock entries.
- Additional paper destinations must not be exposed as camera `FilmType` choices or silently used to alter Pro 400H residual. If exposed later, they need their own print-output settings, source/digest, numerical references and UI.

## FilmFrame entries absent from the pinned upstream catalog

- `KODAK COLORPLUS 200`, `KODAK PRO IMAGE 100`, `FUJI SUPERIA 400`, `KODAK T-MAX 400`, `KODAK T-MAX P3200`.
- Keep explicit legacy compatibility until exact source-backed resources exist. Do not invent spectral profiles, DX codes or claim full migration from a different model.

## Evidence boundaries

- Legacy-template edges for Vision3, Fuji C200/X-Tra/Pro 400H, Acros II, Provia, Velvia and Kodachrome use a shared programmatic `COMPATIBILITY` edge with the selected name and generic geometry. They never request CineStill, Superia or other borrowed branded scans. Their imaging resources and physical-geometry capabilities remain separately gated.
- Upstream `overscan.cpp` explicitly says Pro 400H's 135 edge is borrowed/unverified and Ektachrome's 135 reference is absent. Physical hole solvability does not establish an exact measured edge layout.
- Product B&W profiles are constructed from manufacturer data sheets and separate from spektrafilm's 28 color profiles. Their source/license must be recorded separately; no blanket reuse permission is inferred from a parent license.
- The catalog does not itself provide every profile's bytes or measurement. Adding an entry requires actual profile/resource validation and source-specific provenance.
