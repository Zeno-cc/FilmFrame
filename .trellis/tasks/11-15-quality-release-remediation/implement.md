# Implementation plan

- [x] Add and test actual budget compatibility checks before upgrade and rollback without mutating configuration.
- [x] Add Worker timeout type and prevent heavy-strip main-thread retry, with regression coverage.
- [x] Apply compatible dependency upgrades and verify the spectral checker and browser matrix.
- [x] Remove verified zero-consumer helpers/local metadata and confirm build output.
- [x] Measure local 10/20/36-frame CPU/WebGL2 strips and record constraints before further optimization.
- [x] Run full frontend/access/operations/browser checks and independent review; record open owner/legal decisions.

## Validation

```bash
npm run check:all
npm run test:release-contract
npm run test:updater
npm run test:provenance
npm run test:backup
npm run verify:deployment
npm run test:e2e:preview
npm run test:e2e -- --project=firefox --project=webkit
git diff --check
```

Do not run Docker or deployment. Browser/GPU groups run serially. A skipped physical-device, live proxy or legal/rights check remains explicitly unverified, not a pass.

## Completion evidence

Final development Chromium completed **114/114 passed**, including the
source-module GPU diagnostics and explicit WebGL2 failure behavior. Production
Chromium completed **90 passed, 10 intentionally skipped development-only
diagnostics**; those diagnostics ran in the development matrix. Separate
Firefox/WebKit compatibility completed **2 passed**. `git diff --check` passed.

Frontend Vitest completed **331 passed across 38 files**. Access completed
**121 passed**. Updater completed **69 passed, 1 skipped Linux-only
SO_PEERCRED case**, plus install-layout import validation. Release contracts
completed **22 passed**, provenance **7 passed** with 17 local SHA-256 entries
validated, and backup boundaries **4 passed**. Deployment static checks passed
with the live OpenResty check explicitly skipped. Official-registry audits for
both frontend and Access report zero known advisories after bounded patches.

Local measurements are comparison evidence, not hardware benchmarks: the host
was running unrelated workloads. Earlier before/after timings did not bind
Worker success, actual backend and fallback evidence, so they are not used as
performance proof. The current script requires one successful Worker response,
matching actual backend, zero fallback, and (for WebGL2) float color-buffer
support and successful FLOAT readback. Raw records are written to this task's
`measurement-<backend>-<count>-<cache>.json` files, outside Playwright's
cleaned output directories. The 36-frame high-quality case remains blocked by
the 32767-pixel edge / about 114.2 MiB Canvas safety boundary; no limit was
relaxed for measurement.

Eight rendered records cover CPU/WebGL2 at 10/20 frames with cold/warm cache.
Every record has a successful matching Worker ID, requested/measured backend,
zero fallback and stable same-backend RGBA SHA-256. CPU 10-frame times were
50501/57818 ms and 20-frame times 90111/98824 ms. WebGL2 10-frame times were
9586/9598 ms with 12 successful FLOAT readbacks; 20-frame times were
17591/18002 ms with 22 readbacks. The GPU records require real WebGL2 and
float color-buffer support, not only a renderer-name string. Four 36-frame
records report the about 114.2 MiB browser safety-budget rejection with zero
Worker requests and are skipped, not counted as performance passes.

Remaining unverified work: real production SQLite/old-release/systemd upgrade
and rollback, physical iPhone Safari and Android Chrome, live OpenResty and
Access-proxy checks, and owner/legal approval for project licensing,
historical assets, spectral constants, corresponding source and LGPL/libheif.
Full SpektraLab model migration and native pixel equivalence are not claimed.
No commit, push, deployment or public release was performed.

## Follow-up: Canvas budget default raised to 6 GiB

Requested after the remediation work: make the default Canvas admission budget
6 GiB.

- `services/renderBudget.ts`: `DEFAULT_MAX_CANVAS_MIB` 700 → 6144. The 32,767 px
  edge ceiling already caps one RGBA Canvas at about 4095.8 MiB, so the larger
  default removes the budget gate while the edge and working-set limits remain.
- `services/runtimeConfig.ts` and `server/access/src/runtimeConfig.ts`: upper
  bound 4096 → 6144, default 6144, minimum unchanged at 128.
- `server/access/migrations/008_expand_render_budget_to_6gib.sql`: rebuilds the
  singleton table with the wider CHECK constraint, then raises only the
  untouched historical seed (`max_canvas_mib = 700 AND updated_at = 0`) to 6144.
  An administrator-saved value is preserved byte for byte.
- `ops/release/release-input.json`: `schemaTo` 7 → 8 to match the new latest
  migration.
- `ops/updater/filmframe_updater/deploy.py`: the fixed capability boundary stays
  `FIRST_6_GIB_VERSION = "1.5.0"`; the limit is now 6144 at or above it and 2048
  below it. No version was inferred from the installed manifest.
- README, handoff, project docs, Trellis specs and updater README updated.

Migration 008 was exercised on real SQLite files, not only in-memory fixtures:

| Case | Result |
| --- | --- |
| Fresh install | schema 1–8 applied, seed reads 6144 MiB |
| Schema 7 database at the untouched 700 MiB seed, then upgraded | 6144 MiB, `updatedAt` stays 0 |
| Schema 7 database with an administrator value 900 MiB at `updatedAt=1700000000000`, then upgraded | stays 900 MiB and the original timestamp |
| `updateRenderBudgetSetting(6144)` / `(6145)` | accepted / `RangeError` |

Browser evidence for the raised ceiling, added to
`tests/e2e/render-budget-admission.spec.ts`:

- A `5000 MiB` runtime-config response is accepted with no fallback notice; the
  former 4096 ceiling would have rejected it.
- A `6145 MiB` response falls back to the bounded 6144 MiB config and shows the
  recoverable notice.

Both pass. The existing 128 MiB strip-blocking case still passes, so the lower
bound and pre-allocation rejection are unchanged.

Re-validation after the change: `npm run check:all` completed with frontend
**331 passed across 38 files** and Access **121 passed, 0 failed**; the build
succeeded. Updater completed **69 passed, 1 skipped**. Release contracts
**22 passed**, provenance **7 passed**, `verify:provenance` exited 0 while still
reporting the same unresolved owner/legal blockers, and `verify:release-input`
accepted version 1.4.12 at schema 8. `git diff --check` is clean.

The full Chromium e2e suite was first run with Playwright's bundled headless
Chromium, which reports `SwiftShader` as the unmasked renderer. The spectral
backend deliberately rejects software renderers, so 11 WebGL2-dependent cases
failed with `WebGL2 spectral backend is unavailable`; they are an environment
artifact, not a regression. Re-running those three specs against the installed
Google Chrome passed **28/28**, and the complete suite then passed **114/114 in
6.9 minutes** on the same real Chrome (`CHROME_PATH`).

Still not verified: a real schema-7 production database upgraded in place, the
real old-release/systemd upgrade and automatic rollback, physical iPhone
Safari and Android Chrome, and live OpenResty/Access-proxy checks.
