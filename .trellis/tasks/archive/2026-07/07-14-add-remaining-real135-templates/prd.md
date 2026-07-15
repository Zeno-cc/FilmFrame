# Add Remaining Real 135 Film Templates

## Goal

Integrate the user-provided film-border artwork for every `FilmType` that does not yet have a real-135 template, so all 16 selectable film stocks support the existing single-frame and continuous-strip real-135 workflows.

## Background

- The application currently registers five real-135 templates: Kodak Gold 200, Portra 160, Portra 400, Ektar 100, and Portra 800.
- The user supplied 12 PNG files covering the remaining 11 film stocks. The two T-MAX 400 files are byte-identical (`sha256 d00ff099...`) and represent one asset.
- Ten unique sources are `1308x1203`; Kodak T-MAX P3200 is `1307x1203`; Kodak Tri-X 400 is `1308x1202`. All are RGB PNGs.
- Runtime flattened templates share one immutable contract: RGB `1307x1203`, black aperture `x=92, y=211, width=1123, height=800`.
- Source apertures differ substantially and must be measured per image before piecewise normalization.

## Source Mapping

| FilmType | Source | Measured aperture | Runtime asset |
| --- | --- | --- | --- |
| `KODAK_ULTRAMAX_400` | `48-01-228d394f.png` | `1173x822+66+174` | `kodak-ultramax-400.png` |
| `KODAK_COLORPLUS_200` | `47-01-9617bdcb.png` | `1120x811+97+189` | `kodak-colorplus-200.png` |
| `KODAK_PROIMAGE_100` | `46-01-226ae5d8.png` | `1222x882+44+144` | `kodak-pro-image-100.png` |
| `KODAK_EKTACHROME_E100` | `52-01-8fba4945.png` | `1064x676+120+263` | `kodak-ektachrome-e100.png` |
| `KODAK_TRI_X_400` | `54-01-d17750ae.png` | `1206x842+51+177` | `kodak-tri-x-400.png` |
| `KODAK_TMAX_100` | `55-01-02a44756.png` | `1229x836+39+179` | `kodak-tmax-100.png` |
| `KODAK_TMAX_400` | `56-01-f8ccb606.png` | `1217x792+49+195` | `kodak-tmax-400.png` |
| `KODAK_P3200` | `57-01-2b9bfdb8.png` | `1238x856+32+177` | `kodak-tmax-p3200.png` |
| `FUJI_SUPERIA` | `58-01-e910139a.png` | `1236x843+35+167` | `fuji-superia-400.png` |
| `CINESTILL_800T` | `59-01-30a65498.png` | `1208x814+54+195` | `cinestill-800t.png` |
| `ILFORD_HP5` | `61-01-e4a54308.png` | `1097x832+110+184` | `ilford-hp5-plus.png` |

## Requirements

1. Produce one normalized RGB PNG for each mapping under `public/film-overlays/`.
2. Preserve the supplied film base, perforations, labels, texture, and edge wear while aligning every output to the shared canvas and aperture contract.
3. Do not add or regenerate visual content. This task performs deterministic geometry normalization only.
4. Register all 11 assets in `REAL135_TEMPLATE_URLS`, allowing the existing capability helper to enable real 135 without new UI branches.
5. Keep Kodak Gold 200 as the only Worker-enabled stock. All newly registered assets must follow the established main-thread flattened-template path.
6. Preserve `createFilmTemplateStripLayout()` with `frameGap=0`, so adjacent flattened frames touch without an extra gutter.
7. Update runtime asset documentation, rendering architecture documentation, and the project README to describe complete real-135 coverage.
8. Expand unit and browser tests for registry coverage, Worker policy, and single/strip rendering.

## Acceptance Criteria

- [x] Eleven new assets exist with the filenames in the source mapping.
- [x] Each asset is an RGB `1307x1203` PNG.
- [x] Each target aperture is exactly black at `92,211,1123,800`.
- [x] Each asset retains non-black film material at all four outer edges, with no normalization padding.
- [x] Every `FilmType` returns a registered real-135 overlay URL and `supportsReal135Template()` returns `true`.
- [x] Worker routing remains `true` only for Kodak Gold 200 real 135 with templates enabled.
- [x] Every new stock completes real-135 single and strip rendering in Chromium.
- [x] Flattened strip layout continues to use zero frame gap.
- [x] `npm run check`, `npm run test:e2e`, and `git diff --check` pass.

## Out of Scope

- Changing film color science, photo emulation, grain behavior, crop geometry, output resolution, or Worker architecture.
- Regenerating or retouching the supplied artwork.
- Introducing a second template geometry or stock-specific aperture contract.
