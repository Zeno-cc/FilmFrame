# FilmFrame v1.3 Reliability And Compatibility

## Goal

Ship a release-ready FilmFrame v1.3.0 that makes the trusted updater, the
browser image workflow, and the documented memory limits independently
verifiable. Improve maintainability only along the code paths changed for
v1.3, preserving the browser-only photo boundary and all current rendering,
artifact ownership, and invitation behavior.

## Background

- v1.2.0 is running in production with Access schema 4, healthy containers,
  and verified loopback, direct-origin, and public HTTPS probes.
- The trusted Release workflow runs the Node, browser, proxy, backup, and
  release-contract gates, but does not run `ops/updater/tests` or the updater
  install-layout test (`.github/workflows/release.yml:63`).
- Playwright currently defines one Chrome project and runs the complete 40-test
  suite only there (`playwright.config.ts:16`). Firefox, WebKit, and physical
  mobile-device evidence are not part of the release contract.
- The 700 MiB value is currently a hard-coded estimated RGBA allocation
  ceiling for one Canvas, not an accepted upload file size
  (`services/renderBudget.ts:22`). The Access service has no persisted runtime
  setting or public runtime-configuration endpoint today. Batch admission
  separately warns at a 512 MiB estimated working set, blocks at 1 GiB, and
  protects ZIP input at 192/256 MiB (`services/batchAdmission.ts:13`).
- `App.tsx` remains the workflow controller and is approximately 1,632 lines.
  `services/filmEngine.ts` remains the main-thread rendering facade and is
  approximately 1,453 lines. These are maintainability signals, not approval
  for a behavior-changing rewrite.

## Requirements

### R1. Ubuntu Updater Release Gate

- The trusted tag Release job must run the complete updater Python unit suite
  and `ops/updater/tests/test-install-layout.sh` on Ubuntu before building or
  publishing release artifacts.
- A failed or skipped Linux socket/peer-credential test must block the Release.
- Existing Node, proxy, backup, browser, manifest, digest, SBOM, provenance,
  and attestation gates must remain intact.

### R2. Focused Cross-Browser Contract

- Keep the complete existing E2E suite on Chrome.
- Add one focused browser-compatibility journey for Firefox and WebKit that
  covers local upload, single-image processing, before/after preview,
  navigation/rotation where supported, and download readiness.
- The focused journey must accept either Worker rendering or the documented
  main-thread fallback without weakening output-currentness or privacy checks.
- The Release job must install every Playwright browser used by its projects.
  It must not multiply all 40 Chrome-specific tests across every engine.

### R3. Physical Mobile Smoke Evidence

- Before creating the v1.3.0 tag, execute the same production smoke journey on
  at least one physical iPhone Safari and one physical Android Chrome device.
- The journey must cover invitation/session entry, local photo selection,
  processing, preview, rotation, single-image download, and one multi-image or
  strip export. Network inspection or a controlled proxy check must confirm
  that photo bytes are not uploaded.
- A desktop WebKit run, device emulation, or responsive viewport test may
  support debugging but cannot replace physical-device evidence.
- Store only redacted evidence: device/browser versions, time, result, and
  failure notes. Never store an invitation code, Cookie, Access JWT, photo, or
  administrator identity token.

### R4. Explicit Image-Memory Contract

- Preserve 700 MiB as the default maximum estimated RGBA bytes for one Canvas,
  but make that global limit administrator-configurable from the existing
  Access administration site.
- Accept whole-MiB values from 128 through 2,048. The administration UI must
  show the active value, its scope, the safe range, and that a higher value is
  a guardrail rather than a guarantee that a browser can allocate the Canvas.
- Persist the setting in the Access SQLite database. Administrator reads and
  writes must retain the existing Cloudflare Access identity check, exact-host
  policy, CSRF protection, strict JSON validation, rate limiting, and audit
  event behavior.
- Expose only the effective public render budget through an exact-path,
  same-origin read endpoint protected by the existing invitation session. It
  must expose no administrator identity, invitation data, or other secrets.
- The frontend must load the effective budget before admitting expensive
  rendering. A saved change applies to newly opened or refreshed application
  pages; v1.3 does not add live push into already-open tabs.
- If runtime configuration cannot be loaded, retain the built-in 700 MiB
  default and surface a recoverable configuration status rather than accepting
  an unbounded Canvas. Documentation and user-facing copy must not describe
  the value as a file-upload limit.
- Keep file bytes, decoded source pixels, estimated processing working set,
  strip Canvas, and ZIP input as separate measurements.
- Add boundary tests immediately below, at, and above the source-pixel,
  working-set, Canvas edge/pixel, and ZIP thresholds.
- Add a repeatable browser stress protocol using bounded fixtures. CI must not
  allocate a 700 MiB Canvas merely to prove a constant; physical devices must
  validate representative 12 MP, high-resolution, multi-image, and strip
  cases without crashing or silently producing stale output.
- Blocked and warning states must remain actionable and must not begin an
  expensive render before admission succeeds.

### R5. Incremental `App.tsx` Decomposition

- Move the pure render-settings, strip-size estimation, and admission-feedback
  responsibilities touched by R4 into focused service modules with unit tests.
- Keep runtime-configuration fetching, validation, defaulting, and byte/MiB
  conversion outside `App.tsx`; `App.tsx` may own only the resulting loading,
  ready, or recoverable-fallback UI state.
- Extract processing lifecycle code only if it has a clear controller API for
  generation, cancellation, and cleanup. Do not create a hook solely to reduce
  line count and do not introduce a state-management dependency.
- `App.tsx` remains the owner of session state, UI state, current ordering, and
  Object URL ownership. Late-result suppression, immutable ID-based merges,
  stale artifacts, stop behavior, and cleanup must remain unchanged.

### R6. Incremental `filmEngine.ts` Decomposition

- Move the cross-browser main-thread Canvas runtime used by v1.3 (image load,
  Canvas-to-Blob export, rotation/orientation, and closely coupled helpers) to
  a focused service module.
- Keep the public `processImage`, `processImageReal135`, and
  `generateFilmStrip` contracts stable.
- Do not combine the DOM Canvas and OffscreenCanvas implementations through
  unsafe casts. Share only contracts that are genuinely common.
- Main-thread and Worker fallback output must preserve dimensions, MIME,
  currentness keys, rotation, template geometry, and Object URL cleanup.

### R7. Version And Maintained Documentation

- Update maintained project documentation for the supported browser matrix,
  physical-device smoke procedure, memory terminology, and extracted module
  ownership.
- Prepare repository version metadata for 1.3.0 with Access schema 4 -> 5. The
  new migration owns the persisted render-budget setting and must remain
  backward-compatible with the v1.2 Access service, which ignores the new
  table.
- Do not create or push the v1.3.0 tag, publish a GitHub Release, or deploy to
  production as part of repository implementation. Those remain explicit
  follow-up operations after all acceptance evidence is complete.

## Acceptance Criteria

- [ ] The Ubuntu trusted Release job fails when any updater Python or install-layout test fails and runs those checks before artifact publication.
- [ ] The existing complete Chrome E2E suite passes without losing coverage.
- [ ] The focused compatibility journey passes in Playwright Firefox and WebKit.
- [ ] Redacted physical-device smoke records show a successful iPhone Safari and Android Chrome production journey before the v1.3.0 tag is authorized.
- [ ] Unit tests cover every documented Canvas, source-pixel, working-set, strip, and ZIP boundary without allocating a 700 MiB CI Canvas.
- [ ] The authenticated administrator can read and save a 128-2,048 MiB global Canvas budget; invalid, unauthenticated, wrong-host, wrong-origin, and malformed writes are rejected and audited consistently with existing administration writes.
- [ ] A newly opened or refreshed invited application session uses the saved Canvas budget for single-image and strip admission, while runtime-config failure remains bounded by the 700 MiB built-in default.
- [ ] Browser stress checks produce warnings or blocks before unsafe rendering and preserve completed/current artifacts after stop or failure.
- [ ] `App.tsx` no longer owns pure admission calculations or admission copy; its state and artifact-ownership contracts remain unchanged.
- [ ] `filmEngine.ts` delegates the extracted main-thread Canvas runtime while its public rendering facade remains source-compatible.
- [ ] Chrome, Firefox, WebKit, iPhone Safari, and Android Chrome paths keep photos local to the device.
- [ ] `npm run check:release`, updater tests, release-contract tests, deployment verification, and `git diff --check` pass.
- [ ] README and maintained engineering/rendering documentation accurately describe v1.3 behavior and limits.

## Out Of Scope

- HEIC/RAW/Live Photo/video decoding, cloud projects, photo upload, server-side
  rendering, ordinary-user accounts, or cross-device photo recovery.
- Access pagination, multi-administrator RBAC, email delivery, payment, or a
  new invitation policy editor.
- Redux/Zustand/React Query, a router, a full `App.tsx` rewrite, or a full
  main-thread/Worker renderer rewrite.
- Changing established film appearance, real-135 template assets, export
  dimensions, random texture behavior, or output defaults.
- Making upload bytes, decoded-source, batch working-set, ZIP, or maximum-edge
  thresholds administrator-configurable; v1.3 configures only the single
  Canvas RGBA-byte ceiling.
- Live configuration push, per-user/per-device limits, multiple administrator
  profiles, or storing the render limit in browser preferences.
- Rotating operational credentials inside repository files. Previously exposed
  SSH, Cloudflare, and Google credentials must be revoked separately and never
  recorded in task artifacts.

## Release Constraint

Repository implementation may reach release-candidate status without attached
physical devices, but v1.3.0 is not complete and must not be tagged until both
physical-device smoke records satisfy R3.
