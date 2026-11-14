# Spectral Profile and LUT Modification Changelog

Accompanies the unmodified `SPEKTRAFILM_LICENSE.txt` in this directory.

## 2026-11-06 — Isolated Portra research setup

- Imported `resources/kodak_portra_400.json` and `resources/kodak_portra_endura.json` without editing their profile values. Original work: spektrafilm by Andrea Volpato, https://github.com/andreavolpato/spektrafilm, CC BY-SA 4.0.
- Generated `resources/portra-setup.json` from the pinned profiles, Hanatos irradiance, measured KG3 filter data and colour-science 0.4.6 tables for a fixed local research pipeline. This is an encoded derivative where it contains profile/LUT data; preserve CC BY-SA 4.0 for those portions and the separate source notices.
- Selected measured **OkLch** output compression for comparison with the committed print-RGB fixtures. This is a configuration choice, not an edit to measured film/paper samples. Current default CAM16-UCS does not match those fixtures.
- Exported intermediate film/paper arrays for deterministic regression analysis. No photographic source data or measured curve was manually retuned.
- Hanatos irradiance and KG3 redistribution terms remain unresolved. This file does not grant distribution rights or replace source-specific permission review.

## 2026-11-06 — Data-driven negative stock migration

- Added exact-profile resources for Kodak Portra 160/800, Gold 200, Ektar 100, Ultramax 400, Fujifilm C200, X-Tra 400, Pro 400H and Kodak Vision3 50D/200T/250D/500T with declared print destinations. Original profile values are unmodified and retain **CC BY-SA 4.0**, Andrea Volpato, canonical spektrafilm source.
- Generated pair-specific TC/curve/DIR/dye/base/validity, enlarger/filter, mid-gray, viewing/reference and OkLch tables from the pinned profiles. These are direct encoded profile derivatives where applicable and retain the original license and attribution.
- Added `export_stock_reference.py` to validate roles, pinned source/profile digests, exact declared paper/filter and generated numerical stages. It does not substitute missing brands or infer CineStill/halation/B&W behavior.
- New FilmFrame entries use existing compatible border assets: Fuji-series border for Fuji C200/X-Tra/Pro 400H, and a cinema border for Vision3. These are **compatibility templates**, not independently measured scans of those exact stocks. Spectral imaging and border artwork remain separate provenance concerns.
- Hanatos/KG3, historic template rights and product-specific B&W data remain unresolved distribution blockers. Adding resources does not imply public release clearance.

## 2026-11-11 — Exact Portra 800 push variants

- Added unmodified `kodak_portra_800_push1.json` (SHA-256 `dac9cbcd2442442d9dee90bd2d6a28dcc4b996635dcac0b44ac8ecd32c4b3a4f`) and `kodak_portra_800_push2.json` (`5ee01e4a00c157721738314313a43b46fcd5dae62ed3a7e4730f9054b66f6282`), from spektrafilm by Andrea Volpato at revision `3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`, **CC BY-SA 4.0**.
- Generated separate push-1/push-2 Portra Endura resources with their own source-derived film curves, exact TH-KG3 filters, direct-sRGB mid-gray calibration transform and numerical fixtures. No ordinary Portra 800 setup or measured value was substituted or retuned.
- Both variants use the source-supported `PORTRA 800-3` / DX 1278 physical-edge identity. Their independent SVD base-canceling perforation residuals are `0.26500110271417954` over 59 valid wavelengths, rank 3. This supports the existing local perforation gate only; it is not a claim of complete native halation, grain or scanner parity.
- Historical Portra 800 legacy-template assets remain explicitly labeled compatibility borders. Physical-spectral rendering uses the variant's own resource and does not inherit the ordinary stock's calibration or fixture acceptance.
- Source/export and independent SVD evidence is recorded in `.trellis/tasks/11-11-spektralab-full-stock-migration/research/`. Hanatos/KG3 and global distribution blockers remain unresolved.

## 2026-11-12 — CineStill 800T alias and bounded back-reflection

- Uses the exact Vision3 500T setup with alias identity `cinestill_800t`, not a duplicated or ordinary Vision3 render. SpektraLab revision `02d82b56cf65f0f8e802a708612edc4e9a4790af`; alias SHA-256 `4b5c5771a1d4755cf2f2994bbc0529387d579cc8d9fb6e23fe5d3d856fc13161`, PSF SHA-256 `ee2902b67a10b1dce04ae5ac835529668cc8ae28579278fb36d90ea56aab6b3d`, base setup SHA-256 `11413d5f577a4ddcfbbb7cb215d88100b103b60d2870e9d1076529841d0d76d0`.
- Ported whole-frame maximum reduction, highlight headroom, four per-channel signed separable Gaussian convolutions and float exposure mixing into local TypeScript CPU/WebGL2 code. The bounded implementation uses reflected-edge truncate-3 FIR and is not the upstream IIR path for sigma >= 3. It does not include common scatter, lens/scanner blur, unsharp, stochastic grain or physical perforation development; the edge is an explicit compatibility template.
- Independent SciPy reflected convolution references and CPU/WebGL2 stage comparisons are in `tests/spectralCineStill.test.ts` and `tests/e2e/cinestill-stocks.spec.ts`. Technical validation does not resolve profile, model, historic-asset, corresponding-source or distribution rights.
