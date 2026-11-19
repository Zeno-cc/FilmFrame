# Design — quality remediation

## Rollback configuration

The updater already owns deployment switching and SQLite access. Add a narrow configuration-read/semantic compatibility check at that boundary, rather than a generic migration framework. Check actual budget values against a named target's supported range before upgrade and before rollback switch. Reject failures closed, retain existing current state/lock, and surface the established recoverable error path. Never clamp or write the stored budget. `FIRST_4_GIB_VERSION = 1.5.0` is fixed by the tagged `v1.4.12` 2048 MiB limit and the next minor candidate, not inferred from the installing manifest. The root-only `recover_previous` action verifies the real previous release, revision, configuration and health before recording `rolled_back`; Access cannot invoke it.

## Strip timeout

Distinguish `WorkerTimeoutError` from ordinary Worker business errors. A strip timeout terminates the Worker, clears its singleton, and rejects without main-thread duplicate rendering; a retry constructs a fresh Worker. Ordinary quick business errors keep their existing single main-thread retry. Single-image behavior stays unchanged. App retains accepted single-frame artifacts; a terminal strip timeout revokes the invalidated previous strip URL and removes its download state. Partial or late strip output never becomes an accepted result.

## Dependencies and cleanup

Apply only small compatible dependency updates after verifying actual resolved versions. Preserve the spectral checker when changing Vite/Vitest; do not select an unverified vite-node combination. Remove only zero-consumer symbols and local metadata, never runtime assets or required public interfaces.

## Performance measurement

Use local Playwright production workflows with explicit backends and real Worker success evidence. Measure accepted sizes and record admission rejections, total time and resource proxies. Do not change the 32767px ceiling for benchmarks. Keep large typed arrays in the browser and return summaries. Every rendered record binds the request ID to a successful Worker response, actual backend, zero fallback and output SHA-256. WebGL2 additionally requires float color-buffer support and successful FLOAT readback. Preserve raw records in this task outside Playwright's cleaned output directories; run production acceptance from uninstrumented builds.

## Boundaries

No Docker, deployment, public release, license change or asset-rights decision. Do not commit/push without explicit authorization. Existing user recipes and valid results must survive failure and cleanup.
