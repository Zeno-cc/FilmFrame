# FilmFrame v1.3 Technical Design

## Design Summary

v1.3 is a hardening release. It adds missing release evidence, introduces a
small cross-browser contract, formalizes image-memory terminology, and extracts
only the implementation boundaries directly exercised by that work.

The public application architecture remains:

```text
React session controller
  -> pure workflow/admission services
  -> filmWorkerClient capability facade
       -> Worker + OffscreenCanvas when supported
       -> filmEngine main-thread Canvas fallback
  -> Blob/Object URL artifacts owned by App

Git tag
  -> trusted GitHub Release workflow
       -> Node/browser/proxy/backup/release gates
       -> updater Python + install-layout gates (new)
       -> immutable bundle/images + attestations
```

## 1. Release Gate Design

Add a named updater validation step after dependency/browser setup and before
`Run release quality gates` or artifact construction. It runs:

```bash
PYTHONPATH=ops/updater python3 -m unittest discover \
  -s ops/updater/tests -p 'test_*.py' -v
bash ops/updater/tests/test-install-layout.sh
```

Ubuntu is authoritative for Unix sockets, `SO_PEERCRED`, and system layout.
macOS remains useful for pure Python tests but is not release evidence for
Linux-only boundaries.

No updater source or protocol change is required merely to add the gate.

## 2. Browser Project Design

Keep the existing Chrome project as the complete regression project. Add a
focused spec, `tests/e2e/browser-compatibility.spec.ts`, and configure Firefox
and WebKit projects to run only that spec. The compatibility spec uses bounded,
repository-owned synthetic fixtures and tests observable behavior rather than
implementation-specific Worker availability.

Minimum journey:

1. open an empty darkroom;
2. upload one supported image without a network upload;
3. process with a registered real-135 stock;
4. open preview and switch before/after;
5. rotate and process the current image;
6. confirm a current downloadable artifact;
7. add a second image and generate or export a multi-image result.

The Release workflow installs Chromium, Firefox, and WebKit. WebKit emulation
is explicitly labeled as desktop automation, not physical iPhone evidence.

## 3. Physical Device Evidence

Add a maintained smoke-runbook and a redacted evidence template under
`docs/project/`. The runbook uses the production URL because invitation,
download, Web Share/file handling, and browser memory differ from local desktop
automation.

The evidence record contains no photos or credentials. Required fields are:

- release candidate revision;
- device model and OS major/minor;
- browser version;
- test time and operator;
- each smoke step as pass/fail;
- redacted notes and follow-up issue reference.

Physical evidence is a release authorization input, not a source-controlled
secret. A sanitized completed record may be committed; raw screenshots and
network captures remain outside Git when they contain user data.

## 4. Memory Contract Design

Maintain separate values and names for:

| Measurement | Existing contract |
| --- | --- |
| Upload bytes | warning at 25 MiB; not the Canvas ceiling |
| Source edge | upload warning above 8,000 px |
| Decoded source | `width * height * 4` estimated RGBA bytes |
| Batch working set | decoded source estimate times processing multiplier, plus strip output |
| Single Canvas | 32,767 px edge and administrator-configurable 128-2,048 MiB estimated RGBA ceiling; 700 MiB default |
| ZIP input | warning at 192 MiB, block above 256 MiB |

`services/renderBudget.ts` stays the Canvas authority.
`services/batchAdmission.ts` stays the operation-level authority. A new focused
service may own App-specific settings/frame/strip estimation and feedback, but
must call these authorities rather than duplicate constants.

### Runtime configuration path

Add an explicit singleton Access table in migration `005` for the render
budget. Store an integer MiB value, an update timestamp, and no generic JSON or
unrelated application settings. Seed 700 MiB so a migrated installation keeps
the current behavior.

The existing administration host gains a small Settings view and two APIs:

- an authenticated read returning the current value and update time;
- a CSRF-protected, strictly validated write accepting an integer from 128
  through 2,048 MiB and emitting a redacted audit event.

The public FilmFrame host gains an exact-path, session-protected read endpoint.
OpenResty routes only that path to Access after the normal invitation session
check; all other application assets continue to come from the static backend.
The response contains the effective byte ceiling and no administration data.

At application startup, a focused runtime-configuration service fetches and
validates the value. It converts MiB to exact bytes/pixels and supplies
`RenderBudgetLimits` to both single-output and strip admission paths. A fetch
or validation failure uses the compiled 700 MiB default and exposes a
recoverable status to the UI. Configuration is intentionally snapshot-based:
an administrator change takes effect when a page is next opened or refreshed,
without polling, WebSocket, or cross-tab synchronization.

CI boundary tests cover the minimum, default, maximum, and invalid configured
values using dimensions and byte counts, not giant allocations. The
manual stress runbook uses representative source files and records the first
warning/block/failure point per physical browser.

## 5. `App.tsx` Boundary

Extract pure App-local admission responsibilities to a focused service, such
as `services/renderAdmission.ts`:

- settings for a roll position;
- task selection/currentness inputs;
- exact strip Canvas-size estimation;
- actionable admission feedback mapping.

Use a separate small `services/runtimeConfig.ts` for transport/schema/default
logic. Do not teach `renderBudget.ts` about HTTP or React. `App.tsx` receives
one validated limits object and retains only the lifecycle/UI state needed to
delay expensive work until configuration is ready.

These functions receive explicit values and do not access React state, refs,
DOM nodes, or Object URLs. Existing focused tests move or expand with the new
surface.

Do not extract `processAll`/`retryImage` until a controller API can preserve:

- latest-state refs;
- generation cancellation;
- ID-based result merge;
- replaced/late URL revocation;
- stop without ordinary-error fallback;
- UI progress callbacks.

If that boundary proves larger than the v1.3 change, leave orchestration in
`App.tsx` and record the deferred extraction. Moving code without a stable
ownership API is not a v1.3 acceptance goal.

## 6. `filmEngine.ts` Boundary

Extract browser Canvas mechanics to `services/canvasRuntime.ts`:

- load an `HTMLImageElement` from a same-origin/Object URL;
- export an `HTMLCanvasElement` to Blob/Object URL with a fixed failure path;
- rotate output Canvas while preserving opaque background behavior;
- restore output orientation using shared transform geometry;
- luminance-mask conversion only if it remains tightly coupled and testable.

`filmEngine.ts` retains film policy, template selection, drawing order, texture,
markings, and public rendering functions. `filmWorker.ts` remains a separate
OffscreenCanvas implementation and continues sharing geometry/policy helpers,
not DOM Canvas objects.

## 7. Compatibility And Rollback

- Migration `005` adds only the render-budget singleton table and seed row.
  Release metadata becomes schema 4 -> 5 and remains backward-compatible:
  v1.2 ignores the additional table during rollback.
- Public TypeScript render entry points and `FilmSettings` are unchanged.
- Existing stored preferences/recipes require no migration.
- Each extraction is a mechanical commit-sized step. Rollback restores imports
  without changing user data or deployment state.
- Browser project changes can be reverted independently if a browser exposes a
  genuine unsupported contract; any explicit support reduction must be
  documented rather than hidden by skipping tests.

## Risks

- Browser engines may differ in Canvas-to-Blob timing, download behavior, font
  metrics, or Worker capability. Assertions must validate workflow contracts,
  not randomized pixels.
- Physical-device memory evidence is not deterministic. Record device context
  and conservative behavior rather than declaring a universal RAM capacity.
- Mechanical extraction can accidentally change singleton caches or URL
  cleanup. Preserve module-level cache ownership and verify late/fallback paths.
- Running multiple Playwright suites against one reused local server can cause
  false failures. CI projects must use Playwright's managed server lifecycle.
- A configured value cannot override browser-specific Canvas allocation caps.
  The administration UI and runbook must describe it as a maximum admission
  budget, not promised usable RAM.
- Routing the runtime endpoint through the static catch-all would return the
  SPA instead of JSON or bypass the intended session boundary. Proxy tests must
  cover its exact-path routing and wrong-host behavior.
