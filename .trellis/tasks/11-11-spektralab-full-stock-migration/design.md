# Design — source-pinned full-stock migration

## Boundaries

- Keep one local browser rendering session. No photograph bytes, server GPU, telemetry or third-party photo processing.
- A catalog entry is not automatically a camera stock: print papers remain destination resources, and motion-only formats remain outside the current 135 picker.
- Exact source identity, numerical imaging, physical perforation solvability, measured edge geometry and distribution rights are independent gates.
- Unsupported entries retain explicit legacy/blocked behavior. No look-alike stock, paper or DX substitution is promoted as a migration.

## Increment 1 — Portra 800 Push 1/2

Run `export_stock_pair_resources.py` with `python3 -I`, a fresh isolated environment and source/output/cache directories outside the downloaded checkout. The two profiles retain their own source SHA-256, Portra Endura filter and generated arrays. Verify exported-array references, TypeScript stage fixtures and the film-only clear-perforation least-squares residual independently before registration.

Add separate enum/display/resource/loader entries only for validated artifacts. `physical135` support is granted per variant after its own residual and production checks. Both may share the documented Kodak `PORTRA 800-3`/DX 1278 edge identity, not the ordinary stock's numerical validation. Preserve old preferences and recipes.

## Increment 2 — Independent imaging families

Monochrome resources remain distinct from color-negative setups: use the pinned product profile, Multigrade grade/filter/exposure and an explicit monochrome pipeline with CPU/WebGL2 parity and neutral-output references. Add Acros II and replace the three existing compatibility looks only after source-specific validation.

Positive/slide resources require their own develop-to-positive and film-scan representation. Do not use color-negative paper printing or generic negative inversion. Verify the pinned engine's stage semantics before implementing the resource schema and backends.

CineStill uses the source-backed Vision3 500T alias only as its base spectral identity. Its no-rem-jet/back-reflection spatial behavior must have an independent bounded local implementation and references before full support. Ordinary Vision3 500T output is never labeled CineStill.

Each family declares its capabilities separately: aperture imaging, physical perforation development, measured/approximate 135 edge, native spatial effects and redistribution. UI labels expose only implemented capabilities.

## Increment 3 — Evidence and integration

Record source revisions, input and generated digests, modification notices and applicable licenses for each new artifact. Extend stock matrices to real Worker/main rendering, CPU/auto where available, persistence/recipes, single/strip output and cleanup. Preserve blocked stocks. Pro 400H follows the pinned upstream finite-sample least-squares CMY without a local residual gate; its X-Tra-derived 135 layout remains explicitly approximate, not measured evidence. Verify the implementation against `research/pro400h-density-boundary.md`.

Distribution remains blocked until the rights inventory is actually resolved. Accessible source/license credits do not constitute legal clearance. No commit, push, deployment or release is part of this implementation authorization.

## Rollback and failure handling

Keep each new family opt-in through explicit capability metadata rather than changing global defaults. Reject missing/digested-mismatched resources and unsupported family/stock combinations before allocating spectral frames. Existing legacy recipes retain their historical semantics. Failed candidate exports stay outside runtime resources; no partial generated file is registered.
