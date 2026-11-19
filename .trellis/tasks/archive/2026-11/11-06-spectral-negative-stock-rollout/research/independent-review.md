# Independent final review and resolution

## Initial verdict

The independent `trellis-check` review rejected closure on two P1 findings:

1. Gold 200's layered main-thread and Worker paths still applied the legacy RGB approximation instead of the shared spectral aperture backend. Spectral errors could be swallowed by the layered-template fallback.
2. Worker flattened-strip drawing did not await its async frame function. Spectral strips could reach export before spectral work completed, while main-thread fallback explicitly rejected them.

It also identified loading all 12 derived resources for any non-Portra selection, missing production digest verification, and insufficient production-path CPU/GPU evidence.

## Fixes

- Gold layered main and Worker emulsions now await the shared spectral aperture stage before grain/mask/frame markings. Spectral layered failures propagate rather than silently selecting a flattened/legacy output. Legacy Gold retains its previous approximation when explicitly selected.
- A shared spectral-strip guard rejects unsupported spectral strips in the Worker client before creating a Worker, plus the main and Worker entry boundaries. The asynchronous flattened Worker frame call is awaited even though legacy strips do not currently enter that spectral stage. Users receive a specific Chinese single-frame limitation message rather than a generic corrupt-photo/memory diagnosis.
- Every non-Portra stock has an independent dynamic resource import. Production loading verifies registry film/paper identity and every numerical array's SHA-256 before backend allocation. Setup metadata defaults are explicit only for the original Portra resource, with a fixed D55/D50/T/K75P allowlist.
- The pipeline, backend and WebGL renderer require an explicit validated pipeline; no generic production entry silently loads Portra. Reference harnesses/tests explicitly select the Portra resource.
- Added Gold layered resource/pixel/GPU-failure and spectral-strip browser regressions, plus a unit assertion that unsupported spectral strips create no Worker or main result.

## Independent re-review

The original reviewer confirmed both P1 findings closed with no new blockers. It checked the Gold main/Worker paths, terminal spectral failure behavior, shared strip guards and missing `await`, per-stock resource loading/digests, explicit pipelines, and the bounded production evidence. Its focused Playwright run was 3/3 and `git diff --check` passed.

## Production evidence and limits

`gold-production-validation.json` records real Chrome 156 / Apple GPU production FilmFrame runs for Gold's layered path. With zero grain, PNG output and a 100x100 aperture interior:

- CPU Worker versus CPU main: zero differing byte values;
- GPU Worker versus GPU main: zero differing byte values;
- GPU Worker versus CPU Worker: zero differing byte values.

This is deliberately not a claim that all legacy border/texture pixels are identical, that all 13 stocks were measured through hardware GPU in production, or that isolated 1080p GPU timings equal complete FilmFrame application latency. All 13 stocks have actual CPU production-render records, all non-Portra stocks have isolated hardware-GPU reports, and Gold covers the special layered production route in hardware GPU and CPU.

The final coordinator full run passed 217 unit tests, 120 stock/stage comparisons, 50 browser tests, 7 provenance tests, TypeScript, production build and `git diff --check`.

## Closure boundary

The supported color-negative, real-135 single-frame technical migration may close under the evidence above. Unsupported exact stocks remain blocked; continuous spectral strips are explicitly unsupported; B&W, positive/slide, CineStill-specific spatial halation, RAW/negative-scan inversion and full native spatial/stochastic parity remain out of scope.

Public distribution remains independently blocked by the provenance ledger. Independent technical acceptance does not clear Hanatos/KG3, historic FilmFrame assets, corresponding-source readiness, dependency notices or any owner review. No commit, push or public release is implied by this review.
