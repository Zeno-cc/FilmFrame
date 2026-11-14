# Experimental spectral rendering notices

This directory provides FilmFrame's spectral imaging routes. New sessions use
spectral negative development with physical 135 by default; old preferences and
recipes retain their explicit legacy/template behavior. Supported monochrome
product profiles, positive develop/direct film scan, physical spectral strips,
and the bounded CineStill no-rem-jet path are implemented separately. This is
not a full SpektraLab port, a universal stock/template migration, or a public
release/distribution approval. Legacy-template spectral strips remain disabled,
and native spatial/stochastic effects and unvalidated physical perforation
development are not claimed.

## Derived numeric implementation

The fixed TypeScript film/negative/print/scan pipeline and its maintenance
exporter are derived from **spektrafilm by Andrea Volpato**:
https://github.com/andreavolpato/spektrafilm
Pinned revision: `3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`.
Licensed **GPL-3.0-or-later**; see `LICENSE-GPL-3.0.txt`.

SpektraLab was consulted for pipeline boundaries at pinned revision
`02d82b56cf65f0f8e802a708612edc4e9a4790af`:
https://github.com/JamesQiu2005/SpektraLab
Its application/engine is GPL-3.0-or-later. No SpektraLab branding, artwork,
font, native binary, C++/Metal/Vulkan code is included. Product-owned B&W
profiles are included under separate provenance and unresolved-rights review,
not under spektrafilm's profile license. No endorsement is implied.

**Modification by FilmFrame experimental implementation, 2026-11-06:** ported
the pointwise TypeScript/float-array film-to-print slice, beginning with
Portra 400 -> Portra Endura and extending to the exact film/paper pairs listed
in `CHANGELOG.md`; added dimension/allocation validation, explicit stage
outputs and alpha adapter, deterministic regression and browser benchmark
harnesses, a float-texture WebGL2 backend, and spectral Canvas integration.
Product monochrome, positive direct-scan and bounded CineStill spatial paths
were added separately with their own validation; unimplemented native spatial
and stochastic effects remain excluded. FilmFrame's existing separate
grain/template composition is retained. Fixed
configuration uses measured `oklch` output compression, not the current
default CAM16-UCS. No public release or full numerical/native parity is
claimed.

## Profiles and direct profile-derived tables

`resources/kodak_portra_400.json` and `resources/kodak_portra_endura.json` are
unmodified copies of the pinned upstream JSON profiles.

**spektrafilm by Andrea Volpato.**
https://github.com/andreavolpato/spektrafilm
Licensed **CC BY-SA 4.0**; see unmodified `SPEKTRAFILM_LICENSE.txt`.
The profiles, any direct encoded profile derivatives, and their redistributed
changes retain this license. Finished photographs remain their authors' works;
no CC license is asserted over synthetic/user output. See `CHANGELOG.md` for
local modifications.

## Colour-science tables

CIE observer, D50 illuminant, RGB matrices and OkLab transform tables were
exported using **colour-science 0.4.6**, Copyright 2013 Colour Developers,
**BSD-3-Clause**. See `LICENSE-colour-science-BSD-3-Clause.txt`. The source
project is https://github.com/colour-science/colour.

## Unresolved provenance / distribution block

The contracted film TC table derives from upstream Hanatos irradiance spectra;
the filtered TH-KG3 illuminant derives from measured KG3 filter data. Their
individual redistribution licenses were not established by the pinned source
notices examined for this prototype. They are **not** declared public-domain,
permissive, or covered by the profile CC BY-SA license. Local controlled
research use must not be described as distribution clearance.

**Do not publicly distribute these derived setup tables or a build containing
them until the sibling provenance/license task resolves or replaces those
inputs and completes the global FilmFrame asset/license review.** The global
manifest and release gate are owned outside this task and are not modified by
this notice.
