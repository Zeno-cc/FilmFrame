# Design: WebGL2 Spectral Migration

## Architecture Boundary

Reuse the existing CPU spectral implementation as the numerical oracle. Add a WebGL2 backend behind a common renderer interface; do not replace FilmFrame's React, Canvas2D composition, film border geometry, Worker client or export pipeline.

```text
sRGB photo / linear ProPhoto fixture
  -> float texture upload
  -> film exposure + development (GPU)
  -> negative-density texture (retained on GPU)
  -> paper exposure + development (GPU)
  -> scan + OkLch + sRGB output (GPU)
  -> readback once for existing 2D aperture composition
  -> existing grain / template / markings / Canvas export
```

## WebGL2 Contracts

- Require WebGL2 and `EXT_color_buffer_float`; use explicit RGBA16F/RGBA32F decisions from measured precision/support. Never infer floating-point rendering support from the existing OffscreenCanvas2D Worker gate.
- RGB negative density stays float in textures. Do not read back intermediate planes unless a test explicitly requests them.
- Precompute uniform lookup tables and compact spectral resources. Use one texture unit per bounded table with a documented layout; no huge JS plane duplication per pixel.
- Own programs, textures, framebuffers, vertex buffers, context and event listeners through a disposer. Handle compile/link/allocation/readback errors and `webglcontextlost` without a silent different-look fallback.
- A failed/unsupported GPU selects the equivalent CPU backend with identical settings or returns an actionable error if unavailable; cancellation never schedules a new CPU retry after termination.

## Parity and Measurement

- Reuse CPU gray-ramp/green/intermediate and sRGB conversion fixtures. Compare exact intermediate negative and paper densities as well as final output.
- Use GPU-specific tolerance based on actual float format and shader precision, not lowered thresholds chosen to hide mismatches.
- Measure cold setup, upload, first render, reprint, readback and texture allocation at 256x256/1920x1080. Firefox/WebKit focused small cases before integration; physical mobile later before any release.
- GPU memory is texture/format actuals; retained CPU JSON and readback buffers are separate. Do not equate array estimates with GPU/RSS total memory.

## FilmFrame Integration

The production insertion remains aperture/emulsion-only, after cover/crop/rotation and before grain/base/template/markings/export. Portra is the first explicit experimental single-frame mode; legacy is default. The shared backend interface must work on main and Worker, with a capability-specific factory rather than assuming `webgl2` exists wherever OffscreenCanvas exists.

FilmSettings additions are optional, normalized, included in `createRenderSettingsKey` and backward-compatible with preferences/recipes. Output artifacts remain Blob/byteSize/Object URL with the existing owner. All new resources have cleanup paths.

## Data-Driven Stock Registry

For each camera-negative stock, define:

- FilmFrame `FilmType` / new stock ID;
- upstream profile ID, revision, source URL/digest and CC notice;
- compatible paper profile and enlarger/filter configuration;
- static setup texture generation/digests;
- expected mapping (`replace-look`, `add`, `blocked`) and baseline evidence.

Generate common texture layouts, not per-stock shader copies. Paper stocks and slide films are excluded from the negative migration. Vision3 stocks are negative camera films; Kodak 2383/2393 are print stocks and not camera-negative upgrades. Fujifilm Provia/Velvia and Ektachrome/Kodachrome are positive/slide and need separate semantics.

Initial mapping evidence (validate against pinned profile JSON before implementation):

| FilmFrame | Upstream negative profile | Migration |
| --- | --- | --- |
| Kodak Gold 200 | `kodak_gold_200` | Replace only Gold's RGB approximation; preserve border |
| Kodak Portra 160/400/800 | matching profiles | Add spectral aperture look |
| Kodak Ektar 100 | `kodak_ektar_100` | Add spectral aperture look |
| Kodak Ultramax 400 | `kodak_ultramax_400` | Add spectral aperture look |
| Kodak ColorPlus 200 | no exact pinned profile | Block; do not substitute Fuji C200, Gold or another stock |
| Fuji Superia 400 | no exact Superia profile; `fujifilm_xtra_400` is a distinct stock | Keep Superia blocked; add X-Tra separately |
| Fuji Pro 400H | `fujifilm_pro_400h` | New stock |
| Kodak Vision3 50D/200T/250D/500T | matching profiles -> Kodak 2383 print | Add only after generalizing K75P viewing and T camera-reference transforms |
| Kodak Ektacolor Edge | paper / printing, not a camera negative | Exclude from camera-negative additions |
| CineStill 800T | exact alias to Vision3 500T with no anti-halation | Keep exact-look blocked until spatial halation exists; do not call base Vision3 full CineStill |
| Kodak Pro Image 100 | no exact pinned profile | Block exact-look claim |
| Tri-X 400 / T-Max 100 / HP5 Plus | exact SpektraLab product B&W profiles exist | Require separate B&W channel/paper/grade/provenance support, not fixed color setup |
| T-Max 400 / P3200 | no exact pinned profile | Block; do not substitute T-Max 100 or Tri-X |

No final stock mapping is considered verified until profile `stage`, `type`, `support`, target paper and filter data are read from the pinned JSON.

## Licensing and Rollout

GPL-derived code and CC BY-SA profile/table notices remain with the implementation. Hanatos/KG3 and historical FilmFrame asset rights remain release blockers, not reasons to stop local research. New derived resources need source/digest/provenance updates and a distribution review.

Proceed GPU feasibility -> one Portra integration -> duplicate negative stock migration -> missing negative stock additions. Each stage gets measured evidence and independent review. Do not start the complete stock catalog before the shared GPU/CPU contract works.
