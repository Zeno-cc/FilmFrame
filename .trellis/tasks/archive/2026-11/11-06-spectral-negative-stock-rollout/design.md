# Design: data-driven negative stock migration

## Resource Model

Move from a fixed `PortraSetupResource` to a versioned `SpectralStockResource` with film/paper metadata, validated arrays, source digests, reference/viewing illuminants and processing configuration. Keep the validated Portra resource as one registry entry, not a global constant used for all stocks.

Each film/paper pair generates:

- film TC LUT and log/characteristic/DIR curves;
- film dye/base/sensitivity/validity mask;
- selected paper curves/dye/base/sensitivity/validity mask;
- filtered enlarger and per-pair scalar mid-gray normalization;
- viewing illuminant and viewing-to-sRGB matrix;
- reference-adapted scene transform (D55 or T);
- source/profile/filter/table digests and modification notices.

## Backend Reuse

The shared CPU and WebGL backend receives a pipeline/resource, not a hardcoded film. Texture layouts are generated from the selected resource. GPU resource objects and frame objects are disposed per stock/render, not allowed to accumulate across film selection changes.

## Registry and Migration

- `replace-look`: Portra 160/400/800, Gold 200, Ektar 100, Ultramax 400.
- `add`: Fuji C200, X-Tra 400, Pro 400H.
- `add-after-color-support`: Vision3 50D/200T/250D/500T with Kodak 2383, K75P viewing and T camera reference where applicable.
- `blocked`: ColorPlus, Pro Image, Superia 400, T-Max 400, P3200, Ektacolor Edge, slide films, B&W and exact CineStill look.

The registry records migration state and blockers; unsupported existing FilmFrame stocks keep legacy behavior instead of silently substituting a different profile.

## Validation

For every new pair, generate upstream references in the same isolated pinned environment and check film raw/negative/paper/output at small fixtures before real FilmFrame integration. A resource decoder accepting data is not a validation result.

Preserve the existing CPU oracle and compare GPU at supported devices. New film types must normalize settings, recipe round-trips and artifact keys. Actual FilmFrame outputs must retain the chosen template and output MIME/quality.

## Licensing

Keep original CC BY-SA profile attribution, modification log and exact source digests. New derived tables preserve applicable licenses; unresolved Hanatos/KG3 and product B&W data remain separate blockers. No public release is implied by migration.
