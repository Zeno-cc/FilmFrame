# Profile and LUT Modification Changelog

This file accompanies the unmodified `licenses/spektrafilm-profiles-CC-BY-SA-4.0.txt` notice.

## 2026-11-06 — Provenance scaffolding

- Added license/provenance tracking only.
- No spektrafilm film profile, paper profile, print LUT or direct derivative has been imported or modified by this license task.

## Required Entries for the Spectral Prototype

For each imported or generated profile/LUT/derivative, append:

- upstream author (Andrea Volpato for the original spektrafilm profiles) and canonical URL;
- pinned upstream commit/path and SHA-256;
- local path and SHA-256;
- modification/encoding changes and the person/tool making them;
- retained CC BY-SA 4.0 license and link;
- spectral-constant provenance separately, rather than assuming the profile notice covers it.

Finished user photographs remain their authors' works. Do not impose CC BY-SA on exported photos.

## 2026-11-11 — Portra 800 Push 1/2 exact profile derivatives

- Original author: Andrea Volpato, spektrafilm, https://github.com/andreavolpato/spektrafilm, pinned revision `3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`, **CC BY-SA 4.0**.
- Unmodified source profiles are `services/spectral/resources/kodak_portra_800_push1.json` (SHA-256 `dac9cbcd2442442d9dee90bd2d6a28dcc4b996635dcac0b44ac8ecd32c4b3a4f`) and `kodak_portra_800_push2.json` (`5ee01e4a00c157721738314313a43b46fcd5dae62ed3a7e4730f9054b66f6282`).
- FilmFrame's maintenance exporter generated separate setup JSON and numerical NPY fixtures. Modifications are encoding, exact-pair filter selection, reference/viewing and explicit sRGB mid-gray calibration transforms, masked spectral integration and validation metadata. No measured curve or dye/base value was manually retuned.
- Derived setup SHA-256 values are `9e0bf68066ebe07e01b65f4979e7b28b50bfaba4a8fc7ac1222eebfc2b9d1f42` (push 1) and `29d299a96e0644a8a737b1628ad995fe07372035ab369e65d8f6039e0f7bfd0a` (push 2). Profile-derived portions retain CC BY-SA 4.0; exporter code retains GPL-3.0-or-later; colour-science 0.4.6 retains BSD-3-Clause.
- Hanatos irradiance and measured KG3 provenance remain separately unresolved. These records are not a public-distribution approval. Exact fixture digests and independent perforation residuals are in the full-stock task research.

## 2026-11-11 — Positive develop/direct film-scan profile derivatives

- Original author: Andrea Volpato, spektrafilm, https://github.com/andreavolpato/spektrafilm, pinned revision `3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`, **CC BY-SA 4.0**. Source profiles are `src/spektrafilm/data/profiles/{fujifilm_provia_100f,fujifilm_velvia_100,kodak_ektachrome_100,kodak_kodachrome_64}.json`; their pinned source digests and independent numerical fixtures are in `research/positive-export/manifest.json`.
- FilmFrame's controlled positive-export tooling encoded each profile's descending curves, positive-specific DIR, film dye/base, and direct D50 film-scan tables. No measured curve was manually retuned; no paper or generic negative-inversion path is used. Generated setup digests are `cac5203c0c06f0f93b192cd56baca53cf09925acb7b69dacaaea929365d4de1b` (Provia), `7425d77ab7517e007d1e5adc07547b243e352588adefe5b54e216edea3baf446` (Velvia), `5b7791b1718de841ee810764d2b9486b3b1f78ba9c577add7fb35167c2df075b` (Ektachrome), and `368349db4bca700dedf29cf7c3c20d940dc1918963c699bf165fc9ba26e3ca6f` (Kodachrome), in `services/spectral/resources/`.
- Profile-derived portions retain CC BY-SA 4.0; exporter code retains GPL-3.0-or-later. Hanatos irradiance, measured filters and global distribution remain separately unresolved. Native spatial/scanner blur, grain and physical perforation parity are not claimed.
