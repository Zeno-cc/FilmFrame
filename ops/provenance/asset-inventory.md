# FilmFrame Asset Inventory and Rights Review

Reviewed 2026-11-06. `manifest.json` contains the SHA-256 digest for every binary listed here.

## Evidence Found

| Group | What repository evidence establishes | What remains unresolved |
| --- | --- | --- |
| 16 flattened stock templates plus Gold base | Historical tasks identify user-provided generated film-border artwork, measured per-image apertures, 3x3 resizing and black-window normalization. Commits `da7220c6e3de1161e36c44f29f6b0c1168b36d64`, `ff97a95dbb015645d0931ad5b6430c10da4a9db7` introduced groups. | Original generator/tool/prompts/source images, copyright owner and permission to redistribute/modify/commercially use. Film brand labels are not copyright clearance. |
| Aperture/shadow PNGs | `docs/project/rendering.md` identifies layered and process/intermediate roles. | Original creator, exact derivation and whether any unused intermediates can be excluded. |
| 16 sprocket masks | Archived `07-17-global-real135-sprocket-color/design.md:44-52` states masks were generated from the current normalized templates, transparent outside perforations. | Their rights follow the underlying template review; not independent cleared artwork. |
| `public/alipay.jpg` | Introduced/restored by FilmFrame commits `664decc6b3ac5f6a2785e8725bfe342dabd2c8a6` and `c636572ba8d49e1d80e1125d4b68e8d90fe61198`. | Creator/owner and distribution permission. Not needed by spectral processing. |
| UI icons/noise | `components/icons/FilmFrameIcons.tsx`, `components/app/FilmFrameAppIcons.tsx`, inline `index.html` SVG and CSS `feTurbulence` are project source, not downloaded image/font assets. | Owner must approve GPL licensing of project-owned code; no third-party asset license was found in this review. |
| Fonts | No bundled font file was found. UI/rendering requests system families such as JetBrains Mono, Arial, Helvetica Neue and generic sans-serif; rasterized font appearance is also present in historical generated templates. | Do not extract/redistribute system fonts. Template rasterization/source-font permission needs the same original-artwork review. |
| SpektraLab assets | Only public source/license research was performed. | No SpektraLab covers, icons, screenshots or font files are authorized or imported by this inventory. |

## Owner Questions

1. Were the generated film-border images created by you/the project, and with which tool or source material? Do you have permission to redistribute modified versions under the chosen project license?
2. Are the Gold base and aperture/shadow assets derived from those same generated images? Can unused process files be omitted from distribution?
3. Is `alipay.jpg` a project-owned payment QR image, and may it continue to be distributed?
4. Can all project-owned source code and project-created inline icons/noise be licensed GPL-3.0-or-later?

Until these have recorded answers, `rightsStatus` remains `owner-review` and public derived distribution is blocked. A yes/no answer without provenance is not represented as a legal determination.

## Archived Source Mapping

`.trellis/tasks/archive/2026-07/07-14-add-remaining-real135-templates/prd.md:17-29` records supplied source filenames and measured apertures for 11 templates. `.trellis/tasks/archive/2026-07/07-13-add-portra400-ektar100-portra800-real135/design.md:7-11` records deterministic normalization. These records establish process, not copyright ownership.
